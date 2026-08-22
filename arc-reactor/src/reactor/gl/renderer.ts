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
}

const UNIFORMS = [
  'uRes', 'uTime', 'uCharge', 'uPulse', 'uSpin', 'uShake', 'uTilt',
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

export function createRenderer(canvas: HTMLCanvasElement) {
  const gl = (canvas.getContext('webgl', {
    alpha: false,
    antialias: false,       // 레이마칭이라 MSAA는 어차피 안 먹는다
    depth: false,
    powerPreference: 'high-performance',
  }) ?? null) as WebGLRenderingContext | null

  if (!gl) return null

  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc)
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc)
  if (!vs || !fs) return null

  const prog = gl.createProgram()!
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[reactor] 링크 실패\n' + gl.getProgramInfoLog(prog))
    return null
  }
  gl.useProgram(prog)

  /* 화면을 덮는 "큰 삼각형" 하나.
     사각형 두 개보다 삼각형 하나가 낫다 — 대각선 이음매에서
     픽셀이 두 번 셰이딩되는 낭비가 없다. */
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

  const loc = Object.fromEntries(
    UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)]),
  ) as Loc

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
    resize()
    gl!.uniform2f(loc.uRes, w, h)
    gl!.uniform1f(loc.uTime, f.time)
    gl!.uniform1f(loc.uCharge, f.charge)
    gl!.uniform1f(loc.uPulse, f.pulse)
    gl!.uniform1f(loc.uSpin, f.spin)
    gl!.uniform2f(loc.uShake, f.shakeX, f.shakeY)
    gl!.uniform2f(loc.uTilt, f.tiltX, f.tiltY)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  /** 느리면 해상도를 낮춘다 (0.5 ~ 2.0) */
  function setScale(s: number) { scale = s; w = 0; resize() }

  function dispose() {
    gl!.deleteBuffer(buf)
    gl!.deleteProgram(prog)
    gl!.deleteShader(vs!)
    gl!.deleteShader(fs!)
  }

  return { render, setScale, dispose }
}
