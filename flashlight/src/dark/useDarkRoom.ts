import { useEffect, useRef, useState } from 'react'
import { FIND_SECONDS, PROPS, SECRETS } from './room'
import { createRenderer, type PropBox } from './gl/renderer'

/* ============================================================
   어두운 방을 굴리는 하나의 반복문.

   ⚠️ 여기서 setState 를 프레임마다 부르지 않는다.
   손전등 위치·기억 격자는 초당 60번 바뀌는데, 그때마다 리액트가
   화면을 다시 그리면 버벅인다. 값은 ref 에 담고 DOM 에 직접 쓴다.
   상태로 올리는 건 **국면이 바뀔 때**뿐이다 (찾음 / 다 찾음).
   ============================================================ */

export type Phase = 'hunting' | 'flash' | 'revealed'

/* 기억 격자의 가로 칸 수. 세로는 화면 비율에 맞춰 정한다.
   낮을수록 잔상이 뭉개진다 — 기억은 흐릿한 게 맞으므로 이 정도면 된다.
   높이면 매 프레임 도는 반복문이 제곱으로 늘어난다. */
const MEM_COLS = 88

/** 잔상이 절반으로 흐려지는 데 걸리는 시간(초). */
const MEM_HALFLIFE = 2.6

/** 발견으로 치는 밝기 문턱. 스치기만 해도 발견되면 싱겁다. */
const FIND_THRESHOLD = 0.35

type Ctx = CanvasRenderingContext2D | null

/** 선분이 (기울어진) 상자를 지나가는가 — 그림자 판정. */
function blocked(ax: number, ay: number, bx: number, by: number, p: PropBox) {
  // 상자 기준 좌표로 옮긴다. 그러면 기울기 없는 사각형 문제가 된다.
  const c = Math.cos(-p.rot), s = Math.sin(-p.rot)
  const rx = ax - p.x, ry = ay - p.y
  const qx = bx - p.x, qy = by - p.y
  const a0 = c * rx + s * ry, a1 = -s * rx + c * ry
  const b0 = c * qx + s * qy, b1 = -s * qx + c * qy

  let tmin = 0, tmax = 1
  const dx = b0 - a0, dy = b1 - a1
  // 가로 슬랩
  if (Math.abs(dx) < 1e-6) { if (Math.abs(a0) > p.hw) return false }
  else {
    let t1 = (-p.hw - a0) / dx, t2 = (p.hw - a0) / dx
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
    if (tmin > tmax) return false
  }
  // 세로 슬랩
  if (Math.abs(dy) < 1e-6) { if (Math.abs(a1) > p.hh) return false }
  else {
    let t1 = (-p.hh - a1) / dy, t2 = (p.hh - a1) / dy
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2)
    if (tmin > tmax) return false
  }
  return true
}

function cssRgb(name: string): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const m = /^#?([0-9a-f]{6})$/i.exec(v)
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

/* ?found=8 로 끝 장면만 따로 볼 수 있다.
   매번 여덟 개를 손으로 찾아야 하면 마무리 연출을 못 고친다.

   ⚠️ 이 판정을 효과(useEffect) 안에서 하고 setState 하면 안 된다.
   그러면 "어두운 방"으로 한 번 그린 뒤 곧바로 "다 찾음"으로 다시 그린다 —
   화면이 한 번 번쩍인다. 처음 상태를 만들 때 바로 정하면 그럴 일이 없다. */
function skipToEnd() {
  return Number(new URLSearchParams(location.search).get('found') ?? 0) >= SECRETS.length
}

