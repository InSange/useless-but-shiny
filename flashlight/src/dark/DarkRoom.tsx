import { useRef } from 'react'
import { PROPS, SECRETS } from './room'
import { useDarkRoom } from './useDarkRoom'
import Landing from '../landing/Landing'
import s from './darkRoom.module.css'

/* ============================================================
   층 구조가 이 페이지의 전부다.

     4  숫자판·안내      언제나 보인다
     3  찾아낸 것        ★ 어둠 **위**로 올라온다 = 다시 안 어두워진다
     2  어둠 (WebGL)     빛이 닿은 만큼만 뚫린다
     1  아직 못 찾은 것 · 빛을 막는 물건
     0  방바닥

   3번이 규칙의 전부다. 찾으면 어둠보다 위에 서므로 영영 보인다.
   못 찾은 것은 어둠 아래에 있어서 비출 때만 보이고, 지나가면 잊힌다.
   ============================================================ */

export default function DarkRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { found, phase, idle, failed, total } = useDarkRoom(canvasRef)
  const foundSet = new Set(found)

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

      {SECRETS.map((sec) => (
        <article
          key={sec.id}
          data-secret={sec.id}
          className={`${s.secret} ${foundSet.has(sec.id) ? s.found : ''}`}
          data-align={sec.align ?? 'center'}
          style={{ left: `${sec.x * 100}%`, top: `${sec.y * 100}%` }}
        >
          <p className={s.line}>{sec.line}</p>
          {sec.sub && <p className={s.sub}>{sec.sub}</p>}
          {/* 비추고 있는 동안 차오르는 테두리. --dwell 은 매 프레임 JS 가 쓴다. */}
          <span className={s.dwellRing} aria-hidden="true" />
        </article>
      ))}

      <canvas ref={canvasRef} className={s.veil} aria-hidden="true" />

      <div className={s.hud}>
        <span className={s.count}>
          <b>{found.length}</b> / {total}
        </span>
        <span className={s.dots} aria-hidden="true">
          {SECRETS.map((sec) => (
            <i key={sec.id} className={foundSet.has(sec.id) ? s.dotOn : s.dot} />
          ))}
        </span>
      </div>

      {idle && phase === 'hunting' && (
        <p className={s.hint}>마우스를 움직여 방을 비춰라</p>
      )}

      {/* 화면 낭독기·검색엔진용. 어둠은 그림일 뿐이고 글은 처음부터 다 있다. */}
      <p className={s.sr}>
        어두운 방에 여덟 조각의 글이 숨겨져 있다. 마우스가 손전등이다.
        찾은 것: {found.length} / {total}.
      </p>

      {failed && (
        <p className={s.failed}>
          이 브라우저에서는 어둠을 그릴 수 없어서(WebGL) 그냥 다 보여 준다.
        </p>
      )}

      {phase !== 'hunting' && <div className={s.flash} aria-hidden="true" />}
    </div>

    {phase === 'revealed' && <Landing />}
    </>
  )
}
