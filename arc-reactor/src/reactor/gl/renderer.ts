/* ============================================================
   WebGL 뼈대.

   하는 일은 딱 하나 — 화면을 덮는 삼각형 하나를 그리고,
   그 위 모든 픽셀에서 프래그먼트 셰이더를 돌린다.
   즉 "그리는 것"은 없고 매 픽셀에서 리액터를 **계산**한다.

   유니티로 치면 Blit용 풀스크린 머티리얼 하나 띄운 것과 같다.
   정점 셰이더는 할 일이 없고, 전부 프래그먼트에서 일어난다.
   ============================================================ */

import vertSrc from './reactor.vert.glsl?raw'
import fragSrc from './reactor.frag.glsl?raw'

export type Frame = {
  time: number       // 누적 시간(초)
  charge: number     // 0~1
  pulse: number      // -1~1
  spin: number       // 라디안
  shakeX: number     // px
  shakeY: number
  tiltX: number      // -1~1 마우스 시점 기울이기
  tiltY: number
  rising: number     // 1 충전 중 / 0 감쇠 중 — 점화 반짝임 게이트
  complete: number   // 100% 도달 후 0→1 (충격파)
  recede: number     // 페이지가 열리며 뒤로 물러난다 0→1
  arc: RGB           // tokens.css 의 --color-arc
  arcHot: RGB        // tokens.css 의 --color-arc-hot
}

export type RGB = [number, number, number]

const UNIFORMS = [
  'uRes', 'uTime', 'uCharge', 'uPulse', 'uSpin', 'uShake', 'uTilt',
  'uRising', 'uComplete', 'uRecede', 'uArc', 'uArcHot',
] as const

type Loc = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // 셰이더 오류는 조용히 실패하면 원인을 못 찾는다. 줄 번호까지 찍어 준다.
    const log = gl.getShaderInfoLog(sh) ?? ''
    console.error(
      `[reactor] ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} 셰이더 컴파일 실패\n${log}\n` +
      src.split('\n').map((l, i) => `${String(i + 1).padStart(3)} | ${l}`).join('\n'),
    )
    gl.deleteShader(sh)
    return null
  }
  return sh
}

/** GPU 컨텍스트가 날아갔다 / 돌아왔다를 바깥에 알린다. */
export type GLStatus = 'ok' | 'lost' | 'dead'

