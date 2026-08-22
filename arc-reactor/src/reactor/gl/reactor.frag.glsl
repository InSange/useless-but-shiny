precision highp float;

/* ============================================================
   아크 리액터 — 프래그먼트 셰이더.

   그리는 게 아니라 계산한다. 매 픽셀에서 카메라 광선을 쏘고,
   거리장(SDF)을 따라 전진시켜 표면을 찾고, 거기서 조명을 푼다.
   유니티 셰이더랩의 CGPROGRAM 안쪽과 개념이 같다.

   왜 이래야 실물처럼 보이나 — CSS 그라디언트에 없던 세 가지:
     1) 정반사 : 표면 각도에 따라 하이라이트가 움직인다
     2) 프레넬 : 가장자리로 갈수록 반사가 강해진다
     3) 시차   : 카메라가 흔들리면 앞뒤가 다르게 움직인다
   ============================================================ */

uniform vec2  uRes;
uniform float uTime;
uniform float uCharge;   // 0~1 진행률
uniform float uPulse;    // -1~1 맥동
uniform float uSpin;     // 라디안, 게이지 위를 도는 반짝임
uniform vec2  uShake;    // px
uniform vec2  uTilt;     // -1~1 마우스 시점

#define PI  3.14159265359
#define TAU 6.28318530718

const vec3 ARC     = vec3(0.30, 0.72, 1.00);   // 아크 광원 색
const vec3 ARC_HOT = vec3(0.88, 0.97, 1.00);   // 코어 중심

/* ---------- 재질 번호 ----------
   1 하우징 · 2 코일 · 3 빛 쐐기 · 4 게이지 · 5 안쪽 링 · 6 볼트/지지대
   7 코어 · 8 뒷벽 */

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/* ---------- 거리 함수 ---------- */

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdRoundBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }

