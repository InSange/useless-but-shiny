/* ============================================================
   WebGL 뼈대.

   화면을 덮는 삼각형 하나를 그리고, 그 위 모든 픽셀에서
   프래그먼트 셰이더를 돌린다. "그리는 것"은 없고 매 픽셀에서
   빛과 그림자를 **계산**한다.

   ⚠️ 이 캔버스는 페이지 위에 얹힌 가림막이다. 그래서 알파가 중요하다.
   premultipliedAlpha: false 로 둔다 — 셰이더가 색과 알파를 따로 낸다.
   기본값(true)으로 두면 어두운 곳에서 색이 검게 눌린다.
   ============================================================ */

import vertSrc from './dark.vert.glsl?raw'
import fragSrc from './dark.frag.glsl?raw'

const MAX_PROPS = 8

export type PropBox = { x: number; y: number; hw: number; hh: number; rot: number }

export type Frame = {
  time: number
  lightX: number
  lightY: number
  battery: number     // 0~1
  reveal: number      // 0~1
  props: PropBox[]
  /** 기억 격자 (0~255). 길이는 memW * memH */
  memory: Uint8Array
  memW: number
  memH: number
  voidColor: [number, number, number]
  beamColor: [number, number, number]
}

/* 셰이더가 컴파일에 실패하면 어느 줄인지 알아야 한다.
   그냥 로그만 찍으면 "ERROR: 0:57" 만 나오고 57번 줄이 뭔지 모른다.
   아크 리액터 만들 때 이거 없이 30분 헤맸다. */
