/* Service worker do PWA.
 * Estratégia:
 *  - App shell (html/js/css/ícones): cache-first com atualização em segundo plano.
 *  - dados.json: network-first (dados sempre atualizados quando online),
 *    com fallback para o cache quando offline.
 * A versão do cache muda a cada deploy (substituída no build pelo workflow,
 * ou atualize manualmente ao publicar).
 */
const VERSAO = 'emendas-md-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return

  // Dados: network-first
  if (url.pathname.endsWith('/dados.json')) {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const clone = resp.clone()
          caches.open(VERSAO).then((c) => c.put(e.request, clone))
          return resp
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // App shell e assets: cache-first, atualizando o cache em segundo plano
  e.respondWith(
    caches.match(e.request).then((emCache) => {
      const daRede = fetch(e.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone()
            caches.open(VERSAO).then((c) => c.put(e.request, clone))
          }
          return resp
        })
        .catch(() => emCache)
      return emCache || daRede
    })
  )
})
