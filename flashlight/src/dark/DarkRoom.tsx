import { useRef } from 'react'
import { PROPS, SECRETS } from './room'
import { useDarkRoom } from './useDarkRoom'
import Landing from '../landing/Landing'
import s from './darkRoom.module.css'

/* ============================================================
   층 구조가 이 페이지의 전부다.

     4  안내·알림·숫자판   언제나 보인다
     3  찾아낸 것          ★ 어둠 **위**로 올라온다 = 다시 안 어두워진다
     2  어둠 (WebGL)       빛이 닿은 만큼만 뚫린다
     1  아직 못 찾은 것 · 빛을 막는 물건
     0  벽

   3번이 규칙의 전부다. 찾으면 어둠보다 위에 서므로 영영 보인다.
   못 찾은 것은 어둠 아래에 있어서 비출 때만 보이고, 지나가면 잊힌다.
   ============================================================ */

export default function DarkRoom() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { found, phase, idle, failed, total } = useDarkRoom(canvasRef)
  const foundSet = new Set(found)
  const last = found.length ? SECRETS.find((x) => x.id === found[found.length - 1]) : null

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

      {/* ---------- 시작 안내 ----------
          이게 없으면 들어오자마자 캄캄한 화면뿐이라 "고장 났나?" 싶다.
          규칙을 모르면 게임이 아니라 그냥 검은 화면이다.
          마우스를 처음 움직이면 사라진다 — 읽었다는 뜻이므로. */}
      {phase === 'hunting' && (
        <div className={s.intro} data-gone={!idle || undefined}>
          <p className={s.introKicker}>쓸모없지만 화려하죠? · 02</p>
          <h1 className={s.introTitle}>어둠 속 손전등</h1>
          <p className={s.introBody}>
            커서가 손전등입니다. 이 방에 여덟 조각의 글이 숨어 있습니다.
          </p>
          <ul className={s.introRules}>
            <li>비춘 자리는 <b>잠시 남았다 흐려집니다</b></li>
            <li>글 하나를 <b>0.5초쯤 비추면</b> 발견됩니다</li>
            <li>찾은 것은 <b>영영 밝은 채로</b> 남습니다</li>
          </ul>
          <p className={s.introGo}>마우스를 움직이세요</p>
        </div>
      )}

      {/* ---------- 발견 알림 ----------
          찾은 순간을 알려 주고, 방금 찾은 조각을 한 번 더 보여 준다.
          어둠 속에서 스쳐 읽은 글을 놓쳤을 수 있으므로. */}
      {last && phase === 'hunting' && (
        <div key={last.id} className={s.toast} role="status">
          <p className={s.toastCount}>
            발견 <b>{String(found.length).padStart(2, '0')}</b> / {total}
          </p>
          <p className={s.toastLine}>{last.line}</p>
          {last.sub && <p className={s.toastSub}>{last.sub}</p>}
          {found.length === 1 && (
            <p className={s.toastNote}>찾은 것은 계속 밝습니다. 나머지 일곱을 찾으면 불이 켜집니다.</p>
          )}
          {found.length === total - 1 && <p className={s.toastNote}>하나 남았습니다.</p>}
        </div>
      )}

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
