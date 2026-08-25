precision highp float;

/* ============================================================
   어둠 한 장.

   이 셰이더는 페이지를 그리지 않는다. 페이지는 아래에 진짜 HTML 로
   깔려 있고, 이건 그 위를 덮는 **가림막**이다.
     알파 1 = 완전히 가린다 (어둠)
     알파 0 = 다 비친다     (빛이 닿은 곳)

   그래서 글자는 여전히 진짜 글자다 — 복사되고 검색되고 낭독된다.
   ============================================================ */

#define MAX_PROPS 8

uniform vec2  uRes;          // 캔버스 크기(px)
uniform vec2  uLight;        // 손전등 위치(px, 좌상단 원점)
uniform float uTime;         // 누적 시간(초)
uniform float uBattery;      // 0~1 — 빛의 세기 (켜질 때 0→1, 끝날 때 확 오른다)
uniform float uReveal;       // 0~1 — 다 찾은 뒤 어둠이 걷힌다

uniform vec4  uProps[MAX_PROPS];    // 빛을 막는 것 (cx, cy, 반폭, 반높이) px
uniform float uPropRot[MAX_PROPS];  // 기울기(라디안)

uniform sampler2D uMemory;   // 빛이 닿았던 기억 (저해상도)

uniform vec3  uVoid;         // 어둠의 색
uniform vec3  uBeam;         // 빛의 색

/* ---------- 거리 함수 ----------
   기울어진 직사각형까지의 거리. 음수면 안쪽.
   아크 리액터에서 3D 로 쓴 것을 2D 로 줄인 것. */
float sdBox(vec2 p, vec4 box, float rot) {
  vec2 q = p - box.xy;
  float s = sin(rot), c = cos(rot);
  q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  vec2 d = abs(q) - box.zw;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float sceneDist(vec2 p) {
  float d = 1e6;
  for (int i = 0; i < MAX_PROPS; i++) {
    d = min(d, sdBox(p, uProps[i], uPropRot[i]));
  }
  return d;
}

/* ---------- 부드러운 그림자 ----------
   픽셀에서 빛을 향해 걸어가며, 걷는 동안 물체에 얼마나 가까이
   스쳤는지를 기록한다.

   왜 이렇게 하나 — 물체에 닿았나/안 닿았나만 보면 그림자 경계가
   칼로 자른 듯 딱딱해진다. 종이 오려 붙인 것처럼 보인다.
   "얼마나 아슬아슬하게 스쳤나"를 재면 경계에 반그림자가 생긴다.

   나눗셈의 t 가 핵심이다. 같은 거리를 스쳐도 **빛에서 멀리서** 스쳤으면
   그림자가 더 넓게 번진다. 실제로 그렇다 — 물체에서 멀어질수록
   그림자 경계가 흐려진다. */
float shadow(vec2 from, vec2 to) {
  vec2 dir = to - from;
  float len = length(dir);
  if (len < 1.0) return 1.0;
  dir /= len;

  float res = 1.0;
  float t = 6.0;                    // 자기 자신에 걸리지 않게 조금 띄우고 출발
  for (int i = 0; i < 28; i++) {
    if (t >= len) break;
    float d = sceneDist(from + dir * t);
    if (d < 0.4) return 0.0;        // 막혔다
    res = min(res, 9.0 * d / t);    // 9.0 이 클수록 그림자 경계가 날카롭다
    t += clamp(d, 3.0, 40.0);       // 안전한 만큼 성큼성큼
  }
  return clamp(res, 0.0, 1.0);
}

/* ---------- 잡음 ---------- */
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);  // 좌상단 원점으로
  vec2 uv = vec2(p.x / uRes.x, p.y / uRes.y);

  /* --- 감쇠 ---
     손전등은 한 겹이 아니다. 좁고 센 중심(hot spot)과
     넓고 약한 번짐(spill)이 겹쳐 있다. 한 겹만 쓰면 동그란
     스텐실로 보인다 — 첫 판에서 실제로 그랬다.

     짧은 변을 기준으로 반지름을 잡는다. 긴 변으로 잡으면
     세로로 긴 창에서 빛이 화면을 다 덮어 버린다. */
  float unit = min(uRes.x, uRes.y);
  float d = length(p - uLight);
  float hot   = 1.0 / (1.0 + pow(d / (unit * 0.095), 2.3));
  float spill = 1.0 / (1.0 + pow(d / (unit * 0.20),  2.4));
  float atten = clamp(hot * 0.84 + spill * 0.18, 0.0, 1.0);


  atten *= uBattery;

  /* --- 그림자 --- */
  float sh = shadow(p, uLight);
  float lit = atten * sh;

  /* --- 기억 ---
     한번 비춘 자리는 잔상으로 남았다 천천히 사라진다.
     지금 빛보다 항상 어둡다 — 안 그러면 기억이 실물처럼 보인다. */
  float mem = texture2D(uMemory, uv).r;
  float bright = max(lit, mem * 0.62);

  /* --- 공기 중의 먼지 ---
     빛이 통과하는 공간 자체가 살짝 뿌옇다. 이게 없으면
     빛이 벽에만 칠해진 것처럼 보이고 공간감이 안 생긴다.
     그림자 안에서는 먼지도 안 보인다 — 빛이 거기까지 못 갔으니까.

     ⚠️ 잡음의 주기는 **화면 픽셀로** 정해야 한다.
     처음에 34 로 뒀다가 한 덩이가 24px 이 되어 화면이 얼룩덜룩해졌다.
     먼지는 몇 px 짜리 알갱이여야 먼지로 보인다 — 여기서는 약 4px.
     (반대로 2px 밑으로 내려가면 이웃 픽셀끼리 평균나서 그냥 회색이 된다) */
  vec2 dp = p / unit;
  float grain = noise(dp * 190.0 + vec2(uTime * 0.9, -uTime * 1.3));
  float haze  = noise(dp * 6.0  + vec2(uTime * 0.04, -uTime * 0.06));
  float dust = (grain * 0.65 + haze * 0.35);
  dust = smoothstep(0.52, 0.95, dust) * atten * sh * 0.16;

  /* 가까스로 닿는 가장자리에서 빛이 아주 살짝 흔들린다.
     완벽하게 고른 빛은 사람이 든 등처럼 안 보인다. */
  float flicker = 1.0 + 0.035 * (noise(vec2(uTime * 3.1, 0.0)) - 0.5);
  bright *= flicker;

  /* --- 합성 ---
     알파가 이 셰이더의 결과물이다. 색은 어둠의 색에 먼지만 섞는다. */
  float alpha = clamp(1.0 - bright, 0.0, 1.0);
  vec3  col   = mix(uVoid, uBeam, clamp(dust * 2.2, 0.0, 1.0));

  alpha = max(alpha - dust * 0.30, 0.0);   // 먼지가 낀 곳은 조금 더 비친다
  alpha *= (1.0 - uReveal);                // 다 찾으면 어둠이 통째로 걷힌다

  gl_FragColor = vec4(col, alpha);
}
