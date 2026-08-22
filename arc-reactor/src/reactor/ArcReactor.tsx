import { useEffect, useRef, useState } from 'react'
import s from './reactor.module.css'
import { useCharge, TUNING, type Phase } from './useCharge'
import { createRenderer, type Frame } from './gl/renderer'

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
  /** 마우스 시점이 목표를 따라가는 속도 (1/초). 낮을수록 물렁하다 */
  tiltFollow: 5.0,
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
  const pin = useRef(pinnedCharge())
  const pctRef = useRef<HTMLSpanElement>(null)
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
     바로 반영하면 뻣뻣하고, 따라가게 하면 무게가 생긴다. */
  const tiltTarget = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      tiltTarget.current.x = (e.clientX / window.innerWidth) * 2 - 1
      tiltTarget.current.y = (e.clientY / window.innerHeight) * 2 - 1
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
               shakeX: 0, shakeY: 0, tiltX: 0, tiltY: 0 })

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
  })

  const { phase, reset } = useCharge((p, _ph, dt) => {
    /* 이 아래는 초당 60번 도는 시뮬레이션이다. 값을 갈아끼우는 게 목적이라
       일부러 객체를 제자리에서 고친다 — 새 객체를 만들면 프레임마다 쓰레기가 쌓인다.
       린터는 "이펙트에서 쓰는 값을 고치지 마라"고 경고하는데, 그 규칙은
       렌더의 순수성을 지키려는 것이고 여기는 렌더 밖(rAF 콜백)이라 해당 없다. */
    /* oxlint-disable react/immutability */
    const f = frame.current
    f.time += dt
    if (pin.current !== null) p = pin.current      // 튜닝용 고정값
    f.charge = p

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
  })

  return (
    <div className={s.scene} data-phase={phase}>
      <canvas ref={canvasRef} className={s.canvas} aria-hidden="true" />

      {glFailed && (
        <p className={s.fallback}>
          이 브라우저에서 WebGL을 못 켰다.<br />
          하드웨어 가속을 켜거나 다른 브라우저에서 열어 봐라.
        </p>
      )}

      <div className={s.readout}>
        <span ref={pctRef} className={s.pct}>  0</span>
        <span className={s.pctUnit}>%</span>
      </div>

      {phase === 'complete' && (
        <div className={s.done}>
          <svg className={s.helloSvg} viewBox="0 0 720 140" role="img" aria-label="hello world">
            <text x="360" y="96" className={s.helloText}>hello world</text>
          </svg>
          <button type="button" className={s.again} onClick={reset}>다시</button>
        </div>
      )}

      <p className={s.hint} data-phase={phase}>
        {phase === 'idle' && '스크롤해라'}
        {phase === 'charging' && '멈추지 마라'}
        {phase === 'decaying' && '빠진다'}
      </p>

      <footer className={s.meta} aria-hidden="true">
        충전 {TUNING.chargeSeconds}s · 감쇠 {TUNING.decaySeconds}s
      </footer>
    </div>
  )
}

export type { Phase }
