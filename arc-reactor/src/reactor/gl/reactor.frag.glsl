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
uniform float uRising;   // 1 충전 중 / 0 감쇠 중 — 점화 반짝임을 켤 때만 쓴다
uniform float uComplete; // 100% 도달 후 0→1 (충격파용)

/* 색은 tokens.css 의 --color-arc / --color-arc-hot 에서 온다.
   여기 상수로 박아 두면 색 테마를 바꿀 때 두 군데를 고쳐야 한다. */
uniform vec3  uArc;      // 아크 광원 색
uniform vec3  uArcHot;   // 코어 중심

#define PI  3.14159265359
#define TAU 6.28318530718

/* ---------- 재질 번호 ----------
   1 하우징 · 2 코일 · 3 빛 쐐기 · 4 게이지 · 5 안쪽 링 · 6 볼트/지지대
   7 코어 · 8 뒷벽 */

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

/* 값 노이즈 + fbm. 먼지·흠집을 만드는 데 쓴다.
   텍스처 파일 없이 표면을 지저분하게 만드는 게 목적이다 —
   완벽하게 매끈한 표면은 CG 티가 나고, 실물은 항상 더럽다. */
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return v;
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

/* 부채꼴 조각 — 반지름 rIn~rOut, 반각 th, 두께 2*zh.
   상자로 만들면 안팎 폭이 같아서 파이 조각이 안 된다.
   실물의 빛 쐐기는 바깥으로 갈수록 넓어진다 — 그게 "톱니"와 "빛살"을 가른다.

   q 는 pModPolar 로 접은 좌표(+x 가 부채꼴 중심). */
float sdSector(vec2 q, float z, float rIn, float rOut, float th, float zc, float zh) {
  float rd = abs(length(q) - (rIn + rOut) * 0.5) - (rOut - rIn) * 0.5;
  float ad = dot(vec2(abs(q.y), -q.x), vec2(cos(th), sin(th)));
  float zd = abs(z - zc) - zh;
  vec3 w = vec3(rd, ad, zd);
  return min(max(w.x, max(w.y, w.z)), 0.0) + length(max(w, 0.0));
}

vec2 opU(vec2 a, vec2 b) { return a.x < b.x ? a : b; }

/* 12시에서 시계방향으로 잰 각도 (0 ~ TAU).
   충전이 어디까지 찼는지 판단하는 기준. */
float clockAngle(vec2 p) { return mod(atan(p.x, p.y), TAU); }

/* ── 구조 (레퍼런스: 불 켜진 MK1 정면, 순수한 검정 배경) ──

   반지름 (바깥 = 1.0)          층
     1.00 ~ 0.84   팔 끝의 금속 페룰 캡 10
     0.86 ~ 0.55   발광 코일 몸통 10  ← 팔이 스스로 빛난다
     0.58 ~ 0.36   두꺼운 크롬 링 (이 물건의 중심 질량)
     0.37 ~ 0.30   안쪽 립
     0.30 ~ 0      코어 — 하얗게 탄다
     z = -3.4      아주 어두운 뒷면 (거의 검정)

   팔이 바깥으로 튀어나오는 건 맞다. 톱니로 보였던 건 팔이
   **어둡고 각졌기** 때문이다. 빛나는 둥근 팔은 기어로 안 읽힌다. */
