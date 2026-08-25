import type { Site } from './sites'

/* ============================================================
   단서 카드의 그림.

   사진을 퍼오지 않는다 — 남의 화면을 공개 저장소에 올리지 않아도 되고,
   여덟 장이 같은 손으로 그려져 톤이 맞는다.
   각 사이트를 **베끼는 게 아니라 한 문장으로 요약한 도형**이다.

   currentColor 로만 그린다. 색은 카드가 정한다.
   ============================================================ */

const box = { viewBox: '0 0 120 84', fill: 'none' as const }
const line = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const }

function Zoom() {
  // 액자 안의 액자 안의 액자 — 들어가도 처음으로 돌아온다
  return (
    <svg {...box}>
      {[0, 1, 2, 3, 4].map((i) => {
        const k = Math.pow(0.62, i)
        return (
          <rect key={i} {...line} opacity={1 - i * 0.13}
            x={60 - 52 * k} y={42 - 36 * k} width={104 * k} height={72 * k} rx={2} />
        )
      })}
      <path {...line} opacity={0.5} d="M60 42 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0" />
    </svg>
  )
}

function Point() {
  // 사방에서 한 점을 가리키는 손가락들
  return (
    <svg {...box}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2
        const r1 = 36, r2 = 15
        const x1 = 60 + Math.cos(a) * r1 * 1.25, y1 = 42 + Math.sin(a) * r1
        const x2 = 60 + Math.cos(a) * r2 * 1.25, y2 = 42 + Math.sin(a) * r2
        return <line key={i} {...line} opacity={0.35 + (i % 3) * 0.2}
          x1={x1} y1={y1} x2={x2} y2={y2} />
      })}
      <circle cx="60" cy="42" r="3.4" fill="currentColor" />
      <circle {...line} cx="60" cy="42" r="8" opacity={0.4} />
    </svg>
  )
}

function Deep() {
  // 아래로 갈수록 촘촘하고 어두워지는 층
  return (
    <svg {...box}>
      {Array.from({ length: 9 }, (_, i) => {
        const y = 8 + Math.pow(i / 8, 1.5) * 68
        return <line key={i} {...line} opacity={0.9 - i * 0.09}
          x1={10} y1={y} x2={110} y2={y} />
      })}
      <circle cx="42" cy="24" r="2.2" fill="currentColor" opacity={0.8} />
      <circle cx="78" cy="58" r="1.6" fill="currentColor" opacity={0.5} />
      <path {...line} opacity={0.55} d="M86 30 q6 -4 12 0 q-6 4 -12 0z" />
    </svg>
  )
}

function Sand() {
  // 위에서 쏟아져 아래에 쌓인다
  return (
    <svg {...box}>
      {Array.from({ length: 22 }, (_, i) => {
        const x = 60 + ((i * 37) % 23) - 11
        const y = 6 + ((i * 61) % 44)
        return <circle key={i} cx={x} cy={y} r={1.1} fill="currentColor" opacity={0.25 + (i % 4) * 0.18} />
      })}
      <path fill="currentColor" opacity={0.28} d="M18 78 Q60 46 102 78 Z" />
      <path fill="currentColor" opacity={0.5} d="M30 78 Q60 58 90 78 Z" />
      <line {...line} opacity={0.35} x1={10} y1={78} x2={110} y2={78} />
    </svg>
  )
}

function Globe() {
  // 경위선과, 어느 한 점에서 나오는 전파
  return (
    <svg {...box}>
      <circle {...line} cx="52" cy="42" r="30" />
      {[-18, 0, 18].map((d) => (
        <ellipse key={d} {...line} opacity={0.45} cx="52" cy={42 + d} rx="30" ry={Math.abs(d) === 18 ? 8 : 12} />
      ))}
      <ellipse {...line} opacity={0.45} cx="52" cy="42" rx="11" ry="30" />
      <circle cx="72" cy="27" r="3" fill="currentColor" />
      {[8, 15, 22].map((r, i) => (
        <path key={r} {...line} opacity={0.7 - i * 0.2}
          d={`M${72 + r * 0.7} ${27 - r * 0.7} a${r} ${r} 0 0 1 0 ${r * 1.4}`} />
      ))}
    </svg>
  )
}

function Drive() {
  // 바퀴 달린 상자와 그 뒤에 남는 자국
  return (
    <svg {...box}>
      <path {...line} opacity={0.3} d="M6 62 H110" />
      {[16, 30, 44].map((x, i) => (
        <line key={x} {...line} opacity={0.25 + i * 0.12} x1={x} y1={56} x2={x + 8} y2={56} />
      ))}
      <path {...line} d="M62 56 v-12 h12 l10 -10 h14 l8 10 h4 v12 z" />
      <circle {...line} cx="72" cy="58" r="6" />
      <circle {...line} cx="100" cy="58" r="6" />
      <circle cx="72" cy="58" r="1.6" fill="currentColor" />
      <circle cx="100" cy="58" r="1.6" fill="currentColor" />
    </svg>
  )
}

function Sound() {
  // 글쇠 한 줄과, 눌린 자리에서 터지는 도형
  return (
    <svg {...box}>
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} {...line} opacity={i === 4 ? 1 : 0.35}
          x={12 + i * 11} y={62} width={8} height={8} rx={1.5}
          fill={i === 4 ? 'currentColor' : 'none'} />
      ))}
      <circle {...line} cx="56" cy="32" r="9" opacity={0.9} />
      <circle {...line} cx="56" cy="32" r="17" opacity={0.5} />
      <circle {...line} cx="56" cy="32" r="25" opacity={0.22} />
      <path {...line} opacity={0.7} d="M84 22 l7 12 -14 0z" />
      <rect {...line} opacity={0.55} x={22} y={16} width={13} height={13} rx={1} />
    </svg>
  )
}

function Dice() {
  // 버튼 하나와, 어디로 튈지 모르는 화살표들
  return (
    <svg {...box}>
      <rect {...line} x={38} y={32} width={44} height={20} rx={10} />
      <circle cx="60" cy="42" r="2.6" fill="currentColor" />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1], [1.4, 0], [-1.4, 0]].map(([dx, dy], i) => (
        <path key={i} {...line} opacity={0.3 + (i % 3) * 0.2}
          d={`M${60 + dx * 30} ${42 + dy * 20} l${dx * 14} ${dy * 10}`}
          markerEnd="" />
      ))}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy], i) => (
        <circle key={i} cx={60 + dx * 46} cy={42 + dy * 31} r={2} fill="currentColor" opacity={0.5} />
      ))}
    </svg>
  )
}

const DRAW: Record<Site['motif'], () => React.JSX.Element> = {
  zoom: Zoom, point: Point, deep: Deep, sand: Sand,
  globe: Globe, drive: Drive, sound: Sound, dice: Dice,
}

export default function Motif({ kind }: { kind: Site['motif'] }) {
  const Shape = DRAW[kind]
  return <Shape />
}