export function useDarkRoom(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [found, setFound] = useState<string[]>(() => (skipToEnd() ? SECRETS.map((s) => s.id) : []))
  const [phase, setPhase] = useState<Phase>(() => (skipToEnd() ? 'revealed' : 'hunting'))
  /** 아직 한 번도 안 움직였나 — 안내를 띄울지 정한다 */
  const [idle, setIdle] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)

  const foundRef = useRef<Set<string>>(new Set(skipToEnd() ? SECRETS.map((s) => s.id) : []))
  const phaseRef = useRef<Phase>(skipToEnd() ? 'revealed' : 'hunting')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let renderer: ReturnType<typeof createRenderer>
    try {
      renderer = createRenderer(canvas)
    } catch (e) {
      /* 조용히 실패하면 "그냥 좀 어두운 페이지"로 보인다.
         WebGL 이 없으면 어둠도 없으니, 차라리 다 보여 주고 그렇게 말한다. */
      console.error(e)
      /* 규칙(효과 안에서 setState 금지)의 정당한 예외다.
         WebGL 컨텍스트는 canvas 가 실제로 붙은 뒤에야 만들 수 있으므로
         "만들어 봤더니 안 되더라"를 렌더 중에는 알 방법이 없다.
         이건 바깥 세상(그래픽 장치)과 맞추는 일이고, 효과가 하라는 일이 그것이다. */
      // oxlint-disable-next-line react/set-state-in-effect
      setFailed(String(e))
      return
    }

    /* ?dbg=1 — 값을 화면에 띄운다. 원격에서 스크린샷으로만 볼 수 있을 때
       콘솔보다 이게 확실하다. */
    const dbgEl = new URLSearchParams(location.search).has('dbg')
      ? Object.assign(document.createElement('pre'), {
          style: 'position:fixed;z-index:9;left:8px;top:8px;color:#7fe3c4;' +
                 'font:11px/1.5 ui-monospace,monospace;pointer-events:none;' +
                 'background:#000a;padding:6px 8px;border-radius:4px;white-space:pre',
        })
      : null
    if (dbgEl) document.body.appendChild(dbgEl)

    // --- 손전등 위치 ---
    const target = { x: innerWidth * 0.5, y: innerHeight * 0.5 }
    const light = { x: target.x, y: target.y }
    let moved = false

    const onMove = (x: number, y: number) => {
      target.x = x; target.y = y
      if (!moved) { moved = true; setIdle(false) }
    }
    const onPointer = (e: PointerEvent) => onMove(e.clientX, e.clientY)
    window.addEventListener('pointermove', onPointer, { passive: true })
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) onMove(t.clientX, t.clientY)
    }
    window.addEventListener('touchmove', onTouch, { passive: true })

    // --- 기억 격자 ---
    let memW = 0, memH = 0
    let mem = new Float32Array(0)     // 계산용 (0~1)
    let memBytes = new Uint8Array(0)  // 업로드용 (0~255)

    function fitGrid() {
      const cols = MEM_COLS
      const rows = Math.max(24, Math.min(cols, Math.round(cols * innerHeight / innerWidth)))
      if (cols === memW && rows === memH) return
      memW = cols; memH = rows
      mem = new Float32Array(cols * rows)
      memBytes = new Uint8Array(cols * rows)
    }

    // --- 발견 진행도 ---
    const dwell = new Map<string, number>()

    const voidColor = cssRgb('--color-void')
    const beamColor = cssRgb('--color-beam')

    let raf = 0
    let last = performance.now()
    let t0 = last
    let boost = 0          // 마무리에 빛이 확 세진다
    let reveal = phaseRef.current === 'revealed' ? 1 : 0

    function frame(now: number) {
      raf = requestAnimationFrame(frame)
      const dt = Math.min((now - last) / 1000, 0.05)   // 탭 복귀 시 한 번에 튀는 것 방지
      last = now
      const time = (now - t0) / 1000

      fitGrid()
      const W = innerWidth, H = innerHeight
      const unit = Math.min(W, H)

      /* 손전등은 커서를 **조금 늦게** 따라온다.
         정확히 붙어 있으면 커서에 그려진 그림처럼 보인다.
         지수 보간이라 프레임 속도가 달라도 같은 속도로 따라온다. */
      const k = 1 - Math.exp(-dt * 18)
      light.x += (target.x - light.x) * k
      light.y += (target.y - light.y) * k

      /* 켜지는 데 0.6초.

         ⚠️ 처음엔 battery += (1-battery)*k 로 적분했다가 호되게 당했다.
         그 식은 **프레임 수**에 의존한다. 탭이 뒤에 있거나 화면이 느리면
         프레임이 몇 개 안 돌아서 불이 영영 안 켜진다.
         경과 시간으로 직접 구하면 몇 프레임이 돌든 0.6초 뒤엔 1이다. */
      const battery = Math.min(1, time / 0.6) + boost


      // 화면 비율로 적은 물건을 픽셀로 편다
      const props: PropBox[] = PROPS.map((p) => ({
        x: p.x * W, y: p.y * H,
        hw: p.w * W * 0.5, hh: p.h * H * 0.5,
        rot: ((p.tilt ?? 0) * Math.PI) / 180,
      }))

      const hotR = unit * 0.11, spillR = unit * 0.34

      /** 셰이더와 같은 감쇠식. 두 곳이 어긋나면 잔상이 빛과 다른 자리에 남는다. */
      const attenAt = (px: number, py: number) => {
        const d = Math.hypot(px - light.x, py - light.y)
        const hot = 1 / (1 + Math.pow(d / hotR, 2.1))
        const spill = 1 / (1 + Math.pow(d / spillR, 1.9))
        return Math.min(1, hot * 0.86 + spill * 0.34) * battery
      }
      const shadowed = (px: number, py: number) => {
        for (const p of props) if (blocked(px, py, light.x, light.y, p)) return true
        return false
      }

      // --- 기억 갱신 ---
      const decay = Math.pow(0.5, dt / MEM_HALFLIFE)
      for (let r = 0; r < memH; r++) {
        const py = ((r + 0.5) / memH) * H
        for (let c = 0; c < memW; c++) {
          const i = r * memW + c
          let v = mem[i] * decay
          const px = ((c + 0.5) / memW) * W
          const a = attenAt(px, py)
          /* 어두운 칸은 그림자 계산을 건너뛴다. 화면 대부분이 어두우므로
             이 한 줄이 매 프레임 반복문을 몇 배로 줄인다. */
          if (a > 0.02 && !shadowed(px, py)) v = Math.max(v, a)
          mem[i] = v
          memBytes[i] = (v * 255) | 0
        }
      }

      // --- 발견 판정 ---
      if (phaseRef.current === 'hunting') {
        for (const s of SECRETS) {
          if (foundRef.current.has(s.id)) continue
          const px = s.x * W, py = s.y * H
          const lit = attenAt(px, py)
          const ok = lit > FIND_THRESHOLD && !shadowed(px, py)
          const acc = (dwell.get(s.id) ?? 0) + (ok ? dt : -dt * 1.6)
          dwell.set(s.id, Math.max(0, Math.min(FIND_SECONDS, acc)))

          // 찾는 중인 것은 서서히 드러난다 — DOM 에 직접 쓴다 (리렌더 없음)
          const el = document.querySelector<HTMLElement>(`[data-secret="${s.id}"]`)
          if (el) el.style.setProperty('--dwell', (dwell.get(s.id)! / FIND_SECONDS).toFixed(3))

          if (dwell.get(s.id)! >= FIND_SECONDS) {
            foundRef.current.add(s.id)
            setFound([...foundRef.current])
          }
        }
        if (foundRef.current.size === SECRETS.length) {
          phaseRef.current = 'flash'
          setPhase('flash')
        }
      }

      // --- 마무리: 빛이 세지고 어둠이 걷힌다 ---
      if (phaseRef.current === 'flash') {
        boost = Math.min(2.5, boost + dt * 4)
        reveal += (1 - reveal) * (1 - Math.exp(-dt * 2.4))
        if (reveal > 0.985) {
          reveal = 1
          phaseRef.current = 'revealed'
          setPhase('revealed')
        }
      } else if (phaseRef.current === 'revealed') {
        reveal = 1
      }

      if (dbgEl) {
        let mx = 0
        for (let i = 0; i < mem.length; i++) if (mem[i] > mx) mx = mem[i]
        dbgEl.textContent =
          `t ${time.toFixed(1)}  batt ${battery.toFixed(2)}\n` +
          `light ${light.x | 0},${light.y | 0}  target ${target.x | 0},${target.y | 0}\n` +
          `atten@light ${attenAt(light.x, light.y).toFixed(3)}  shadowed ${shadowed(light.x, light.y)}\n` +
          `mem ${memW}x${memH} max ${mx.toFixed(2)}\n` +
          `canvas ${canvas!.width}x${canvas!.height}  css ${canvas!.clientWidth}x${canvas!.clientHeight}`
      }

      renderer.render({
        time, lightX: light.x, lightY: light.y,
        battery, reveal, props,
        memory: memBytes, memW, memH,
        voidColor, beamColor,
      })
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('touchmove', onTouch)
      dbgEl?.remove()
    }
  }, [canvasRef])

  return { found, phase, idle, failed, total: SECRETS.length }
}

export type { Ctx }