vec2 map(vec3 p) {
  vec2 res = vec2(1e9, -1.0);

  // 뒷면 — 거의 검정. 리액터가 허공에 뜬 것처럼 보이게 한다.
  res = opU(res, vec2(p.z + 3.4, 8.0));

  // 팔 10개
  {
    vec2 q = pModPolar(p.xy, 10.0, 0.0);

    // 발광 코일 몸통 — 둥글게 굴려야 톱니가 아니라 부품이 된다
    res = opU(res, vec2(
      sdSector(q, p.z, 0.575, 0.840, radians(9.5), 0.0, 0.095) - 0.040, 3.0));

    // 팔 끝 금속 페룰 캡 — 살짝 더 넓고 더 두껍다
    res = opU(res, vec2(
      sdSector(q, p.z, 0.855, 0.975, radians(10.5), 0.0, 0.110) - 0.042, 2.0));
  }

  // 두꺼운 크롬 링 — 팔들이 여기 꽂힌다
  res = opU(res, vec2(sdAnnulus(p, 0.395, 0.565, 0.130), 1.0));

  // 안쪽 립
  res = opU(res, vec2(sdAnnulus(p - vec3(0.0, 0.0, 0.03), 0.330, 0.405, 0.100), 6.0));

  // 코어
  res = opU(res, vec2(sdDisc(p - vec3(0.0, 0.0, 0.02), 0.335, 0.062), 7.0));

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

/* ---------- 환경 ----------
   금속은 자기 색이 없다. 100% 반사라서 **비치는 것**이 곧 그 금속의 모습이다.
   그래서 환경이 매끈한 그라디언트면 아무리 재질을 만져도 플라스틱으로 보인다.

   진짜 큐브맵 대신 "방향 → 색" 함수를 쓰되, 제품 사진 스튜디오처럼
   **가장자리가 뚜렷한 소프트박스**를 넣는 게 핵심이다.
   금속에 네모난 창이 비쳐야 눈이 금속으로 읽는다. */

/* 방향을 방위각/고도로 바꿔 직사각 광원을 만든다. */
float softbox(vec3 d, vec2 center, vec2 half_, float feather) {
  vec2 sph = vec2(atan(d.x, d.z), asin(clamp(d.y, -1.0, 1.0)));
  vec2 q = abs(sph - center) - half_;
  return 1.0 - smoothstep(0.0, feather, max(q.x, q.y));
}

vec3 env(vec3 d) {
  float up = d.y * 0.5 + 0.5;

  // 바닥은 어둡고 위로 갈수록 밝은 방 + 지평선
  vec3 c = mix(vec3(0.012, 0.016, 0.026), vec3(0.16, 0.20, 0.27), pow(up, 1.4));
  c = mix(c * 0.35, c, smoothstep(-0.06, 0.06, d.y));   // 바닥은 확 어둡게

  // 키 소프트박스 — 왼쪽 위. 네모난 반사가 금속감의 8할이다.
  c += vec3(1.00, 0.98, 0.94) * softbox(d, vec2(-0.85, 0.72), vec2(0.60, 0.30), 0.05) * 3.4;
  // 필 소프트박스 — 오른쪽, 좁고 차갑게
  c += vec3(0.42, 0.62, 1.00) * softbox(d, vec2( 1.15, 0.05), vec2(0.16, 0.55), 0.07) * 1.1;
  // 뒤쪽 림 라이트
  c += vec3(0.75, 0.85, 1.00) * softbox(d, vec2( 2.60,-0.35), vec2(0.45, 0.20), 0.10) * 0.8;

  /* 카메라 쪽 방 — 정면을 향한 평평한 금속이 반사할 대상.
     이게 없으면 화면을 정면으로 보는 면이 전부 새까맣게 나온다. */
  c += vec3(0.30, 0.34, 0.42) * pow(max(d.z, 0.0), 3.0) * 0.55;

  // 잔무늬 — 흠집이 잡아챌 고주파 성분
  c *= 0.86 + 0.28 * vnoise(d.xy * 6.0 + d.z * 2.5);

  // 리액터 자체가 뿜는 빛도 주변에 섞인다
  c += uArc * uCharge * 0.20 * pow(max(dot(d, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  return c;
}

/* 거친 표면은 환경을 흐리게 본다.
   반사 방향 둘레를 몇 번 더 찍어 평균 낸다 — 밉맵 대신 쓰는 싸구려 방법.
   반사 방향을 법선 쪽으로 당기기만 하면 "흐려지는" 게 아니라 "빗나간다". */
vec3 envBlur(vec3 r, vec3 n, float rough) {
  vec3 t = normalize(cross(n, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
  vec3 b = cross(n, t);
  float sp = rough * rough * 0.7;
  vec3 c = env(r) * 0.40;
  c += env(normalize(r + t * sp)) * 0.15;
  c += env(normalize(r - t * sp)) * 0.15;
  c += env(normalize(r + b * sp)) * 0.15;
  c += env(normalize(r - b * sp)) * 0.15;
  return c;
}

/* 주변 차폐 — 틈새가 어두워진다.
   법선 방향으로 조금씩 나가 보면서 "생각보다 가까이 뭔가 있으면" 막힌 것이다.
   레이마칭에서는 거의 공짜이고, 이것 하나로 깊이감이 확 산다. */
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.012 + 0.055 * float(i);
    occ += (h - map(p + n * h).x) * sca;
    sca *= 0.80;
  }
  return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}

/* 부드러운 그림자 — 광선을 광원 쪽으로 쏘면서 "얼마나 아슬아슬하게 스쳤나"를 본다.
   팔이 링에 드리우는 그림자가 생기면 앞뒤 관계가 눈에 보인다. */
float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 24; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, k * h / t);
    if (res < 0.005 || t > 3.5) break;
    t += clamp(h, 0.02, 0.20);
  }
  return clamp(res, 0.0, 1.0);
}

/* 원주 방향으로 긁힌 자국 — 브러시드 메탈.
   법선을 접선 방향으로 살짝 흔들면 하이라이트가 길게 늘어난다. */
vec3 brushed(vec3 p, vec3 n, float amt) {
  float r = length(p.xy);
  float sc = hash21(vec2(floor(r * 260.0), 0.0)) - 0.5;
  vec3 tangent = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-5));
  return normalize(n + tangent * sc * amt);
}

