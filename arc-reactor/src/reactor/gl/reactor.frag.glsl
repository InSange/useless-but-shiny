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

/* ── 실물 구조를 그대로 따랐다 (프롭 레플리카 정면 사진 여러 장 분석) ──

   반지름 (바깥 = 1.0)          층
     1.00 ~ 0.76   두꺼운 브러시드 금속 판   ← 실루엣을 "깨끗한 원"으로 만든다
     0.78 ~ 0.72   안쪽 립
     0.72 ~ 0.46   코일 10 (반각 7.5°) / 빛 쐐기 10 (반각 13°)
     0.46 ~ 0.32   어두운 금속 링 + 작은 나사 8
     0.32 ~ 0      스포크 휠 (가는 방사선 다수)
     z = -2.6      뒷벽

   기어처럼 보이던 이유: 코일이 바깥 판보다 튀어나와 있었고,
   코일과 빛이 같은 폭이었다. 실물은 코일이 빛의 절반 폭이고
   둘 다 바깥 판 **안쪽**에 갇혀 있다. */
vec2 map(vec3 p) {
  vec2 res = vec2(1e9, -1.0);

  // 뒷벽 — 리액터 빛을 받는 면. 시차와 광량 감쇠가 여기서 보인다.
  res = opU(res, vec2(p.z + 2.6, 8.0));

  // 뒤판 — 전체를 받친다
  res = opU(res, vec2(sdDisc(p - vec3(0.0, 0.0, -0.17), 0.99, 0.05), 1.0));

  // 바깥 금속 판. 두껍고 평평하다 — 여기가 이 물건의 얼굴이다.
  res = opU(res, vec2(sdAnnulus(p, 0.76, 1.00, 0.095), 1.0));

  // 판과 코일 사이의 안쪽 립
  res = opU(res, vec2(sdAnnulus(p - vec3(0.0, 0.0, 0.02), 0.720, 0.780, 0.075), 6.0));

  // 바깥 판에 박힌 볼트 8개
  {
    vec2 q = pModPolar(p.xy, 8.0, 0.0);
    res = opU(res, vec2(length(vec3(q.x - 0.885, q.y, p.z - 0.088)) - 0.033, 6.0));
  }

  // 빛 쐐기 10개 — 넓다. 바깥으로 갈수록 벌어진다.
  {
    vec2 q = pModPolar(p.xy, 10.0, PI / 10.0);
    res = opU(res, vec2(
      sdSector(q, p.z, 0.475, 0.712, radians(13.0), -0.020, 0.052) - 0.012, 3.0));
  }

  // 코일 10개 — 빛의 절반 폭. 좁아야 "코일"로 보인다.
  {
    vec2 q = pModPolar(p.xy, 10.0, 0.0);
    res = opU(res, vec2(
      sdSector(q, p.z, 0.465, 0.715, radians(7.5), 0.005, 0.082) - 0.018, 2.0));
  }

  // 어두운 금속 링 + 눈금
  res = opU(res, vec2(sdAnnulus(p - vec3(0.0, 0.0, -0.015), 0.325, 0.460, 0.062), 4.0));

  // 링에 박힌 작은 나사 8개
  {
    vec2 q = pModPolar(p.xy, 8.0, PI / 8.0);
    res = opU(res, vec2(length(vec3(q.x - 0.392, q.y, p.z - 0.052)) - 0.021, 6.0));
  }

  // 스포크 휠 코어
  res = opU(res, vec2(sdDisc(p - vec3(0.0, 0.0, 0.005), 0.318, 0.048), 7.0));

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

  // 바닥은 어둡고 위로 갈수록 밝은 방
  vec3 c = mix(vec3(0.022, 0.028, 0.042), vec3(0.20, 0.25, 0.33), pow(up, 1.3));

  /* 천장 소프트박스 — 넓고 밝은 판.
     이게 없으면 금속이 비출 게 없어서 흠집도 얼룩도 안 보인다.
     좁은 로브만으로는 딱 그 자리에서만 반짝이고 나머지는 새까맣다. */
  c += vec3(0.92, 0.95, 1.00) * smoothstep(0.30, 0.92, d.y) * 0.55;

  /* 카메라 쪽 방 — 정면을 향한 평평한 금속이 반사할 대상.
     이게 없으면 바깥 판처럼 화면을 정면으로 보는 면이 전부 새까맣게 나온다.
     실제 스튜디오에서 피사체 앞에 흰 반사판을 두는 것과 같은 역할. */
  c += vec3(0.42, 0.46, 0.55) * pow(max(d.z, 0.0), 2.0) * 0.60;

  // 키 라이트 — 왼쪽 위, 좁고 강하게
  c += vec3(1.00, 0.97, 0.92) * pow(max(dot(d, normalize(vec3(-0.55, 0.75, 0.38))), 0.0), 26.0) * 1.5;
  // 필 라이트 — 오른쪽, 차가운 색
  c += vec3(0.35, 0.60, 1.00) * pow(max(dot(d, normalize(vec3(0.80, -0.15, 0.55))), 0.0), 10.0) * 0.45;

  /* 환경에 잔무늬를 넣는다. 완벽히 매끄러운 환경을 비추면
     법선을 아무리 흔들어도 반사 색이 안 변해서 흠집이 안 보인다. */
  c *= 0.82 + 0.36 * vnoise(d.xy * 6.0 + d.z * 2.5);

  // 리액터 자체가 뿜는 빛도 주변에 섞인다
  c += uArc * uCharge * 0.18 * pow(max(dot(d, vec3(0.0, 0.0, 1.0)), 0.0), 3.0);
  return c;
}


