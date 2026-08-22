import s from './landing.module.css'
import { TUNING } from '../reactor/useCharge'

/* ============================================================
   충전을 끝내면 열리는 진짜 페이지.

   내용은 이 프로젝트 자신이다 — 8초를 버틴 대가가
   "아무 쓸모 없었습니다"라는 것. 그게 이 농담의 완성이다.

   구조(히어로 → 제원 → 목록 → 바닥)는 그대로 두고 글만 갈아끼우면
   다른 랜딩 페이지 템플릿에도 그대로 쓴다.
   ============================================================ */

/** null 이면 링크를 안 그린다. */
const REPO_URL: string | null = 'https://github.com/InSange/useless-but-shiny'

const SPECS = [
  { k: '셰이더', v: '프래그먼트 320줄 · SDF 레이마칭' },
  { k: '의존성', v: '0개 — React 와 WebGL 뿐' },
  { k: '충전 / 감쇠', v: `${TUNING.chargeSeconds}초 / ${TUNING.decaySeconds}초` },
  { k: '색 테마', v: '4종 — 토큰 몇 줄로 바뀐다' },
]

const TEMPLATES = [
  { name: 'Arc Reactor', note: '지금 이 페이지', state: 'live' as const },
  { name: '준비 중', note: '다음 템플릿', state: 'soon' as const },
  { name: '준비 중', note: '그다음 템플릿', state: 'soon' as const },
]

export default function Landing({ onReset }: { onReset: () => void }) {
  return (
    <main className={s.page}>
      <header className={s.hero}>
        <p className={s.eyebrow}>Useless but shiny</p>
        <h1 className={s.title}>쓸모없지만 화려하죠?</h1>
        <p className={s.lede}>
          스크롤을 8초 동안 멈추지 않아야 열리는 페이지였습니다.
          <br />
          아무 쓸모 없습니다. 그게 전부입니다.
        </p>

        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={onReset}>
            다시 충전하기
          </button>
          {REPO_URL && (
            <a className={s.btn} href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub 에서 보기
            </a>
          )}
        </div>
      </header>

      <section className={s.section}>
        <h2 className={s.h2}>이 페이지가 하는 일</h2>
        <dl className={s.specs}>
          {SPECS.map((row) => (
            <div key={row.k} className={s.specRow}>
              <dt className={s.specKey}>{row.k}</dt>
              <dd className={s.specVal}>{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.section}>
        <h2 className={s.h2}>다른 템플릿</h2>
        <ul className={s.cards}>
          {TEMPLATES.map((t, i) => (
            <li key={i} className={s.card} data-state={t.state}>
              <span className={s.cardName}>{t.name}</span>
              <span className={s.cardNote}>{t.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <footer className={s.footer}>
        <p>손으로 만든 CSS · 의존성 없는 WebGL · MIT</p>
      </footer>
    </main>
  )
}