function compile(g: WebGLRenderingContext, type: number, src: string) {
  const sh = g.createShader(type)!
  g.shaderSource(sh, src)
  g.compileShader(sh)
  if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
    const log = g.getShaderInfoLog(sh) ?? ''
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(3)} | ${l}`).join('\n')
    throw new Error(`셰이더 컴파일 실패\n${log}\n\n${numbered}`)
  }
  return sh
}

export function createRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
  })
  if (!gl) throw new Error('WebGL 을 쓸 수 없다')
  /* 여기서 한 번 못 박아 둔다. 아래 render() 는 클로저 안이라
     타입스크립트가 위의 null 검사를 기억하지 못한다 — 매번 gl! 를
     붙이느니 널 아닌 이름을 하나 만드는 게 낫다. */
  const g: WebGLRenderingContext = gl

  const prog = g.createProgram()!
  g.attachShader(prog, compile(g, g.VERTEX_SHADER, vertSrc))
  g.attachShader(prog, compile(g, g.FRAGMENT_SHADER, fragSrc))
  g.linkProgram(prog)
  if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
    throw new Error(g.getProgramInfoLog(prog) ?? '링크 실패')
  }
  g.useProgram(prog)

  /* 화면을 덮는 삼각형 **하나**. 사각형(삼각형 둘)보다 낫다 —
     두 삼각형이 만나는 대각선에서 GPU 가 픽셀을 두 번 계산하는 낭비가 없다. */
  const buf = g.createBuffer()
  g.bindBuffer(g.ARRAY_BUFFER, buf)
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW)
  const aPos = g.getAttribLocation(prog, 'aPos')
  g.enableVertexAttribArray(aPos)
  g.vertexAttribPointer(aPos, 2, g.FLOAT, false, 0, 0)

  const u = (n: string) => g.getUniformLocation(prog, n)
  const loc = {
    res: u('uRes'), light: u('uLight'), time: u('uTime'),
    battery: u('uBattery'), reveal: u('uReveal'),
    props: u('uProps[0]'), propRot: u('uPropRot[0]'),
    memory: u('uMemory'), void: u('uVoid'), beam: u('uBeam'),
  }

  /* 기억 격자를 담을 텍스처.
     LUMINANCE = 채널 하나. 밝기만 있으면 되므로 RGBA 는 낭비다.
     LINEAR = 칸 사이를 부드럽게 이어 준다. 기억은 흐릿해야 기억 같다. */
  const memTex = g.createTexture()
  g.bindTexture(g.TEXTURE_2D, memTex)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE)
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE)
  g.pixelStorei(g.UNPACK_ALIGNMENT, 1)   // 폭이 4의 배수가 아니어도 깨지지 않게
  g.uniform1i(loc.memory, 0)

  /* ⚠️ 블렌딩을 켜면 안 된다.

     처음에 gl.blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA) 를 켰다가
     "한 번 어두웠던 자리가 다시는 안 밝아지는" 버그를 만들었다.
     이 식은 색만이 아니라 **알파 채널에도 그대로** 적용된다:

         A = As·As + Ad·(1-As)

     밝은 곳은 As=0 이므로 A = Ad — 직전 프레임의 알파가 그대로 남는다.
     매 프레임 어둠이 쌓이기만 하고 걷히지 않는다.

     여기서는 화면을 덮는 삼각형 **한 장**만 그린다. 겹칠 것이 없으니
     블렌딩 자체가 필요 없다. 셰이더가 낸 알파를 그대로 쓰면 되고,
     그 알파로 페이지 위에 얹는 일은 브라우저가 한다. */
  g.disable(g.BLEND)

  const propBuf = new Float32Array(MAX_PROPS * 4)
  const rotBuf = new Float32Array(MAX_PROPS)
  let memSize = [0, 0]

  function resize() {
    /* 그림자 계산은 픽셀마다 도는 반복문이다. 레티나에서 dpr=3 이면
       픽셀이 9배가 된다. 어차피 빛과 그림자는 부드러워서 조금 낮게
       그려도 티가 안 난다 — 2 로 자른다. */
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.round(canvas.clientWidth * dpr)
    const h = Math.round(canvas.clientHeight * dpr)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      g.viewport(0, 0, w, h)
    }
    return dpr
  }

  function render(f: Frame) {
    const dpr = resize()
    g.uniform2f(loc.res, canvas.width, canvas.height)
    g.uniform2f(loc.light, f.lightX * dpr, f.lightY * dpr)
    g.uniform1f(loc.time, f.time)
    g.uniform1f(loc.battery, f.battery)
    g.uniform1f(loc.reveal, f.reveal)
    g.uniform3fv(loc.void, f.voidColor)
    g.uniform3fv(loc.beam, f.beamColor)

    /* 안 쓰는 자리는 화면 밖 먼 곳에 크기 0 으로 둔다.
       셰이더에서 개수를 세며 break 하는 것보다 이게 낫다 —
       GLSL ES 1.00 은 반복문 조건에 유니폼을 쓰는 걸 싫어한다. */
    propBuf.fill(0)
    rotBuf.fill(0)
    for (let i = 0; i < MAX_PROPS; i++) {
      const p = f.props[i]
      if (p) {
        propBuf[i * 4] = p.x * dpr
        propBuf[i * 4 + 1] = p.y * dpr
        propBuf[i * 4 + 2] = p.hw * dpr
        propBuf[i * 4 + 3] = p.hh * dpr
        rotBuf[i] = p.rot
      } else {
        propBuf[i * 4] = -1e5
        propBuf[i * 4 + 1] = -1e5
      }
    }
    g.uniform4fv(loc.props, propBuf)
    g.uniform1fv(loc.propRot, rotBuf)

    g.activeTexture(g.TEXTURE0)
    g.bindTexture(g.TEXTURE_2D, memTex)
    if (memSize[0] !== f.memW || memSize[1] !== f.memH) {
      memSize = [f.memW, f.memH]
      g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, f.memW, f.memH, 0,
        g.LUMINANCE, g.UNSIGNED_BYTE, f.memory)
    } else {
      // 크기가 그대로면 내용만 덮어쓴다 — 매 프레임 새로 만드는 것보다 싸다
      g.texSubImage2D(g.TEXTURE_2D, 0, 0, 0, f.memW, f.memH,
        g.LUMINANCE, g.UNSIGNED_BYTE, f.memory)
    }

    /* 삼각형이 화면을 다 덮지만, 창 크기가 바뀐 직후 한 프레임은
       예전 내용이 남을 수 있다. 지우는 값은 "완전히 투명"이다. */
    g.clearColor(0, 0, 0, 0)
    g.clear(g.COLOR_BUFFER_BIT)
    g.drawArrays(g.TRIANGLES, 0, 3)
  }

  return { render, gl }
}
