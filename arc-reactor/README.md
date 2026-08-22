# Arc Reactor

> 쓸모없지만 화려하죠?

스크롤을 **멈추지 않아야** 차오르는 랜딩 페이지.
8초를 버티면 `hello world` 가 뜬다. 손을 떼면 3초 만에 0으로 돌아간다.

## 동작

```
IDLE ──스크롤──▶ CHARGING ──p=1.0──▶ COMPLETE
                   │  ▲
         입력 끊김 │  │ 다시 입력
                   ▼  │
                DECAYING ──p=0──▶ IDLE
```

- 페이지는 스크롤되지 않는다. 휠·터치·`Space`/`↓` 는 오직 **연료**로만 쓰인다
- 롤백 도중 다시 굴리면 **떨어진 지점에서** 다시 올라간다
- `prefers-reduced-motion` 을 존중한다 — 화면 흔들림이 꺼진다

## 만지는 숫자

`src/reactor/useCharge.ts` 의 `TUNING`:

| | 기본값 | 뜻 |
|---|---|---|
| `chargeSeconds` | 8 | 계속 굴렸을 때 0 → 100% |
| `decaySeconds` | 3 | 손 떼면 현재 값 무관하게 0 까지 |
| `inputGraceMs` | 120 | 이 시간 입력이 없으면 "손 뗐다" |
| `wheelThreshold` | 1.5 | 트랙패드 관성 꼬리를 무시하는 최소 델타 |

`src/reactor/ArcReactor.tsx` 의 `MAX_SHAKE_PX`, `MAX_SHAKE_DEG` 로 흔들림 세기를 맞춘다.

## 구조

```
src/
  styles/tokens.css       간격 눈금 · 색 역할 · 움직임
  reactor/
    useCharge.ts          시뮬레이션 (rAF 루프)
    ArcReactor.tsx        화면 구조 + 매 프레임 DOM 쓰기
    reactor.module.css    연출 — 전부 --p 하나에서 파생
```

**설계 한 줄:** 진행률은 React state 가 아니다. `useRef` + `requestAnimationFrame` 으로
굴리고 CSS 변수에 직접 쓴다. React state 는 국면(idle/charging/decaying/complete)뿐이다.

## 규칙

- UI 라이브러리 안 쓴다. CSS Modules + CSS 변수만
- 간격 숫자는 `tokens.css` 의 눈금에서만 고른다 (한 칸 = 4px)
- 색은 역할로 쓴다 (`--color-arc`, `--color-void`)

## 실행

```bash
npm install
npm run dev
```