/* 원주 방향으로 긁힌 자국 — 브러시드 메탈.
   법선을 접선 방향으로 살짝 흔들면 하이라이트가 길게 늘어난다. */
vec3 brushed(vec3 p, vec3 n, float amt) {
  float r = length(p.xy);
  float s = hash21(vec2(floor(r * 260.0), 0.0)) - 0.5;
  vec3 tangent = normalize(vec3(-p.y, p.x, 0.0) + 1e-5);
  return normalize(n + tangent * s * amt);
}

/* 먼지·기름때·미세 흠집.
   거칠기를 얼룩덜룩하게 만드는 게 핵심이다 — 반사가 고르게 퍼지는 곳과
   또렷한 곳이 섞여야 "만져 본 물건"으로 보인다.
   inout 으로 법선과 거칠기를 같이 고친다. */
void grime(vec3 p, inout vec3 n, inout float rough, inout vec3 albedo) {
  float a  = atan(p.y, p.x);
  float rr = length(p.xy);

  // 넓은 얼룩 — 손자국, 그을음. 거칠기가 얼룩덜룩해야 만져 본 물건이 된다.
  float smudge = fbm(p.xy * 5.5);
  rough = clamp(rough + (smudge - 0.5) * 0.50, 0.04, 0.95);
  albedo *= 0.68 + 0.52 * smudge;

  /* 선반 자국(turning marks) — 각도 방향으로는 길게, 반지름 방향으로는 촘촘하게.
     극좌표에서 비등방 노이즈를 뽑으면 "돌려 깎은 금속"이 된다.
     등방 노이즈로 하면 그냥 오돌토돌한 표면이지 가공한 금속이 아니다.

     ⚠️ 주파수 두 번 틀렸다:
       1) 엡실론은 노이즈 좌표계에서 재야 한다 (월드 단위로 주면 기울기가 0)
       2) 화면에서 한 주기가 2px면 뭉개져서 안 보인다.
          리액터가 화면에서 ~700px 이고 월드 2단위니, 6px 무늬는 주파수 ~60. */
  vec2 q = vec2(a * 5.0, rr * 80.0);
  float e = 0.4;
  float h0 = vnoise(q);
  vec2 g = vec2(vnoise(q + vec2(e, 0.0)) - h0,
                vnoise(q + vec2(0.0, e)) - h0) / e;

  vec3 tang = normalize(vec3(-p.y, p.x, 0.0) + 1e-5);
  vec3 rad  = normalize(vec3(p.xy, 0.0) + 1e-5);
  n = normalize(n + tang * g.x * 0.035 + rad * g.y * 0.10);

  // 드문드문 깊게 파인 자국 — 하이라이트를 확 끊어 준다
  float deep = smoothstep(0.86, 0.99, vnoise(vec2(a * 9.0, rr * 26.0)));
  rough = mix(rough, 0.85, deep * 0.7);
  albedo *= 1.0 - deep * 0.25;
}