/* 먼지·기름때·선반 자국.
   거칠기를 얼룩덜룩하게 만드는 게 핵심이다 — 반사가 고르게 퍼지는 곳과
   또렷한 곳이 섞여야 "만져 본 물건"으로 보인다. */
void grime(vec3 p, inout vec3 n, inout float rough, inout vec3 albedo) {
  float a  = atan(p.y, p.x);
  float rr = length(p.xy);

  // 넓은 얼룩 — 손자국, 그을음
  float smudge = fbm(p.xy * 5.5);
  rough = clamp(rough + (smudge - 0.5) * 0.50, 0.04, 0.95);
  albedo *= 0.68 + 0.52 * smudge;

  /* 선반 자국 — 각도 방향으로는 길게, 반지름 방향으로는 촘촘하게.
     극좌표에서 비등방 노이즈를 뽑으면 "돌려 깎은 금속"이 된다.

     ⚠️ 주파수 두 번 틀렸다:
       1) 엡실론은 노이즈 좌표계에서 재야 한다 (월드 단위로 주면 기울기가 0)
       2) 화면에서 한 주기가 2px면 뭉개져서 안 보인다 — 픽셀 기준으로 잡을 것 */
  vec2 q = vec2(a * 5.0, rr * 80.0);
  float e = 0.4;
  float h0 = vnoise(q);
  vec2 g = vec2(vnoise(q + vec2(e, 0.0)) - h0,
                vnoise(q + vec2(0.0, e)) - h0) / e;

  vec3 tang = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-5));
  vec3 rad  = normalize(vec3(p.xy, 0.0) + vec3(1e-5));
  n = normalize(n + tang * g.x * 0.035 + rad * g.y * 0.10);

  // 드문드문 깊게 파인 자국 — 하이라이트를 확 끊어 준다
  float deep = smoothstep(0.86, 0.99, vnoise(vec2(a * 9.0, rr * 26.0)));
  rough = mix(rough, 0.85, deep * 0.7);
  albedo *= 1.0 - deep * 0.25;
}

