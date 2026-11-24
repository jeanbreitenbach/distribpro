/* RepCRM — service worker: permite instalar o app e abrir as telas com internet fraca. Dados (API) sempre vêm do servidor. */
const VERSAO = 'repcrm-v1';
const ARQUIVOS = ['/', '/index.html', '/style.css', '/regras.js', '/app.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const chave = e.request.mode === 'navigate' ? '/index.html' : url.pathname;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) caches.open(VERSAO).then(c => c.put(chave, r.clone())); return r; }).catch(() => caches.match(chave)));
});
