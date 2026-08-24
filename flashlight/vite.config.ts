import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  /* 자산 경로를 상대 경로로 뽑는다.

     기본값 '/' 로 두면 index.html 이 /assets/index-xxx.js 를 찾는데,
     GitHub Pages 에서는 이 앱이 /useless-but-shiny/arc-reactor/ 아래에
     놓이므로 전부 404 가 난다.

     '/useless-but-shiny/arc-reactor/' 로 못 박을 수도 있지만,
     그러면 개발 서버 주소까지 그 경로가 되고 레포 이름을 바꾸면 깨진다.
     './' 는 **어느 하위 경로에 놓든** 알아서 맞는다.
     (클라이언트 라우팅이 있으면 못 쓰는 방법이지만 이 페이지엔 없다.) */
  base: './',
})
