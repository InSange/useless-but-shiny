/* ============================================================
   여덟 개의 단서 = 여덟 개의 쓸모없지만 아름다운 웹사이트.

   어둠 속에 놓인 것은 **수수께끼 한 줄**이고,
   찾으면 카드가 정체를 밝힌다.

   ⚠️ 주소는 전부 실제로 살아 있는 것만 넣었다 (2026-08 확인).
   웹은 죽는다 — 링크가 끊기면 지우거나 바꾼다. 지어내지 않는다.

   그림은 사진이 아니라 SVG 로 직접 그린다.
     · 남의 화면을 퍼오지 않아도 된다
     · 저장소에 그림 파일이 안 쌓인다
     · 여덟 장이 같은 손으로 그려져 톤이 맞는다
   ============================================================ */

export type Site = {
  id: string
  /** 어둠 속에 놓이는 수수께끼 */
  riddle: string
  /** 수수께끼 아래 작은 글 */
  hint?: string
  /** 정체 */
  name: string
  url: string
  /** 무엇을 하는 곳인가 — 두 문장 넘기지 않는다 */
  what: string
  /** 왜 쓸모없는데 화려한가 */
  why: string
  /** 그림 종류. Motif.tsx 가 이걸 보고 그린다 */
  motif: 'zoom' | 'point' | 'deep' | 'sand' | 'globe' | 'drive' | 'sound' | 'dice'
  /** 방 안 위치 (화면 비율) */
  x: number
  y: number
  align?: 'left' | 'center' | 'right'
}

export const SITES: Site[] = [
  {
    id: 's1', x: 0.14, y: 0.20, align: 'left',
    riddle: '끝이 없는 그림 한 장', hint: '들어가도 들어가도 처음이다',
    name: 'Zoomquilt', url: 'https://zoomquilt.org/',
    motif: 'zoom',
    what: '한 장의 그림을 계속 확대하면 다시 그 그림이 나온다. 화가 여럿이 이어 그린 무한 루프.',
    why: '끝이 없으니 도착할 곳도 없다. 그런데 손을 못 뗀다.',
  },
  {
    id: 's2', x: 0.47, y: 0.13,
    riddle: '누군가 당신을 가리키고 있다', hint: '정확히 그 자리를',
    name: 'Pointer Pointer', url: 'https://pointerpointer.com/',
    motif: 'point',
    what: '마우스를 멈추면, 화면의 바로 그 좌표를 손가락으로 가리키는 사람의 사진이 뜬다.',
    why: '아무 정보도 주지 않는다. 대신 매번 놀란다.',
  },
  {
    id: 's3', x: 0.83, y: 0.24, align: 'right',
    riddle: '내려갈수록 어두워진다', hint: '바닥이 아주 멀다',
    name: 'Deep Sea', url: 'https://neal.fun/deep-sea/',
    motif: 'deep',
    what: '스크롤을 내리면 수심이 깊어진다. 그 깊이에 사는 생물이 하나씩 지나간다.',
    why: '스크롤 하나로 만든 연출인데, 마리아나 해구까지 10분이 걸린다.',
  },
  {
    id: 's4', x: 0.24, y: 0.52, align: 'left',
    riddle: '모래는 쌓이기만 한다', hint: '치울 수는 없다',
    name: 'This Is Sand', url: 'https://thisissand.com/',
    motif: 'sand',
    what: '누르고 있으면 모래가 쏟아진다. 색을 바꿔 가며 지층을 만든다.',
    why: '만들어도 아무 데도 쓸 수 없다. 그래서 계속 붓게 된다.',
  },
  {
    id: 's5', x: 0.68, y: 0.45,
    riddle: '지구 반대편의 라디오', hint: '지금 거기서 나오는 소리',
    name: 'Radio Garden', url: 'https://radio.garden/',
    motif: 'globe',
    what: '지구본을 돌려 아무 점이나 누르면, 그 동네 라디오가 실시간으로 나온다.',
    why: '무슨 말인지 하나도 못 알아듣는데 계속 듣게 된다.',
  },
  {
    id: 's6', x: 0.11, y: 0.80, align: 'left',
    riddle: '이력서를 운전한다', hint: '경적도 울린다',
    name: 'Bruno Simon', url: 'https://bruno-simon.com/',
    motif: 'drive',
    what: '자동차를 몰고 3D 공간을 돌아다니며 포트폴리오를 읽는다. 물건을 들이받을 수도 있다.',
    why: '이력서를 읽는 데 운전이 필요할 이유는 없다. 그런데 다 읽게 된다.',
  },
  {
    id: 's7', x: 0.52, y: 0.86,
    riddle: '아무 키나 눌러 보세요', hint: '소리와 모양이 같이 나온다',
    name: 'Patatap', url: 'https://patatap.com/',
    motif: 'sound',
    what: '키보드의 글쇠마다 소리 하나와 도형 하나가 짝지어져 있다. 누르는 대로 연주가 된다.',
    why: '악기도 아니고 그림판도 아니다. 둘 다 아니라서 재밌다.',
  },
  {
    id: 's8', x: 0.86, y: 0.64, align: 'right',
    riddle: '다음은 어디든', hint: '고를 수 없다',
    name: 'The Useless Web', url: 'https://theuselessweb.com/',
    motif: 'dice',
    what: '버튼이 하나뿐이다. 누르면 세상 어딘가의 쓸모없는 웹사이트로 던져진다.',
    why: '이 목록의 끝에 두기 좋은 곳. 여기서부터는 알아서 헤매면 된다.',
  },
]

/** 발견으로 치기까지 비춰야 하는 시간(초). 짧으면 스쳐도 발견돼서 싱겁다. */
export const FIND_SECONDS = 0.45

/* 빛을 막는 물건들. 숨긴 것 바로 앞은 피해서 놓는다 —
   찾을 수 없는 것이 하나라도 있으면 게임이 아니라 고문이 된다. */
export type Prop = { x: number; y: number; w: number; h: number; tilt?: number }

export const PROPS: Prop[] = [
  { x: 0.32, y: 0.33, w: 0.030, h: 0.30, tilt:  2 },   // 기둥
  { x: 0.60, y: 0.28, w: 0.100, h: 0.055, tilt: -6 },  // 넘어진 판
  { x: 0.42, y: 0.68, w: 0.075, h: 0.13, tilt:  3 },   // 상자
  { x: 0.78, y: 0.56, w: 0.024, h: 0.26, tilt: -1 },   // 기둥
  { x: 0.20, y: 0.66, w: 0.085, h: 0.045, tilt: 9 },   // 넘어진 판
  { x: 0.66, y: 0.79, w: 0.055, h: 0.085, tilt: -4 },  // 상자
]
