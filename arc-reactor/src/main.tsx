import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/reset.css'
import App from './App'

/* ?theme=ember | toxic | violet — tokens.css 의 팔레트를 갈아끼운다.
   셰이더는 --color-arc 만 읽으므로 이 한 줄이 리액터 색까지 바꾼다. */
const theme = new URLSearchParams(window.location.search).get('theme')
if (theme) document.documentElement.dataset.theme = theme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
