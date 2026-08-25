import { useEffect } from 'react'
import { SITES } from '../dark/sites'
import s from './landing.module.css'

/* 불이 켜진 뒤 나오는 진짜 페이지. */

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
          단서 여덟 개는 전부 실제로 가 볼 수 있는 곳이다.
          하나같이 쓸모가 없고, 하나같이 오래 붙잡는다.
        </p>
      </section>

      <section className={s.block}>
        <h2 className={s.h2}>찾은 것 여덟</h2>
        {/* ⚠️ 목록을 손으로 베껴 두지 않는다. 출처는 sites.ts 한 곳이다.
            예전에 베껴 뒀다가 방 안의 글을 고치자 조용히 어긋났다. */}
        <ol className={s.lines}>
          {SITES.map((site, i) => (
            <li key={site.id} style={{ '--i': i } as React.CSSProperties}>
              <a href={site.url} target="_blank" rel="noopener noreferrer">
                <b>{site.name}</b>
                <span>{site.what}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section className={s.block}>
        <h2 className={s.h2}>안에서 무슨 일이 있었나</h2>
        <dl className={s.facts}>
          <div><dt>어둠</dt><dd>WebGL 프래그먼트 셰이더 한 장. 페이지 위에 덮인 가림막이고, 알파만 계산한다</dd></div>
          <div><dt>그림자</dt><dd>픽셀마다 빛을 향해 걸어가며 물체를 얼마나 스쳤는지 잰다. 스칠수록 흐려져 반그림자가 생긴다</dd></div>
          <div><dt>기억</dt><dd>88칸짜리 격자에 빛이 닿은 세기를 적어 두고 0.4초마다 절반씩 지운다. 지나온 자리는 1초 남짓이면 어둠이 도로 삼킨다</dd></div>
          <div><dt>글</dt><dd>처음부터 끝까지 진짜 HTML. 어둠에 가려 있어도 복사되고 검색되고 낭독된다</dd></div>
          <div><dt>그림</dt><dd>단서 카드의 그림 여덟 장은 SVG 로 직접 그렸다. 남의 화면을 퍼오지 않고, 저장소에 그림 파일도 안 쌓인다</dd></div>
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
