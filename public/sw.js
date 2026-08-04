/* Service worker do PWA.
 * Estratégia:
 *  - Navegação / index.html: NETWORK-FIRST. É o arquivo que aponta para os
 *    bundles com hash; se ele vier do cache, o app inteiro fica congelado numa
 *    versão antiga mesmo depois de um deploy novo (e passa a combinar app
 *    velho com dados.json novo). Cai para o cache quando offline.
 *  - dados.json: network-first, com fallback para o cache quando offline.
 *  - Assets com hash no nome (/assets/*) e ícones: cache-first — o nome muda a
 *    cada build, então nunca servem conteúdo desatualizado.
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

  // Navegação (index.html): network-first — garante que um deploy novo apareça
  // já no primeiro recarregamento, em vez de exigir duas visitas.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((resp) => {
          const clone = resp.clone()
          caches.open(VERSAO).then((c) => c.put(e.request, clone))
          return resp
        })
        .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
    )
    return
  }

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
