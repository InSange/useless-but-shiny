import { useEffect } from 'react'
import { SECRETS } from '../dark/room'
import s from './landing.module.css'

/* 불이 켜진 뒤 나오는 진짜 페이지. */

/* ⚠️ 손으로 베껴 두지 않는다.
   처음엔 여덟 줄을 여기 그대로 적어 뒀는데, room.ts 의 글을 고치자
   조용히 어긋났다 (게다가 앞 다섯 개의 line+sub 만 들어가 있었다).
   출처는 한 곳이어야 한다. */
const LINES = SECRETS.map((s) => [s.line, s.sub].filter(Boolean).join(' · '))

export default function Landing() {
  useEffect(() => {
    /* 어두운 방은 화면 한 장이라 스크롤을 잠가 뒀다.
       html 에 표시만 하고 푸는 일은 reset.css 가 한다 —
       html·body·#root 세 겹의 height: 100% 를 같이 풀어야 하기 때문. */
    document.documentElement.dataset.lit = 'true'
    return () => { delete document.documentElement.dataset.lit }
  }, [])

  return (
    <main className={s.page}>
      <section className={s.hero}>
        <p className={s.eyebrow}>쓸모없지만 화려하죠?</p>
        <h1 className={s.title}>불을 켰다</h1>
        <p className={s.lede}>
          방에는 여덟 조각의 글과, 빛을 막던 물건 여섯 개가 있었다.
          전부 찾는 데 쓴 시간만큼, 아무 쓸모도 없었다.
        </p>
      </section>

      <section className={s.block}>
        <h2 className={s.h2}>찾은 것을 순서대로</h2>
        <ol className={s.lines}>
          {LINES.map((l, i) => (
            <li key={i} style={{ '--i': i } as React.CSSProperties}>{l}</li>
          ))}
        </ol>
      </section>

      <section className={s.block}>
        <h2 className={s.h2}>안에서 무슨 일이 있었나</h2>
        <dl className={s.facts}>
          <div><dt>어둠</dt><dd>WebGL 프래그먼트 셰이더 한 장. 페이지 위에 덮인 가림막이고, 알파만 계산한다</dd></div>
          <div><dt>그림자</dt><dd>픽셀마다 빛을 향해 걸어가며 물체를 얼마나 스쳤는지 잰다. 스칠수록 흐려져 반그림자가 생긴다</dd></div>
          <div><dt>기억</dt><dd>88칸짜리 격자에 빛이 닿은 세기를 적어 두고 2.6초마다 절반씩 지운다</dd></div>
          <div><dt>글</dt><dd>처음부터 끝까지 진짜 HTML. 어둠에 가려 있어도 복사되고 검색되고 낭독된다</dd></div>
        </dl>
      </section>

      <footer className={s.footer}>
        <a href="../" className={s.back}>← 다른 쓸모없는 것들</a>
        <button type="button" className={s.again} onClick={() => location.reload()}>
          다시 어둡게
        </button>
      </footer>
    </main>
  )
}