/* 원환 판 — 반지름 ra~rb, 두께 2h. 게이지·베젤이 전부 이 모양이다. */
float sdAnnulus(vec3 p, float ra, float rb, float h) {
  float d = abs(length(p.xy) - (ra + rb) * 0.5) - (rb - ra) * 0.5;
  vec2 w = vec2(d, abs(p.z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

float sdDisc(vec3 p, float r, float h) {
  vec2 w = vec2(length(p.xy) - r, abs(p.z) - h);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}

/* 각도 도메인을 n등분해 접는다. 이거 하나로 코일 10개를
   객체 10개가 아니라 "하나"로 계산한다 — 레이마칭의 핵심 요령. */
vec2 pModPolar(vec2 p, float n, float offset) {
  float ang = TAU / n;
  float a = atan(p.y, p.x) + ang * 0.5 + offset;
  float r = length(p);
  a = mod(a, ang) - ang * 0.5;
  return vec2(cos(a), sin(a)) * r;
}

vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

/* 12시에서 시계방향으로 잰 각도 (0 ~ TAU).
   충전이 어디까지 찼는지 판단하는 기준. */
float clockAngle(vec2 p) { return mod(atan(p.x, p.y), TAU); }

vec2 map(vec3 p) {
  vec2 res = vec2(1e9, -1.0);

  // 뒷벽 — 리액터 빛을 받는 면. 시차와 광량 감쇠가 여기서 보인다.
  res = opU(res, vec2(p.z + 2.6, 8.0));

  // 뒤판
  res = opU(res, vec2(sdDisc(p - vec3(0.0, 0.0, -0.12), 0.80, 0.055), 1.0));

  // 금속 베젤
  res = opU(res, vec2(sdAnnulus(p, 0.58, 0.77, 0.10), 1.0));

  // 코일 블록 10개
  {
    vec2 q = pModPolar(p.xy, 10.0, 0.0);
    res = opU(res, vec2(
      sdRoundBox(vec3(q.x - 0.90, q.y, p.z), vec3(0.16, 0.105, 0.115), 0.028), 2.0));
  }

  // 코일 사이로 새어 나오는 빛. 살짝 뒤로 넣어 코일이 가리게 한다.
  {
    vec2 q = pModPolar(p.xy, 10.0, PI / 10.0);
    res = opU(res, vec2(
      sdRoundBox(vec3(q.x - 0.90, q.y, p.z + 0.035), vec3(0.165, 0.10, 0.075), 0.02), 3.0));
  }

  // 볼트 8개
  {
    vec2 q = pModPolar(p.xy, 8.0, 0.0);
    res = opU(res, vec2(length(vec3(q.x - 0.68, q.y, p.z - 0.10)) - 0.038, 6.0));
  }

  // 눈금 게이지 — 살짝 파묻어 그림자가 지게
  res = opU(res, vec2(sdAnnulus(p - vec3(0.0, 0.0, -0.03), 0.40, 0.56, 0.045), 4.0));

  // 안쪽 링
  res = opU(res, vec2(sdAnnulus(p, 0.32, 0.37, 0.06), 5.0));

  // 방사형 지지대 4개
  {
    vec2 q = pModPolar(p.xy, 4.0, 0.0);
    res = opU(res, vec2(
      sdRoundBox(vec3(q.x - 0.37, q.y, p.z - 0.02), vec3(0.10, 0.035, 0.055), 0.015), 6.0));
  }

  // 플라즈마 코어
  res = opU(res, vec2(sdDisc(p - vec3(0.0, 0.0, 0.02), 0.285, 0.055), 7.0));

  return res;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(
    e.xyy * map(p + e.xyy).x +
    e.yyx * map(p + e.yyx).x +
    e.yxy * map(p + e.yxy).x +
    e.xxx * map(p + e.xxx).x);
}

/* ---------- 가짜 환경맵 ----------
   금속이 금속처럼 보이는 이유는 "주변을 비추기" 때문이다.
   진짜 큐브맵 대신, 방향만 넣으면 색을 주는 함수 하나면 충분하다.
   밝은 로브 두 개(키/필)가 표면 위를 미끄러지면서 금속감을 만든다. */
vec3 env(vec3 d) {
  float up = d.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.010, 0.014, 0.022), vec3(0.13, 0.17, 0.23), pow(up, 1.6));

  // 키 라이트 — 왼쪽 위
  c += vec3(1.00, 0.97, 0.92) * pow(max(dot(d, normalize(vec3(-0.55, 0.75, 0.38))), 0.0), 26.0) * 1.5;
  // 필 라이트 — 오른쪽, 차가운 색
  c += vec3(0.35, 0.60, 1.00) * pow(max(dot(d, normalize(vec3(0.80, -0.15, 0.55))), 0.0), 10.0) * 0.40;
  // 리액터 자체가 뿜는 빛도 주변에 섞인다
  c += ARC * uCharge * 0.16 * pow(max(dot(d, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  return c;
}

/* 원주 방향으로 긁힌 자국 — 브러시드 메탈.
   법선을 접선 방향으로 살짝 흔들면 하이라이트가 길게 늘어난다. */
vec3 brushed(vec3 p, vec3 n, float amt) {
  float a = atan(p.y, p.x);
  float r = length(p.xy);
  float s = hash21(vec2(floor(r * 260.0), 0.0)) - 0.5;
  vec3 tangent = normalize(vec3(-p.y, p.x, 0.0) + 1e-5);
  return normalize(n + tangent * s * amt);
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m) {
  vec3 v = -rd;

  vec3 albedo = vec3(0.05);
  float rough = 0.4;
  float metal = 1.0;
  vec3 emis = vec3(0.0);

  float ang = clockAngle(p.xy);

  if (m < 1.5) {                       // 하우징 — 어두운 강철 + 선반 자국
    albedo = vec3(0.16, 0.15, 0.15);
    float rr = length(p.xy);
    float grooves = 0.5 + 0.5 * sin(rr * 96.0);
    rough = mix(0.26, 0.44, grooves);
    albedo *= 0.86 + 0.14 * grooves;
    n = brushed(p, n, 0.05);

  } else if (m < 2.5) {                // 코일 — 따뜻한 금속 + 감긴 자국
    albedo = vec3(0.42, 0.27, 0.19);
    float r = length(p.xy);
    float groove = sin((r - 0.74) * 210.0) * 0.5 + 0.5;
    rough = mix(0.20, 0.55, groove);
    n = normalize(n + normalize(vec3(p.xy, 0.0)) * (groove - 0.5) * 0.10);

  } else if (m < 3.5) {                // 빛 쐐기 — 10칸이 차례로 켜진다
    float slot = floor(ang / (TAU / 10.0));
    float lit = clamp(uCharge * 10.0 - slot, 0.0, 1.0);
    lit = smoothstep(0.0, 0.85, lit);
    albedo = vec3(0.02);
    rough = 0.15;
    metal = 0.0;
    emis = mix(ARC * 0.05, mix(ARC, ARC_HOT, 0.40) * 1.55, lit) * (0.88 + uPulse * 0.10 * lit);

  } else if (m < 4.5) {                // 눈금 게이지
    float ticks = step(0.16, fract(ang / (TAU / 48.0)));
    float filled = step(ang, uCharge * TAU);
    // 채워진 구간 위를 도는 반짝임
    float sweep = pow(max(cos(ang - uSpin), 0.0), 22.0) * filled;
    albedo = vec3(0.03, 0.05, 0.07);
    rough = 0.3;
    metal = 0.0;
    emis = ARC * (0.025 + filled * 0.85 * ticks) + ARC_HOT * sweep * 1.1 * ticks;
    // 차오르는 선두를 밝게
    float head = smoothstep(0.10, 0.0, abs(ang - uCharge * TAU));
    emis += ARC_HOT * head * 1.8 * step(0.02, uCharge);

  } else if (m < 5.5) {                // 안쪽 링 — 충전될수록 금속에서 발광체로
    albedo = mix(vec3(0.20, 0.19, 0.18), ARC * 0.3, uCharge);
    rough = 0.22;
    emis = ARC * uCharge * 0.30;
    n = brushed(p, n, 0.03);

  } else if (m < 6.5) {                // 볼트 · 지지대
    albedo = vec3(0.34, 0.32, 0.30);
    rough = 0.22;

  } else if (m < 7.5) {                // 플라즈마 코어
    float r = length(p.xy) / 0.285;
    float a = clockAngle(p.xy);

    // 채움 반지름이 자란다 — CSS 때 색 정지점을 밀던 것과 같은 원리
    float fill = smoothstep(uCharge, uCharge - 0.12, r);

    // 안에서 바깥으로 밀려 나가는 동심 플라즈마 띠
    float rings = 0.5 + 0.5 * sin(r * 30.0 - uTime * 2.2 - uCharge * 5.0);
    rings = pow(rings, 3.0);
    // 방사형 필라멘트
    float fil = pow(0.5 + 0.5 * sin(a * 12.0 + uTime * 0.7), 4.0);

    float hot = smoothstep(0.42, 0.0, r);
    albedo = vec3(0.02);
    rough = 0.08;
    metal = 0.0;
    emis = mix(ARC * (0.45 + rings * 0.5 + fil * 0.22), ARC_HOT * 2.3, hot)
         * fill * (1.0 + uPulse * 0.10);
    // 차오르는 경계선 — "지금 여기까지 찼다"가 보여야 한다
    emis += ARC_HOT * smoothstep(0.07, 0.0, abs(r - uCharge)) * 1.5 * step(0.03, uCharge);
    emis += ARC * 0.04;

  } else {                             // 뒷벽 — 리액터 빛을 받는다
    vec2 g = abs(fract(p.xy * 0.9) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.022, min(g.x, g.y));
    vec3 L = -p;                                  // 코어는 원점에 있다
    float dist = length(L);
    float atten = 1.0 / (1.0 + dist * dist * 0.42);
    float ndl = max(dot(n, normalize(L)), 0.0);
    vec3 c = vec3(0.004, 0.006, 0.010) + ARC * line * 0.03;
    c += ARC * uCharge * (ndl * 0.75 + line * 0.55) * atten;
    return c;
  }

  vec3 r = reflect(rd, n);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  vec3 F = F0 + (1.0 - F0) * fres;

  // 거친 표면은 환경을 흐리게 본다 — 반사 방향을 법선 쪽으로 당겨 흉내
  vec3 spec = env(normalize(mix(r, n, rough * 0.7))) * F * (1.0 - rough * 0.55);
  vec3 diff = albedo * (1.0 - metal) * (env(n) * 0.7 + 0.015);

  return diff + spec + emis;
}

/* ACES 근사 — 밝은 부분이 흰색으로 타지 않고 곱게 말린다.
   HDR 값을 그대로 자르면 코어가 흰 원반이 되어 버린다. */
vec3 tonemap(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  // 짧은 변 기준으로 정규화 — 세로로 긴 창에서도 리액터가 안 잘린다
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  // 카메라. 흔들림을 카메라 자체에 주면 앞뒤가 다르게 밀린다(진짜 시차).
  vec3 ro = vec3(0.0, 0.0, 4.95);
  vec3 ta = vec3(0.0);
  ro.yz *= rot(-uTilt.y * 0.22);
  ro.xz *= rot( uTilt.x * 0.30);
  ro.xy += uShake * 0.0022;
  ta.xy += uShake * 0.0006;

  /* ⚠️ 외적 순서. cross(worldUp, fwd) 로 쓰면 화면이 좌우로 뒤집혀서
     시계방향으로 채운 게 반시계로 보인다. cross(fwd, worldUp) 이 맞다. */
  vec3 fwd = normalize(ta - ro);
  vec3 rgt = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up  = cross(rgt, fwd);
  vec3 rd  = normalize(uv.x * rgt + uv.y * up + 1.55 * fwd);

  // 레이마칭
  float t = 0.0;
  float mat = -1.0;
  float glow = 0.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    vec2 h = map(p);

    // 발광체 곁을 스칠 때 빛을 모은다 — 싸구려 볼류메트릭 글로우
    if (h.y > 2.5 && h.y < 4.5) glow += 0.016 / (1.0 + 150.0 * h.x * h.x);
    if (h.y > 6.5 && h.y < 7.5) glow += 0.028 / (1.0 + 110.0 * h.x * h.x);

    if (h.x < 0.0012 * t) { mat = h.y; break; }
    t += h.x * 0.88;
    if (t > 9.0) break;
  }

  vec3 col;
  if (mat > 0.0) {
    vec3 p = ro + rd * t;
    col = shade(p, calcNormal(p), rd, mat);
  } else {
    col = vec3(0.004, 0.006, 0.010);
  }

  // 모은 빛을 더한다. 충전량에 비례.
  col += ARC * glow * uCharge * (0.9 + uPulse * 0.12);

  // 코어에서 퍼지는 광채 (화면 공간)
  float d = length(uv);
  col += ARC * uCharge * uCharge * 0.09 / (1.0 + d * d * 18.0);
  // 렌즈 플레어 — 끝에 가서야 터지도록 세제곱
  float flare = pow(uCharge, 3.0);
  col += ARC_HOT * flare * 0.10 / (1.0 + abs(uv.y) * 260.0 + abs(uv.x) * 1.2);

  col = tonemap(col * 1.05);

  // 비네트
  col *= 1.0 - 0.38 * pow(length(uv * vec2(0.85, 1.0)), 2.2);

  // 디더 — 어두운 그라디언트의 띠 무늬(밴딩)를 깬다
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
