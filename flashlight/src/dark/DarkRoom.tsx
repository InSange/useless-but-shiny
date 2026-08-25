import { useRef } from 'react'
import { PROPS, SITES } from './sites'
import { useDarkRoom } from './useDarkRoom'
import ClueCard from './ClueCard'
import Landing from '../landing/Landing'
import s from './darkRoom.module.css'

/* ============================================================
   층 구조가 이 페이지의 전부다.

     8  단서 카드          찾는 즉시. 닫아야 다음으로 간다
     4  안내·숫자판        언제나 보인다
     3  찾아낸 것          ★ 어둠 **위**로 올라온다 = 다시 안 어두워진다
     2  어둠 (WebGL)       빛이 닿은 만큼만 뚫린다
     1  아직 못 찾은 것 · 빛을 막는 물건
     0  벽

   3번이 규칙의 전부다. 찾으면 어둠보다 위에 서므로 영영 보인다.
   못 찾은 것은 어둠 아래에 있어서 비출 때만 보이고, 지나가면 잊힌다.
   ============================================================ */

export default function DarkRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { found, phase, idle, failed, openClue, closeClue, total } = useDarkRoom(canvasRef)
  const foundSet = new Set(found)
  const clue = openClue ? SITES.find((x) => x.id === openClue) : null

  /* ⚠️ 랜딩은 방 **밖**에 둔다.
     방은 position: fixed + overflow: hidden 이다 (화면 한 장짜리 어둠).
     그 안에 랜딩을 넣으면 잘리고 스크롤도 안 된다. 처음에 그렇게 만들었다가
     불을 켠 다음 페이지를 못 내리는 걸 보고 알았다. */
  return (
    <>
    <div className={s.room} data-phase={phase} data-failed={failed ? 'true' : undefined}>
      {/* 빛을 막는 것들. 어둠 아래에 있으므로 평소엔 실루엣으로만 보인다. */}
      {PROPS.map((p, i) => (
        <div
          key={i}
          className={s.prop}
          style={{
            left: `${p.x * 100}%`, top: `${p.y * 100}%`,
            width: `${p.w * 100}%`, height: `${p.h * 100}%`,
            rotate: `${p.tilt ?? 0}deg`,
          }}
        />
      ))}

      {SITES.map((sec) => (
        <article
          key={sec.id}
          data-secret={sec.id}
          className={`${s.secret} ${foundSet.has(sec.id) ? s.found : ''}`}
          data-align={sec.align ?? 'center'}
          style={{ left: `${sec.x * 100}%`, top: `${sec.y * 100}%` }}
        >
          <p className={s.line}>{sec.riddle}</p>
          {sec.hint && <p className={s.sub}>{sec.hint}</p>}
          {/* 비추고 있는 동안 차오르는 테두리. --dwell 은 매 프레임 JS 가 쓴다. */}
          <span className={s.dwellRing} aria-hidden="true" />
        </article>
      ))}

      <canvas ref={canvasRef} className={s.veil} aria-hidden="true" />

      {/* ---------- 시작 안내 ----------
          이게 없으면 들어오자마자 캄캄한 화면뿐이라 "고장 났나?" 싶다.
          규칙을 모르면 게임이 아니라 그냥 검은 화면이다.
          마우스를 처음 움직이면 사라진다 — 읽었다는 뜻이므로. */}
      {phase === 'hunting' && (
        <div className={s.intro} data-gone={!idle || undefined}>
          {/* 글 뒤로 번지는 잉크. 상자가 아니라 얼룩이라 테두리가 없다. */}
          <span className={s.ink} aria-hidden="true" />
          <p className={s.introKicker}>쓸모없지만 화려하죠? · 02</p>
          <h1 className={s.introTitle}>어둠 속 손전등</h1>
          <p className={s.introBody}>
            커서가 손전등입니다. 이 방에 단서 여덟 개가 숨어 있습니다.
          </p>
          <ul className={s.introRules}>
            <li>비춘 자리는 <b>잠시 남았다 흐려집니다</b></li>
            <li>단서를 <b>0.5초쯤 비추면</b> 발견됩니다</li>
            <li>찾으면 그것이 가리키는 <b>웹사이트가 열립니다</b></li>
          </ul>
          <p className={s.introGo}>마우스를 움직이세요</p>
        </div>
      )}

      <div className={s.hud}>
        <span className={s.count}>
          <b>{found.length}</b> / {total}
        </span>
        <span className={s.dots} aria-hidden="true">
          {SITES.map((sec) => (
            <i key={sec.id} className={foundSet.has(sec.id) ? s.dotOn : s.dot} />
          ))}
        </span>
      </div>

      {/* 화면 낭독기·검색엔진용. 어둠은 그림일 뿐이고 글은 처음부터 다 있다. */}
      <p className={s.sr}>
        어두운 방에 단서 여덟 개가 숨겨져 있다. 마우스가 손전등이다.
        찾으면 그 단서가 가리키는 웹사이트가 카드로 열린다.
        찾은 것: {found.length} / {total}.
      </p>

      {failed && (
        <p className={s.failed}>
          이 브라우저에서는 어둠을 그릴 수 없어서(WebGL) 그냥 다 보여 준다.
        </p>
      )}

      {phase !== 'hunting' && <div className={s.flash} aria-hidden="true" />}

      {clue && (
        <ClueCard
          site={clue}
          index={found.length}
          total={total}
          onClose={closeClue}
        />
      )}

      {/* 잉크 얼룩의 들쭉날쭉한 가장자리.
          feTurbulence 로 잡음을 만들고 feDisplacementMap 으로 그 잡음만큼
          픽셀을 밀어낸다. 매끈한 원이 번진 얼룩이 된다.
          CSS 만으로는 이 불규칙한 윤곽을 못 만든다.

          ⚠️ color-interpolation-filters="sRGB" 가 반드시 필요하다.
          SVG 필터의 기본값은 linearRGB 다. 반투명한 가장자리에서
          알파를 풀었다가 다시 곱하는 과정에 색이 튀어서,
          얼룩 둘레에 자홍·노랑 테가 생긴다. 실제로 그렇게 나왔다. */}
      <svg width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="inkEdge" x="-30%" y="-30%" width="160%" height="160%"
          colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="4" seed="11" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="46"
            xChannelSelector="R" yChannelSelector="G" />
        </filter>

      </svg>
    </div>

    {phase === 'revealed' && <Landing />}
    </>
  )
}
