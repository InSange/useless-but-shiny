import { useEffect, useRef } from 'react'
import type { Site } from './sites'
import Motif from './Motif'
import s from './clueCard.module.css'

/* ============================================================
   단서 카드.

   찾는 즉시 뜨고, 닫아야 다음으로 간다.
   흐름을 끊는 대신 **반드시 읽게** 하는 쪽을 골랐다.

   떠 있는 동안 사냥이 멈춘다 — 안 그러면 카드 뒤에서 손전등이
   제멋대로 다른 것을 발견해 카드가 겹쳐 뜬다.
   ============================================================ */

type Props = {
  site: Site
  /** 이 단서의 고유 번호 (목록에서 몇 번째인가) */
  no: number
  /** 지금까지 찾은 개수 */
  found: number
  total: number
  onClose: () => void
}

export default function ClueCard({ site, no, found, total, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* 뜨자마자 닫기 단추에 초점을 준다.
       마우스로 노는 페이지지만 Tab 으로도 끝까지 갈 수 있어야 한다. */
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return

      /* 초점 가두기.
         이걸 안 하면 Tab 이 카드 밖(어두운 방)으로 새어 나간다.
         보이지도 않는 곳에 초점이 가 있으면 키보드로는 길을 잃는다. */
      const items = cardRef.current?.querySelectorAll<HTMLElement>('a[href], button')
      if (!items?.length) return
      const first = items[0], last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className={s.backdrop} onClick={onClose}>
      {/* 카드 안을 눌렀을 때까지 닫히면 링크를 누를 수 없다 */}
      <div
        ref={cardRef}
        className={s.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`clue-${site.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ⚠️ 두 숫자를 헷갈리지 않게 나눠 적는다.
            처음엔 단서 번호 자리에 "찾은 개수"를 넣어 뒀다 —
            1번 단서를 다시 열었는데 03 이라고 떠서 틀린 게 드러났다. */}
        <p className={s.meta}>
          단서 <b>{String(no).padStart(2, '0')}</b>
          <span className={s.metaSep}>·</span>
          확인 {found} / {total}
        </p>

        <div className={s.motif} aria-hidden="true"><Motif kind={site.motif} /></div>

        <p className={s.riddle}>“{site.riddle}”</p>

        <h2 className={s.name} id={`clue-${site.id}`}>{site.name}</h2>
        <p className={s.what}>{site.what}</p>
        <p className={s.why}>{site.why}</p>

        <div className={s.actions}>
          <a className={s.go} href={site.url} target="_blank" rel="noopener noreferrer">
            가 보기 <span aria-hidden="true">↗</span>
          </a>
          <button ref={closeRef} type="button" className={s.close} onClick={onClose}>
            돌아가기 <kbd>Esc</kbd>
          </button>
        </div>

        <p className={s.url}>{site.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</p>
      </div>
    </div>
  )
}
