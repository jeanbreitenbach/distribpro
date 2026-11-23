/* DistribPro — service worker: guarda as telas do app para abrir sem internet.
   Os dados (API) não passam por aqui: o app guarda a última cópia no IndexedDB. */
const VERSAO = 'distribpro-v3';
const ARQUIVOS = ['/', '/index.html', '/style.css', '/regras.js', '/app.js', '/financeiro.js', '/bancos.js', '/visitas.js', '/offline.js', '/manifest.webmanifest',
  '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (sempre a versão mais nova quando há internet); sem rede ou rede lenta (>4s), usa a cópia guardada.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/catalogo')) return; // o catálogo público não é cacheado aqui
  const chave = e.request.mode === 'navigate' ? '/index.html' : url.pathname;
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const rede = fetch(e.request).then(r => { if (r.ok) cache.put(chave, r.clone()); return r; });
    rede.catch(() => { });
    const guardado = await cache.match(chave);
    if (!guardado) return rede;
    const limite = new Promise(ok => setTimeout(() => ok(null), 4000));
    try { return (await Promise.race([rede, limite])) || guardado; } catch { return guardado; }
  })());
});