/* 실제 금속의 F0(수직 입사 반사율). 이 값이 금속의 "색"이다.
   전부 회색으로 두면 알루미늄도 구리도 똑같아 보인다. */
const vec3 F0_ALUM   = vec3(0.91, 0.92, 0.92);
const vec3 F0_CHROME = vec3(0.55, 0.56, 0.55);
const vec3 F0_STEEL  = vec3(0.56, 0.57, 0.58);
const vec3 F0_COPPER = vec3(0.95, 0.64, 0.54);

const vec3 KEY_DIR = vec3(-0.5145, 0.7207, 0.4652);   // normalize(-0.55,0.77,0.5)

vec3 shade(vec3 p, vec3 n, vec3 rd, float m) {
  vec3 v = -rd;

  vec3 albedo = vec3(0.05);
  float rough = 0.4;
  float metal = 1.0;
  vec3 f0 = F0_STEEL;          // 금속의 "색" — 수직 입사 반사율
  vec3 emis = vec3(0.0);

  float ang = clockAngle(p.xy);
  float rr  = length(p.xy);

  if (m < 1.5) {                       // 두꺼운 크롬 링 — 이 물건의 중심 질량
    albedo = vec3(0.72, 0.80, 0.90);   // 레퍼런스의 링은 푸르스름한 유리질 크롬
    f0 = F0_CHROME * vec3(0.94, 1.00, 1.08);   // 살짝 푸른 크롬
    rough = 0.10;                      // 거울에 가깝다. 그래야 크롬으로 보인다
    // 둘레를 따라 촘촘한 홈 (널링). 반사가 잘려서 금속 티가 확 난다
    /* 널링을 150줄로 하면 화면에서 1px 미만이라 회색으로 뭉갠다.
       굵게 줄여야 홈으로 보인다 — 무늬 주파수는 픽셀 기준. */
    float knurl = 0.5 + 0.5 * sin(ang * 44.0);
    rough = mix(rough, 0.26, knurl);
    n = brushed(p, n, 0.03);
    grime(p, n, rough, albedo);

    // 눈금이 차오른다 — 연속 진행률은 여기서 읽는다
    /* 눈금을 링 전체에 깔면 회색 줄무늬 덩어리가 된다.
       바깥 가장자리 좁은 띠에만 두고 나머지는 깨끗한 크롬으로 남긴다. */
    float band = smoothstep(0.485, 0.500, rr) * smoothstep(0.560, 0.545, rr);
    float tf = fract(ang / (TAU / 60.0));
    float ticks = smoothstep(0.30, 0.42, tf) * smoothstep(0.76, 0.64, tf) * band;
    float filled = smoothstep(-0.02, 0.02, uCharge * TAU - ang);
    float sweep = pow(max(cos(ang - uSpin), 0.0), 24.0) * filled;
    emis = uArc * ticks * (0.02 + filled * 0.9) + uArcHot * sweep * ticks * 1.2;
    emis += uArc * uCharge * 0.06;      // 링이 코어 빛을 받는다
    emis += uArcHot * smoothstep(0.04, 0.0, abs(ang - uCharge * TAU))
          * 1.2 * step(0.02, uCharge);

  } else if (m < 2.5) {                // 팔 끝 금속 페룰 캡
    albedo = vec3(0.34, 0.35, 0.38);
    f0 = F0_STEEL * 0.72;              // 어두운 강철
    rough = 0.18;
    // 캡을 따라 도는 링 홈
    float band = 0.5 + 0.5 * sin(rr * 130.0);
    rough = mix(rough, 0.42, band);
    albedo *= 0.85 + 0.20 * band;
    grime(p, n, rough, albedo);
    // 옆에서 새는 빛을 조금 받는다
    emis = uArc * uCharge * 0.10;

  } else if (m < 3.5) {                // 발광 코일 몸통 — 10칸이 차례로 켜진다
    float slot = floor(ang / (TAU / 10.0));
    float t = uCharge * 10.0 - slot;          // 0 을 넘는 순간 이 칸이 켜진다
    float lit = smoothstep(0.0, 0.80, clamp(t, 0.0, 1.0));

    /* 감긴 코일 사이로 빛이 샌다. 균일한 빛 덩어리가 아니라
       줄무늬가 있어야 "감긴 코일"로 읽힌다. */
    float wind = 0.5 + 0.5 * sin((rr - 0.575) * 150.0);
    float body = mix(0.28, 1.0, wind);   // 줄무늬가 뚜렷해야 감긴 코일로 읽힌다

    albedo = vec3(0.03);
    rough = 0.18;
    metal = 0.0;
    emis = mix(uArc * 0.04, mix(uArc, uArcHot, 0.26) * 1.65 * body, lit)
         * (0.88 + uPulse * 0.10 * lit);

    /* 점화 — 켜진 직후 확 튀었다가 빠르게 식는다.
       uRising 을 곱해 "빠질 때"는 안 튀게 한다. */
    float ignite = exp(-max(t, 0.0) * 7.0) * step(0.0, t) * uRising;
    emis += mix(uArc, uArcHot, 0.75) * ignite * 3.0;

  } else if (m < 6.5) {                // 안쪽 립
    albedo = vec3(0.60, 0.62, 0.66);
    f0 = F0_ALUM;
    rough = 0.14;
    grime(p, n, rough, albedo);
    emis = uArc * uCharge * 0.25;

  } else if (m < 7.5) {                // 코어 — 하얗게 탄다
    float rn = rr / 0.335;

    // 아주 가는 방사선 — 탄 중심 밖에서만 보인다
    float spokes = smoothstep(0.88, 1.0, abs(cos(ang * 26.0)));
    spokes *= smoothstep(0.42, 0.70, rn);
    float rings = smoothstep(0.80, 1.0, abs(sin(rn * 14.0 - uTime * 0.6)));

    // 채움 반지름이 자란다
    float fill = smoothstep(uCharge, uCharge - 0.10, rn);
    float blown = smoothstep(0.82, 0.05, rn);  // 가운데가 넓게 날아간다

    albedo = vec3(0.02);
    rough = 0.08;
    metal = 0.0;

    vec3 on = uArc * (0.35 + spokes * 1.5 + rings * 0.35);
    emis = mix(on, uArcHot * 5.5, blown) * fill * (0.10 + uCharge * 0.90)
         * (1.0 + uPulse * 0.08);
    emis += uArcHot * smoothstep(0.06, 0.0, abs(rn - uCharge)) * 1.4 * step(0.03, uCharge);
    emis += uArcHot * exp(-uComplete * 4.0) * step(0.001, uComplete) * 3.0;

  } else {                             // 뒷면 — 거의 검정. 리액터가 허공에 뜬다.
    vec3 L = -p;
    float dist = length(L);
    float atten = 1.0 / (1.0 + dist * dist * 0.9);
    float ndl = max(dot(n, normalize(L)), 0.0);
    return vec3(0.002, 0.003, 0.005) + uArc * uCharge * ndl * atten * 0.30;
  }

  /* ---------- 조명 ----------
     여기가 "그림"과 "물건"을 가른다.
       ao   : 틈새가 어두워진다 → 깊이
       sh   : 팔이 링에 그림자를 드리운다 → 앞뒤 관계
       GGX  : 하이라이트 모양이 거칠기에 맞게 변한다
       IBL  : 금속이 주변(소프트박스)을 비춘다 → 금속감의 8할 */
  vec3 vv = -rd;
  float ao = calcAO(p, n);
  float sh = softShadow(p + n * 0.02, KEY_DIR, 10.0);

  const vec3 KEY_COL = vec3(1.00, 0.97, 0.92) * 1.7;

  vec3 F0 = mix(vec3(0.045), f0, metal);

  // --- 키 라이트 GGX ---
  vec3 hv = normalize(KEY_DIR + vv);
  float NoV = max(dot(n, vv), 1e-4);
  float NoL = max(dot(n, KEY_DIR), 0.0);
  float NoH = max(dot(n, hv), 0.0);
  float VoH = max(dot(vv, hv), 0.0);

  float a  = max(rough * rough, 0.0025);
  float a2 = a * a;
  float den = NoH * NoH * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * den * den);
  float k = a * 0.5;
  float G = (NoL / (NoL * (1.0 - k) + k)) * (NoV / (NoV * (1.0 - k) + k));
  vec3 Fs = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  vec3 keySpec = D * G * Fs * KEY_COL * NoL * sh;

  // --- 환경 반사 (IBL 근사) ---
  vec3 refl = reflect(rd, n);
  float fres = pow(1.0 - NoV, 5.0);
  // 거친 표면일수록 프레넬이 덜 튄다 — 안 그러면 가장자리가 하얗게 탄다
  vec3 Fi = F0 + (max(vec3(1.0 - rough), F0) - F0) * fres;
  vec3 ibl = envBlur(refl, n, rough) * Fi * ao;

  // --- 확산 (비금속만) ---
  vec3 diff = albedo * (1.0 - metal) * (env(n) * 0.5 + 0.02) * ao;
  diff += albedo * (1.0 - metal) * KEY_COL * NoL * sh * 0.22;

  return diff + ibl + keySpec + emis;
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
  vec3 ro = vec3(0.0, 0.0, 5.15);
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
    if (h.y > 2.5 && h.y < 3.5) glow += 0.034 / (1.0 + 110.0 * h.x * h.x);
    if (h.y > 6.5 && h.y < 7.5) glow += 0.055 / (1.0 +  80.0 * h.x * h.x);

    if (h.x < 0.0012 * t) { mat = h.y; break; }
    t += h.x * 0.88;
    if (t > 9.0) break;
  }

  vec3 col;
  if (mat > 0.0) {
    vec3 p = ro + rd * t;
    col = shade(p, calcNormal(p), rd, mat);
  } else {
    col = vec3(0.002, 0.003, 0.005);
  }

  // 모은 빛을 더한다. 충전량에 비례.
  col += uArc * glow * uCharge * (0.9 + uPulse * 0.12);

  /* 코어에서 퍼지는 광채 (화면 공간).
     좁은 코어 광채 + 넓은 후광 두 겹으로 쌓으면 진짜 블룸처럼 보인다.
     한 겹만 쓰면 "동그란 반투명 원"이 붙은 티가 난다. */
  float d = length(uv);
  col += uArcHot * uCharge * uCharge * 0.13 / (1.0 + d * d * 26.0);
  col += uArc    * pow(uCharge, 1.5)  * 0.09 / (1.0 + d * d * 4.5);
  // 렌즈 플레어 — 끝에 가서야 터지도록 세제곱
  float flare = pow(uCharge, 3.0);
  col += uArcHot * flare * 0.10 / (1.0 + abs(uv.y) * 260.0 + abs(uv.x) * 1.2);

  /* 100% 도달 순간 — 밖으로 퍼지는 충격파 한 발.
     uComplete 는 완료 후 0→1 로 오르는 값이라, 반지름은 커지고 세기는 준다. */
  if (uComplete > 0.0) {
    float wave = uComplete * 2.4;
    float ring = smoothstep(0.16, 0.0, abs(d - wave)) * (1.0 - uComplete);
    col += uArcHot * ring * 1.4;
    col += uArc * pow(1.0 - uComplete, 3.0) * 0.5;   // 전체 플래시
  }

  col = tonemap(col * 1.05);

  // 배경이 이미 검정이라 비네트는 아주 살짝만
  col *= 1.0 - 0.10 * pow(length(uv * vec2(0.62, 0.95)), 2.0);

  // 디더 — 어두운 그라디언트의 띠 무늬(밴딩)를 깬다
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
