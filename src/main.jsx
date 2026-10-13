import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/mw4.css'
import '@/styles/arena.css'
import '@/styles/player-overlay.css'

if (/^\/overlay\/player\/[^/]+\/?$/.test(window.location.pathname)) {
  document.documentElement.classList.add('stream-overlay-document')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
