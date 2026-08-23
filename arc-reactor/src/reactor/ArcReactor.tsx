import { useEffect, useRef, useState } from 'react'
import s from './reactor.module.css'
import { useCharge, TUNING, type Phase } from './useCharge'
import { createRenderer, type Frame, type RGB } from './gl/renderer'
import Landing from '../landing/Landing'

/* tokens.css 의 색을 셰이더로 넘긴다.
   색을 셰이더 상수로 박아 두면 테마를 바꿀 때 두 군데를 고쳐야 한다.
   토큰이 유일한 출처여야 한다 — 색은 역할로 쓴다는 규칙의 연장이다. */
function readColor(name: string, fallback: RGB): RGB {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const m = /^#([0-9a-f]{6})$/i.exec(raw)
  if (!m) return fallback
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/* 손으로 맞추는 연출 상수. */
const MOTION = {
  /** 최대 충전일 때 카메라가 흔들리는 최대 진폭(px 환산) */
  maxShakePx: 22,
  /** 게이지 위를 도는 반짝임의 각속도(도/초). p에 따라 빨라진다 */
  spinBaseDegPerSec: 26,
  spinBoostDegPerSec: 150,
  /** 맥동(숨쉬기) 주파수(Hz). p에 따라 빨라진다 */
  pulseBaseHz: 0.7,
  pulseBoostHz: 2.6,
  /** 마우스로 시점을 얼마나 기울일까. **0 이면 완전 고정**.
      0.4 정도면 살짝 반응하고, 1 이면 원래 세기다. */
  tiltAmount: 0,
  /** 시점이 목표를 따라가는 속도 (1/초). 낮을수록 물렁하다 */
  tiltFollow: 5.0,
  /** 완료 충격파가 퍼지는 데 걸리는 시간(초) */
  completeSeconds: 1.4,
  /** 리액터가 뒤로 물러나 배경이 되는 데 걸리는 시간(초).
      빛이 화면을 덮고 있는 동안 끝나야 전환이 안 보인다. */
  recedeSeconds: 1.1,
}

/* 튜닝용 — 주소에 ?charge=0.55 를 붙이면 그 값으로 고정된다.
   연출을 손볼 때 8초씩 굴리고 있을 수는 없다. 개발 모드에서만 동작. */
function pinnedCharge(): number | null {
  if (!import.meta.env.DEV) return null
  const v = new URLSearchParams(window.location.search).get('charge')
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null
}

export default function ArcReactor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pin] = useState(pinnedCharge)
  const pctRef = useRef<HTMLSpanElement>(null)
  const liveRef = useRef<HTMLParagraphElement>(null)
  const lastBucket = useRef(-1)
  const [glFailed, setGlFailed] = useState(false)

  /* 흔들림을 끌지 말지. 전정기관 문제가 있는 사람에게 화면 흔들림은
     실제로 어지럼증을 일으킨다. OS 설정을 존중한다.
     ⚠️ macOS: 손쉬운 사용 → 디스플레이 → "동작 줄이기" */
  const reduceMotion = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { reduceMotion.current = mq.matches }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  /* 마우스 시점. 목표값만 기록하고, 실제 값은 루프에서 천천히 따라간다.
     바로 반영하면 뻣뻣하고, 따라가게 하면 무게가 생긴다.
     tiltAmount 가 0 이면 아예 안 듣는다 — 리스너도 안 단다. */
  const tiltTarget = useRef({ x: 0, y: 0 })
  useEffect(() => {
    if (MOTION.tiltAmount === 0) return
    const onMove = (e: PointerEvent) => {
      tiltTarget.current.x = ((e.clientX / window.innerWidth) * 2 - 1) * MOTION.tiltAmount
      tiltTarget.current.y = ((e.clientY / window.innerHeight) * 2 - 1) * MOTION.tiltAmount
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  /* WebGL 렌더러. 캔버스 하나에 셰이더 하나. */
  const glRef = useRef<ReturnType<typeof createRenderer>>(null)
  useEffect(() => {
    if (!canvasRef.current) return
    const r = createRenderer(canvasRef.current)
    if (!r) { setGlFailed(true); return }
    glRef.current = r

    /* 첫 프레임 전에 화면이 비지 않게 한 번 그려 둔다.
       (탭이 백그라운드면 rAF 가 아예 안 돌기 때문에도 필요하다) */
    r.render({ time: 0, charge: 0, pulse: 0, spin: 0,
               shakeX: 0, shakeY: 0, tiltX: 0, tiltY: 0,
               rising: 0, complete: 0, recede: 0,
               arc: readColor('--color-arc', [0.30, 0.72, 1.00]),
               arcHot: readColor('--color-arc-hot', [0.88, 0.97, 1.00]) })

    /* 개발 중 값 고정해 보기용 손잡이. 빌드에서는 빠진다.
       콘솔에서: __reactor.frame.charge = 0.6; __reactor.draw() */
    if (import.meta.env.DEV) {
      ;(window as unknown as Record<string, unknown>).__reactor = {
        set: (o: Partial<Frame>) => Object.assign(frame.current, o),
        draw: () => r.render(frame.current),
        setScale: r.setScale,
      }
    }

    return () => { r.dispose(); glRef.current = null }
  }, [])

  /* 프레임마다 누적되는 값들. state 가 아니다. */
  const frame = useRef<Frame>({
    time: 0, charge: 0, pulse: 0, spin: 0,
    shakeX: 0, shakeY: 0, tiltX: 0, tiltY: 0,
    rising: 0, complete: 0, recede: 0,
    arc: [0.30, 0.72, 1.00], arcHot: [0.88, 0.97, 1.00],
  })

  /* 색을 주기적으로 다시 읽는다. 매 프레임 getComputedStyle 은 비싸고,
     0.5초마다면 공짜에 가까우면서 tokens.css 를 고치는 즉시 반영된다. */
  const colorAt = useRef(-1)

  const { phase, reset, complete } = useCharge((p, ph, dt) => {
    /* 이 아래는 초당 60번 도는 시뮬레이션이다. 값을 갈아끼우는 게 목적이라
       일부러 객체를 제자리에서 고친다 — 새 객체를 만들면 프레임마다 쓰레기가 쌓인다.
       린터는 "이펙트에서 쓰는 값을 고치지 마라"고 경고하는데, 그 규칙은
       렌더의 순수성을 지키려는 것이고 여기는 렌더 밖(rAF 콜백)이라 해당 없다. */
    /* oxlint-disable react/immutability */
    const f = frame.current
    f.time += dt
    if (pin !== null) p = pin      // 튜닝용 고정값
    f.charge = p

    if (f.time - colorAt.current > 0.5) {
      colorAt.current = f.time
      f.arc = readColor('--color-arc', f.arc)
      f.arcHot = readColor('--color-arc-hot', f.arcHot)
    }

    /* 점화 반짝임은 "차오를 때"만. 빠질 때 번쩍이면 이상하다.
       뚝 끊지 않고 지수 감쇠로 부드럽게 오르내린다. */
    const wantRising = ph === 'charging' ? 1 : 0
    f.rising += (wantRising - f.rising) * (1 - Math.exp(-12 * dt))

    /* 완료 충격파 — 도달한 뒤 completeSeconds 동안 0→1 */
    f.complete = ph === 'complete'
      ? Math.min(1, f.complete + dt / MOTION.completeSeconds)
      : 0

    /* 리액터가 뒤로 물러나 배경이 된다 */
    f.recede = ph === 'complete'
      ? Math.min(1, f.recede + dt / MOTION.recedeSeconds)
      : 0

    /* 흔들림. trauma = p² 로 하면 60%까지 진폭이 5px도 안 돼서
       "안 흔들린다"로 느껴진다. 선형 성분을 섞어 초반부터 느껴지게. */
    const trauma = 0.35 * p + 0.65 * p * p
    const amp = reduceMotion.current ? 0 : trauma * MOTION.maxShakePx
    f.shakeX = (Math.random() * 2 - 1) * amp
    f.shakeY = (Math.random() * 2 - 1) * amp

    /* 회전·맥동은 각도를 직접 누적한다. CSS animation 으로 하면
       속도를 바꿀 때 튄다. (게임 루프와 같은 이유) */
    f.spin += ((MOTION.spinBaseDegPerSec + p * MOTION.spinBoostDegPerSec) * Math.PI / 180) * dt
    f.spin %= Math.PI * 2
    f.pulse = Math.sin(f.time * (MOTION.pulseBaseHz + p * MOTION.pulseBoostHz) * Math.PI * 2)

    /* 지수 감쇠로 목표를 따라간다 — 프레임 레이트가 흔들려도 같은 속도. */
    const k = 1 - Math.exp(-MOTION.tiltFollow * dt)
    f.tiltX += (tiltTarget.current.x - f.tiltX) * k
    f.tiltY += (tiltTarget.current.y - f.tiltY) * k

    glRef.current?.render(f)
    /* oxlint-enable react/immutability */

    if (pctRef.current) {
      pctRef.current.textContent = String(Math.round(p * 100)).padStart(3, ' ')
    }

    /* 스크린 리더용 진행률.
       aria-live 를 60fps 로 갱신하면 읽기가 끊임없이 끊긴다.
       10% 단위로 바뀔 때만 쓴다. */
    const bucket = Math.floor(p * 10)
    if (liveRef.current && bucket !== lastBucket.current) {
      lastBucket.current = bucket
      liveRef.current.textContent = `충전 ${bucket * 10}%`
    }
  }, pin ?? 0)

  /* 충전 중에는 페이지가 안 움직여야 하고, 다 채우면 평범한 페이지가 된다.
     ⚠️ 완료 시 '' 로 비우면 안 된다 — 인라인 스타일만 지워지고
     reset.css 의 body { overflow: hidden } 이 다시 살아나 스크롤이 잠긴다.
     'auto' 를 명시해야 한다. */
  useEffect(() => {
    document.body.style.overflow = phase === 'complete' ? 'auto' : 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [phase])

  /* Esc 로도 건너뛴다. 버튼까지 Tab 으로 가는 것조차 부담인 경우가 있다. */
  useEffect(() => {
    if (phase === 'complete') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); complete() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, complete])

  /* 다시 충전하려면 맨 위로 올려야 한다 — 안 그러면 스크롤이 내려간 채로
     게이트 화면이 떠서 아무것도 안 보인다. */
  const restart = () => { window.scrollTo(0, 0); reset() }

  return (
    <div className={s.scene} data-phase={phase}>
      <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />

      {glFailed && (
        <p className={s.fallback}>
          이 브라우저에서 WebGL을 못 켰다.<br />
          하드웨어 가속을 켜거나 다른 브라우저에서 열어 봐라.
        </p>
      )}

      {/* ── 건너뛰는 문 ──────────────────────────────────────
          8초 연속 스크롤을 못 하면 이 페이지의 내용에 닿을 방법이
          아예 없다. 그래서 이 버튼은 DOM 에서 **맨 앞**에 온다 —
          Tab 을 한 번만 눌러도 닿아야 한다.
          포커스 받을 때만 보이는 흔한 "skip link" 방식은 여기선 틀렸다.
          마우스만 쓰는 사람도 봐야 하므로 늘 보이게 둔다. */}
      {phase !== 'complete' && (
        <>
          <p className={s.srOnly}>
            이 페이지는 스크롤을 {TUNING.chargeSeconds}초 동안 멈추지 않아야 열립니다.
            바로 열려면 아래 “건너뛰고 바로 보기” 버튼을 누르거나 Esc 키를 누르세요.
          </p>
          <button type="button" className={s.skip} onClick={complete}>
            건너뛰고 바로 보기
            <kbd className={s.kbd}>Esc</kbd>
          </button>
          <p ref={liveRef} className={s.srOnly} aria-live="polite" aria-atomic="true" />
        </>
      )}

      {phase !== 'complete' && (
        <div className={s.readout}>
          <span ref={pctRef} className={s.pct}>  0</span>
          <span className={s.pctUnit}>%</span>
        </div>
      )}

      {/* 다 채우면 빛이 터져 화면을 덮었다가 걷히고, 그 아래 진짜 페이지가 있다 */}
      {phase === 'complete' && (
        <>
          <div className={s.scrim} aria-hidden="true" />
          <div className={s.flash} aria-hidden="true" />
          <Landing onReset={restart} />
        </>
      )}

      {/* 지금 무슨 일이 일어나는지. aria-hidden 은 아니다 —
          "빠진다"는 시각 정보만으로 전달되면 안 되는 상태 변화다. */}
      {phase !== 'complete' && (
        <p className={s.hint} data-phase={phase}>
          {phase === 'idle' && '스크롤해라'}
          {phase === 'charging' && '멈추지 마라'}
          {phase === 'decaying' && '빠진다'}
        </p>
      )}

      {phase !== 'complete' && (
        <footer className={s.meta} aria-hidden="true">
          충전 {TUNING.chargeSeconds}s · 감쇠 {TUNING.decaySeconds}s
        </footer>
      )}
    </div>
  )
}

export type { Phase }
