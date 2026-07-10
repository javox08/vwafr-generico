// Service worker de VWAFR: app instalable + offline + cargas repetidas instantáneas.
// Estrategia: las librerías CDN (React/Babel, ~2,8 MB) y las fuentes se cachean
// (cache-first, son inmutables); el documento es network-first con fallback a
// caché (para que las actualizaciones lleguen online y la app funcione offline);
// las APIs de datos en vivo NUNCA se cachean (siempre red, datos frescos).
const CACHE = 'vwafr-v3';
const SHELL = [
  '/', '/index.html', '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.2/babel.min.js'
];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // APIs de datos en vivo: siempre a la red, sin cachear (no servir datos viejos)
  const liveAPI = /binance|deribit|coingecko|bitcoin-data|alternative\.me|worldbank|okx\.com|bitstamp|llama\.fi|frankfurter|bybit|bitget|telegram|bitunix|okex|coinbase|gateio|mexc|vercel\.app/.test(url.hostname)
    || url.pathname.startsWith('/api/');
  if (liveAPI) return;
  // librerías CDN y fuentes: cache-first (inmutables → cargas repetidas instantáneas)
  if (/cdnjs\.cloudflare|gstatic|googleapis/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(c => c || fetch(req).then(r => {
      const cp = r.clone(); caches.open(CACHE).then(ca => ca.put(req, cp)); return r;
    })));
    return;
  }
  // documento y estáticos propios: network-first con fallback a caché (offline)
  e.respondWith(fetch(req).then(r => {
    const cp = r.clone(); caches.open(CACHE).then(ca => ca.put(req, cp)); return r;
  }).catch(() => caches.match(req).then(c => c || caches.match('/index.html'))));
});