export function createRenderer(
  canvas: HTMLCanvasElement,
  onStatus?: (s: GLStatus) => void,
) {
  const gl = (canvas.getContext('webgl', {
    alpha: false,
    antialias: false,       // 레이마칭이라 MSAA는 어차피 안 먹는다
    depth: false,
    powerPreference: 'high-performance',
  }) ?? null) as WebGLRenderingContext | null

  if (!gl) return null

  /* --- GPU 자원. 컨텍스트가 날아가면 전부 무효가 되므로
         한 번에 다시 만들 수 있게 묶어 둔다. --- */
  let prog: WebGLProgram | null = null
  let buf: WebGLBuffer | null = null
  let loc: Loc | null = null

  function build(): boolean {
    const vs = compile(gl!, gl!.VERTEX_SHADER, vertSrc)
    const fs = compile(gl!, gl!.FRAGMENT_SHADER, fragSrc)
    if (!vs || !fs) return false

    const p = gl!.createProgram()!
    gl!.attachShader(p, vs)
    gl!.attachShader(p, fs)
    gl!.linkProgram(p)
    // 링크가 끝나면 셰이더 객체는 더 필요 없다
    gl!.deleteShader(vs)
    gl!.deleteShader(fs)
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      console.error('[reactor] 링크 실패\n' + gl!.getProgramInfoLog(p))
      return false
    }
    gl!.useProgram(p)

    /* 화면을 덮는 "큰 삼각형" 하나.
       사각형 두 개보다 삼각형 하나가 낫다 — 대각선 이음매에서
       픽셀이 두 번 셰이딩되는 낭비가 없다. */
    const b = gl!.createBuffer()
    gl!.bindBuffer(gl!.ARRAY_BUFFER, b)
    gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl!.STATIC_DRAW)
    const aPos = gl!.getAttribLocation(p, 'aPos')
    gl!.enableVertexAttribArray(aPos)
    gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0)

    prog = p
    buf = b
    loc = Object.fromEntries(UNIFORMS.map((n) => [n, gl!.getUniformLocation(p, n)])) as Loc
    return true
  }

  if (!build()) return null

  /* --- 컨텍스트 손실 ---
     모바일에서 탭을 옮기거나 GPU 가 압박받으면 브라우저가 컨텍스트를
     회수한다. 아무것도 안 하면 캔버스가 **영구히 검은 화면**이 되고
     사용자는 이유를 모른다. 흔한 일이라 반드시 처리해야 한다.

     ⚠️ preventDefault() 를 부르지 않으면 브라우저가 복구를 아예 안 해 준다. */
  let alive = true

  const onLost = (e: Event) => {
    e.preventDefault()
    alive = false
    prog = null; buf = null; loc = null
    w = 0; h = 0                        // 복구 뒤 viewport 를 다시 잡게
    onStatus?.('lost')
  }

  const onRestored = () => {
    if (build()) { alive = true; onStatus?.('ok') }
    else onStatus?.('dead')             // 셰이더가 다시 안 붙으면 포기
  }

  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  /* 레이마칭은 픽셀 수에 정비례해 비싸다.
     4K 레티나에서 DPR 그대로 그리면 픽셀이 4배가 된다 → 1.5로 제한. */
  let scale = Math.min(window.devicePixelRatio || 1, 1.5)
  let w = 0
  let h = 0

  function resize() {
    const r = canvas.getBoundingClientRect()
    const nw = Math.max(1, Math.round(r.width * scale))
    const nh = Math.max(1, Math.round(r.height * scale))
    if (nw === w && nh === h) return
    w = nw; h = nh
    canvas.width = w
    canvas.height = h
    gl!.viewport(0, 0, w, h)
  }

  function render(f: Frame) {
    if (!alive || !loc) return          // 컨텍스트가 없는 동안은 조용히 넘긴다
    resize()
    gl!.uniform2f(loc.uRes, w, h)
    gl!.uniform1f(loc.uTime, f.time)
    gl!.uniform1f(loc.uCharge, f.charge)
    gl!.uniform1f(loc.uPulse, f.pulse)
    gl!.uniform1f(loc.uSpin, f.spin)
    gl!.uniform2f(loc.uShake, f.shakeX, f.shakeY)
    gl!.uniform2f(loc.uTilt, f.tiltX, f.tiltY)
    gl!.uniform1f(loc.uRising, f.rising)
    gl!.uniform1f(loc.uComplete, f.complete)
    gl!.uniform1f(loc.uRecede, f.recede)
    gl!.uniform3f(loc.uArc, f.arc[0], f.arc[1], f.arc[2])
    gl!.uniform3f(loc.uArcHot, f.arcHot[0], f.arcHot[1], f.arcHot[2])
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  /** 느리면 해상도를 낮춘다 (0.5 ~ 2.0). 같은 값이면 아무것도 안 한다. */
  function setScale(s: number) {
    if (s === scale) return
    scale = s
    w = 0
    resize()
  }

  function getScale() { return scale }

  /** 테스트용 — 컨텍스트 손실을 일부러 일으킨다. */
  function simulateLoss() {
    const ext = gl!.getExtension('WEBGL_lose_context')
    if (!ext) return false
    ext.loseContext()
    setTimeout(() => ext.restoreContext(), 1200)
    return true
  }

  function dispose() {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
    if (buf) gl!.deleteBuffer(buf)
    if (prog) gl!.deleteProgram(prog)
  }

  return { render, setScale, getScale, simulateLoss, dispose }
}
