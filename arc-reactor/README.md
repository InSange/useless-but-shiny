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
  styles/tokens.css          간격 눈금 · 색 역할 · 움직임
  reactor/
    useCharge.ts             시뮬레이션 — rAF 루프. 화면은 전혀 안 건드린다
    ArcReactor.tsx           루프 값을 유니폼으로 넘기고, 캔버스 위 글자를 얹는다
    reactor.module.css       껍데기만 (글자·버튼·완료 화면)
    gl/
      renderer.ts            WebGL 뼈대 — 풀스크린 삼각형 하나
      reactor.vert.glsl      통과만 시킨다
      reactor.frag.glsl      ★ 리액터 전체가 여기 있다
```

**리액터는 그림이 아니라 계산이다.** 화면을 덮는 삼각형 하나를 그리고,
모든 픽셀에서 카메라 광선을 쏴 거리장(SDF)을 따라 전진시켜 표면을 찾고
거기서 조명을 푼다. 유니티 셰이더랩의 `CGPROGRAM` 안쪽과 개념이 같다.

CSS 그라디언트로는 못 넘는 벽이 셋 있어서 이렇게 갔다:

| | 왜 필요한가 |
|---|---|
| 정반사 | 표면 각도에 따라 하이라이트가 **움직여야** 금속으로 보인다 |
| 프레넬 | 가장자리 반사가 강해야 "오려 붙인 스티커"를 벗어난다 |
| 시차 | 카메라가 흔들릴 때 앞뒤가 다르게 밀려야 깊이가 생긴다 |

**설계 한 줄:** 진행률은 React state 가 아니다. `useRef` + `requestAnimationFrame`
으로 굴리고 유니폼에 직접 쓴다. React state 는 국면(idle/charging/decaying/complete)뿐이다.

## 셰이더 안 구조 (반지름 = 리액터 반지름 기준)

| 반지름 | 층 |
|---|---|
| 0.75~1.06 | 코일 블록 10개 / 그 사이 빛 쐐기 10개 |
| 0.58~0.77 | 금속 베젤 + 볼트 8개 |
| 0.40~0.56 | 눈금 게이지 48칸 |
| 0.30~0.44 | 방사형 지지대 4개 |
| 0.32~0.37 | 안쪽 링 |
| 0~0.285 | 플라즈마 코어 |
| z = -2.6 | 뒷벽 — 리액터 빛을 실제로 받는다 |

빛은 코일 "블록"이 아니라 **그 사이 틈**으로 나온다(실물이 그렇다).
쐐기 10칸이 12시부터 시계방향으로 하나씩 켜지면서 충전을 보여준다.

## 튜닝

주소에 **`?charge=0.55`** 를 붙이면 그 값으로 고정된다 (개발 모드 전용).
연출을 손볼 때 8초씩 굴리고 있을 수 없어서 만들어 뒀다.

콘솔에서도 만질 수 있다:

```js
__reactor.set({ charge: 0.8, tiltX: -0.3 }); __reactor.draw()
__reactor.setScale(0.75)   // 느리면 해상도를 낮춘다 (기본 min(DPR, 1.5))
```

## 규칙

- 의존성 없다. React + WebGL만
- UI 라이브러리 안 쓴다. CSS Modules + CSS 변수만
- 간격 숫자는 `tokens.css` 의 눈금에서만 고른다 (한 칸 = 4px)
- 색은 역할로 쓴다 (`--color-arc`, `--color-void`)

## 실행

```bash
npm install
npm run dev
```
