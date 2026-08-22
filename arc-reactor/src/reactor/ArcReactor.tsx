import { useEffect, useRef } from 'react'
import s from './reactor.module.css'
import { useCharge, TUNING, type Phase } from './useCharge'

/** 최대 충전일 때 배경이 흔들리는 최대 진폭(px) */
const MAX_SHAKE_PX = 14
/** 최대 회전 흔들림(deg) */
const MAX_SHAKE_DEG = 0.5

export default function ArcReactor() {
  /* 매 프레임 스타일을 직접 쓸 DOM 노드들. */
  const sceneRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLSpanElement>(null)

  /* 흔들림을 끌지 말지. 전정기관 문제가 있는 사람에게 화면 흔들림은
     실제로 어지럼증을 일으킨다. OS 설정을 존중한다. */
  const reduceMotion = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => { reduceMotion.current = mq.matches }
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const { phase, reset } = useCharge((p, ph) => {
    const el = sceneRef.current
    if (!el) return

    /* 게임의 "trauma" 곡선. p 를 제곱하면 낮은 구간에서는 거의 안 흔들리고
       높은 구간에서 급격히 심해진다. 선형으로 하면 처음부터 지저분하다. */
    const trauma = p * p
    const amp = reduceMotion.current ? 0 : trauma * MAX_SHAKE_PX
    const rot = reduceMotion.current ? 0 : trauma * MAX_SHAKE_DEG

    /* 카메라 셰이크는 매 프레임 무작위가 맞다. 게임에서도 그렇게 한다. */
    el.style.setProperty('--p', p.toFixed(4))
    el.style.setProperty('--shake-x', `${(Math.random() * 2 - 1) * amp}px`)
    el.style.setProperty('--shake-y', `${(Math.random() * 2 - 1) * amp}px`)
    el.style.setProperty('--shake-r', `${(Math.random() * 2 - 1) * rot}deg`)

    /* 퍼센트 숫자도 state 가 아니라 textContent 로 직접 쓴다.
       이유는 p 와 같다 — 초당 60번 리렌더할 이유가 없다. */
    if (pctRef.current) {
      pctRef.current.textContent = String(Math.round(p * 100)).padStart(3, ' ')
    }
    void ph
  })

  return (
    <div ref={sceneRef} className={s.scene} data-phase={phase}>
      {/* 뒤에서 흔들리고 밝아지는 것들 */}
      <div className={s.backdrop} aria-hidden="true">
        <div className={s.grid} />
        <div className={s.panels}>
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className={s.panel} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </div>
        <div className={s.bloom} />
      </div>

      {/* 리액터 — 이것만 안 흔들린다. 화면의 기준점이라서. */}
      <div className={s.reactor}>
        <div className={s.ring} />
        <div className={s.ringGlow} />
        <div className={s.core} />
        <div className={s.readout}>
          <span ref={pctRef} className={s.pct}>  0</span>
          <span className={s.pctUnit}>%</span>
        </div>
      </div>

      {/* 100% 도달 */}
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
