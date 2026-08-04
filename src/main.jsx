import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)

// Registro do service worker (PWA). Caminho relativo para funcionar em
// subpastas do GitHub Pages.
if ('serviceWorker' in navigator && !location.hostname.includes('localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      // Se um service worker novo assumir o controle (deploy publicado
      // enquanto a aba estava aberta), recarrega uma única vez para que o
      // app e o dados.json fiquem na mesma versão.
      let recarregando = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recarregando) return
        recarregando = true
        window.location.reload()
      })
      reg.update?.()
    }).catch(() => {})
  })
}