vec3 shade(vec3 p, vec3 n, vec3 rd, float m) {
  vec3 v = -rd;

  vec3 albedo = vec3(0.05);
  float rough = 0.4;
  float metal = 1.0;
  vec3 emis = vec3(0.0);

  float ang = clockAngle(p.xy);

  if (m < 1.5) {                       // 바깥 브러시드 알루미늄 판
    albedo = vec3(0.62, 0.62, 0.63);   // 검은 강철이 아니라 밝은 알루미늄이다
    float rr = length(p.xy);
    float grooves = 0.5 + 0.5 * sin(rr * 110.0);
    rough = mix(0.30, 0.46, grooves);
    albedo *= 0.90 + 0.10 * grooves;
    n = brushed(p, n, 0.07);
    grime(p, n, rough, albedo);

  } else if (m < 2.5) {                // 코일 — 따뜻한 금속 + 감긴 자국
    albedo = vec3(0.50, 0.33, 0.23);
    float r = length(p.xy);
    float groove = sin((r - 0.74) * 210.0) * 0.5 + 0.5;
    rough = mix(0.20, 0.55, groove);
    n = normalize(n + normalize(vec3(p.xy, 0.0)) * (groove - 0.5) * 0.10);
    grime(p, n, rough, albedo);

  } else if (m < 3.5) {                // 빛 쐐기 — 10칸이 차례로 켜진다
    float slot = floor(ang / (TAU / 10.0));
    float t = uCharge * 10.0 - slot;          // 0 을 넘는 순간 이 칸이 켜진다
    float lit = smoothstep(0.0, 0.85, clamp(t, 0.0, 1.0));
    albedo = vec3(0.02);
    rough = 0.15;
    metal = 0.0;
    emis = mix(uArc * 0.05, mix(uArc, uArcHot, 0.40) * 1.55, lit) * (0.88 + uPulse * 0.10 * lit);

    /* 점화 — 켜진 직후 확 튀었다가 빠르게 식는다.
       t 는 칸당 0→1 이고 한 칸이 0.8초라, exp(-t*7) 이면 0.1초쯤 번쩍인다.
       uRising 을 곱해 "빠질 때"는 안 튀게 한다 — 꺼지면서 번쩍이면 이상하다. */
    float ignite = exp(-max(t, 0.0) * 7.0) * step(0.0, t) * uRising;
    emis += mix(uArc, uArcHot, 0.7) * ignite * 2.6;

  } else if (m < 4.5) {                // 어두운 금속 링 — 실물엔 여기 잔 디테일이 많다
    float tf = fract(ang / (TAU / 72.0));
    float ticks = smoothstep(0.30, 0.40, tf) * smoothstep(0.78, 0.68, tf);
    float filled = smoothstep(-0.02, 0.02, uCharge * TAU - ang);
    float sweep = pow(max(cos(ang - uSpin), 0.0), 22.0) * filled;

    albedo = vec3(0.22, 0.22, 0.24);
    rough = 0.32;
    metal = 1.0;
    grime(p, n, rough, albedo);

    // 눈금이 차오른다. 주인공은 쐐기와 스포크 휠이라 여기는 은근하게.
    emis = uArc * ticks * (0.03 + filled * 0.55) + uArcHot * sweep * ticks * 0.8;
    emis += uArcHot * smoothstep(0.045, 0.0, abs(ang - uCharge * TAU))
          * 1.1 * step(0.02, uCharge);

  } else if (m < 5.5) {                // 안쪽 링 — 충전될수록 금속에서 발광체로
    albedo = mix(vec3(0.20, 0.19, 0.18), uArc * 0.3, uCharge);
    rough = 0.22;
    emis = uArc * uCharge * 0.30;
    n = brushed(p, n, 0.03);

  } else if (m < 6.5) {                // 볼트 · 지지대
    albedo = vec3(0.34, 0.32, 0.30);
    rough = 0.22;
    grime(p, n, rough, albedo);

  } else if (m < 7.5) {                // 스포크 휠 — 실물의 터빈 같은 무늬
    float rn = length(p.xy) / 0.318;

    /* 가는 방사선 60개. 매끈한 빛 덩어리로 두면 "빛나는 공"이지
       기계 부품이 아니다. 실물은 여기가 제일 촘촘하다. */
    float spokes = smoothstep(0.86, 1.0, abs(cos(ang * 30.0)));
    spokes *= smoothstep(0.14, 0.30, rn);            // 중심 근처는 스포크가 없다
    float rings = smoothstep(0.78, 1.0, abs(sin(rn * 18.0 - uTime * 0.7)));
    float hub   = smoothstep(0.17, 0.0, rn);

    /* 여기는 진행률을 "시계방향으로" 표시하지 않는다.
       반쪽만 켜면 파이 차트로 보이고, 실물은 중심이 늘 고르게 빛난다.
       진행률은 쐐기 10칸과 눈금 링이 맡고, 스포크 휠은 세기만 따라간다. */
    albedo = vec3(0.02);
    rough = 0.10;
    metal = 0.0;

    vec3 on = uArc * (0.18 + spokes * 1.6 + rings * 0.40);
    emis = on * (0.06 + uCharge * 0.94) * (1.0 + uPulse * 0.08);
    emis += mix(uArc, uArcHot, 0.8) * hub * (0.25 + uCharge * 2.4);
    // 완료 순간 한 번 과열됐다가 가라앉는다
    emis += uArcHot * exp(-uComplete * 4.0) * step(0.001, uComplete) * 2.2;

  } else {                             // 뒷벽 — 리액터 빛을 받는다
    vec2 g = abs(fract(p.xy * 0.9) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.022, min(g.x, g.y));
    vec3 L = -p;                                  // 코어는 원점에 있다
    float dist = length(L);
    float atten = 1.0 / (1.0 + dist * dist * 0.20);
    float ndl = max(dot(n, normalize(L)), 0.0);
    vec3 c = vec3(0.011, 0.014, 0.021) + uArc * line * 0.06;
    c += uArc * uCharge * (ndl * 0.75 + line * 0.55) * atten;
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
  col += uArc * glow * uCharge * (0.9 + uPulse * 0.12);

  // 코어에서 퍼지는 광채 (화면 공간)
  float d = length(uv);
  col += uArc * uCharge * uCharge * 0.09 / (1.0 + d * d * 18.0);
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

  /* 비네트. 세게 걸면 모서리가 통째로 죽어서 "동그란 창으로 보는" 꼴이 된다.
     화면 밖으로 자연스럽게 어두워지는 정도면 충분하다. */
  col *= 1.0 - 0.20 * pow(length(uv * vec2(0.62, 0.95)), 2.0);

  // 디더 — 어두운 그라디언트의 띠 무늬(밴딩)를 깬다
  col += (hash21(gl_FragCoord.xy + uTime) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
