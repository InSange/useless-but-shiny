import { useEffect, useRef } from 'react'
import s from './reactor.module.css'
import { useCharge, TUNING, type Phase } from './useCharge'

/* 손으로 맞추는 연출 상수. */
const MOTION = {
  /** 최대 충전일 때 배경이 흔들리는 최대 진폭(px) */
  maxShakePx: 20,
  /** 최대 회전 흔들림(deg) */
  maxShakeDeg: 0.7,
  /** 리액터는 배경보다 덜 흔들린다 — 원근감이 생겨 "카메라가 흔들린다"로 읽힌다 */
  reactorShakeRatio: 0.35,
  /** 링 위를 도는 반짝임의 각속도(도/초). p에 따라 빨라진다 */
  spinBaseDegPerSec: 22,
  spinBoostDegPerSec: 130,
  /** 맥동(숨쉬기) 주파수(Hz). p에 따라 빨라진다 */
  pulseBaseHz: 0.7,
  pulseBoostHz: 2.6,
}

export default function ArcReactor() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const reactorRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)

  /* 흔들림을 끌지 말지. 전정기관 문제가 있는 사람에게 화면 흔들림은
     실제로 어지럼증을 일으킨다. OS 설정을 존중한다.
     ⚠️ macOS: 손쉬운 사용 → 디스플레이 → "동작 줄이기"가 켜져 있으면 여기서 꺼진다. */
  const reduceMotion = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { reduceMotion.current = mq.matches }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  /* 프레임마다 누적되는 값들. p 와 마찬가지로 state 가 아니다. */
  const spinRef = useRef(0)   // 링을 도는 반짝임의 현재 각도(deg)
  const timeRef = useRef(0)   // 맥동용 누적 시간(s)

  const { phase, reset } = useCharge((p, _ph, dt) => {
    const scene = sceneRef.current
    const reactor = reactorRef.current
    if (!scene || !reactor) return

    /* --- 흔들림 ---
       예전엔 trauma = p² 였는데, 그러면 60%까지 진폭이 5px도 안 돼서
       "안 흔들린다"로 느껴진다. 선형 성분을 섞어 초반부터 느껴지게 한다. */
    const trauma = 0.35 * p + 0.65 * p * p
    const amp = reduceMotion.current ? 0 : trauma * MOTION.maxShakePx
    const rot = reduceMotion.current ? 0 : trauma * MOTION.maxShakeDeg

    /* 카메라 셰이크는 매 프레임 무작위가 맞다. 게임에서도 그렇게 한다. */
    const sx = (Math.random() * 2 - 1) * amp
    const sy = (Math.random() * 2 - 1) * amp
    const sr = (Math.random() * 2 - 1) * rot

    /* --- 회전·맥동 누적 ---
       CSS animation 으로 하면 속도를 바꿀 때 튄다. 각도를 직접 누적하면
       속도가 매 프레임 부드럽게 변한다. (게임 루프와 같은 이유) */
    spinRef.current =
      (spinRef.current + (MOTION.spinBaseDegPerSec + p * MOTION.spinBoostDegPerSec) * dt) % 360
    timeRef.current += dt * (MOTION.pulseBaseHz + p * MOTION.pulseBoostHz)
    const pulse = Math.sin(timeRef.current * Math.PI * 2)   // -1 ~ 1

    scene.style.setProperty('--p', p.toFixed(4))
    scene.style.setProperty('--spin', `${spinRef.current.toFixed(1)}deg`)
    scene.style.setProperty('--pulse', pulse.toFixed(3))
    scene.style.setProperty('--shake-x', `${sx.toFixed(2)}px`)
    scene.style.setProperty('--shake-y', `${sy.toFixed(2)}px`)
    scene.style.setProperty('--shake-r', `${sr.toFixed(3)}deg`)

    /* 리액터는 배경의 35%만 흔들린다 — 앞뒤 깊이가 생긴다 */
    const k = MOTION.reactorShakeRatio
    reactor.style.setProperty('--shake-x', `${(sx * k).toFixed(2)}px`)
    reactor.style.setProperty('--shake-y', `${(sy * k).toFixed(2)}px`)
    reactor.style.setProperty('--shake-r', `${(sr * k).toFixed(3)}deg`)

    if (pctRef.current) {
      pctRef.current.textContent = String(Math.round(p * 100)).padStart(3, ' ')
    }
  })

  return (
    <div ref={sceneRef} className={s.scene} data-phase={phase}>
      {/* 뒤에서 흔들리고 밝아지는 것들 */}
      <div className={s.backdrop} aria-hidden="true">
        <div className={s.grid} />
        <div className={s.panels}>
          {Array.from({ length: 7 }, (_, i) => <span key={i} className={s.panel} />)}
        </div>
        <div className={s.bloom} />
      </div>

      {/* 리액터 */}
      <div ref={reactorRef} className={s.reactor}>
        <div className={s.ring} />        {/* 시계방향으로 차오르는 띠 */}
        <div className={s.ringTicks} />   {/* 띠를 눈금으로 썰어 게이지처럼 */}
        <div className={s.ringSweep} />   {/* 띠 위를 도는 반짝임 */}
        <div className={s.ringHead} />    {/* 차오르는 선두의 밝은 점 */}
        <div className={s.ringGlow} />

        <div className={s.coreTrack} />   {/* 채움 바의 "트랙" — 다 차면 여기까지 */}
        <div className={s.core} />        {/* 가운데도 원형으로 차오른다 */}
        <div className={s.coreEdge} />    {/* 차오르는 경계선 */}

        <div className={s.readout}>
          <span ref={pctRef} className={s.pct}>  0</span>
          <span className={s.pctUnit}>%</span>
        </div>
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
