import { useEffect, useRef, useState } from 'react'

/* ============================================================
   충전 시뮬레이션.

   이 훅은 게임의 Update() 루프와 같은 일을 한다:
     - 매 프레임 dt(경과 시간)를 구하고
     - 입력이 있으면 충전, 없으면 감쇠
     - 결과를 render 콜백으로 넘긴다

   ⚠️ 핵심 설계 — 진행률 p 는 React state 가 아니다.
   초당 60번 바뀌는 값을 useState 에 담으면 초당 60번 리렌더가 돈다.
   p 는 useRef 에 두고, 화면에는 render 콜백이 DOM 에 직접 쓴다.

   React state 로 두는 것은 "국면(phase)"뿐이다 —
   idle / charging / decaying / complete. 이건 어쩌다 한 번 바뀐다.

   즉: 시뮬레이션은 ref + rAF, 화면 구조는 React.
       Unity 로 치면 Update() 안에서 Transform 을 직접 만지는 것과,
       오브젝트를 Instantiate 하는 것의 차이다.
   ============================================================ */

export type Phase = 'idle' | 'charging' | 'decaying' | 'complete'

/** 손으로 만져 가며 맞추는 숫자들. 전부 여기 모아 둔다. */
export const TUNING = {
  /** 계속 굴렸을 때 0 → 100% 에 걸리는 시간(초) */
  chargeSeconds: 8,
  /** 손을 뗐을 때 현재 값과 무관하게 0 까지 떨어지는 시간(초) */
  decaySeconds: 3,
  /** 이 시간(ms) 안에 입력이 없으면 "손 뗐다"로 본다 */
  inputGraceMs: 120,
  /** 트랙패드 관성 스크롤의 꼬리를 입력으로 안 세기 위한 최소 델타 */
  wheelThreshold: 1.5,
}

export function useCharge(
  render: (p: number, phase: Phase, dt: number) => void,
  /** 시작 진행률. 튜닝용 — ?charge=1 로 완료 화면에 바로 들어갈 때 쓴다. */
  initialCharge = 0,
) {
  const startPhase: Phase = initialCharge >= 1 ? 'complete' : 'idle'
  const [phase, setPhase] = useState<Phase>(startPhase)

  /* render 는 매 렌더마다 새 함수다. 이걸 의존성에 넣으면
     루프가 계속 다시 붙는다. ref 에 최신 것만 담아 둔다.
     ⚠️ 렌더 중에 ref 를 쓰면 안 된다(렌더는 순수해야 한다). 이펙트에서 갱신한다. */
  const renderRef = useRef(render)
  useEffect(() => { renderRef.current = render })

  const pRef = useRef(initialCharge)
  const lastInputRef = useRef(Number.NEGATIVE_INFINITY)
  const phaseRef = useRef<Phase>(startPhase)

  useEffect(() => {
    const markInput = () => { lastInputRef.current = performance.now() }

    /* passive:false 여야 preventDefault 가 먹는다.
       안 막으면 브라우저가 페이지를 스크롤하려 들고, 모바일에서는
       주소창이 숨었다 나왔다 하면서 화면이 튄다. */
    const onWheel = (e: WheelEvent) => {
      // 다 채운 뒤에는 진짜 페이지가 열린다. 스크롤을 브라우저에 돌려준다.
      if (phaseRef.current === 'complete') return
      e.preventDefault()
      if (Math.abs(e.deltaY) >= TUNING.wheelThreshold) markInput()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (phaseRef.current === 'complete') return
      e.preventDefault(); markInput()
    }

    /* 휠만 받으면 키보드 사용자는 이 페이지를 아예 못 쓴다.
       Space / ↓ / PageDown 을 누르고 있어도 충전되게 한다. */
    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current === 'complete') return
      if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault()
        markInput()
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('keydown', onKeyDown)

    const applyPhase = (next: Phase) => {
      if (phaseRef.current === next) return   // 같은 국면이면 리렌더 안 시킨다
      phaseRef.current = next
      setPhase(next)
    }

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      /* dt 상한. 탭을 다른 데 갔다 오면 now 가 몇 초씩 뛰는데,
         그대로 곱하면 한 프레임에 100% 가 차 버린다. */
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      if (phaseRef.current === 'complete') {
        renderRef.current(1, 'complete', dt)
        raf = requestAnimationFrame(tick)
        return
      }

      const hasInput = now - lastInputRef.current < TUNING.inputGraceMs

      /* 여기가 전부다.
         충전이든 감쇠든 "초당 얼마"에 dt 를 곱해 더한다. */
      const rate = hasInput
        ? 1 / TUNING.chargeSeconds
        : -1 / TUNING.decaySeconds

      const p = Math.min(1, Math.max(0, pRef.current + rate * dt))
      pRef.current = p

      if (p >= 1) applyPhase('complete')
      else if (hasInput) applyPhase('charging')
      else if (p > 0) applyPhase('decaying')
      else applyPhase('idle')

      renderRef.current(p, phaseRef.current, dt)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  const reset = () => {
    pRef.current = 0
    lastInputRef.current = Number.NEGATIVE_INFINITY
    phaseRef.current = 'idle'
    setPhase('idle')
  }

  return { phase, reset }
}
