// Monitor de Palco - Service Worker v1.0
// Cache-first para assets estáticos, network-first para API

const CACHE_NAME = 'monitor-palco-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Assets que devem ser cacheados quando visitados (runtime cache)
const CACHE_PATTERNS = [
  /\.(js|css|woff2?|ttf|otf)$/,
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
];

// Rotas que nunca devem ser cacheadas (API, WebSocket, OAuth)
const NEVER_CACHE = [
  /\/api\//,
  /\/ws/,
  /oauth/,
  /umami/,
];

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Failed to cache some static assets:', err);
      });
    })
  );
  // Ativa imediatamente sem esperar tabs antigas fecharem
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Assume controle de todos os clientes imediatamente
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requests não-GET e non-http(s)
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Nunca cacheia rotas de API, WebSocket e OAuth
  if (NEVER_CACHE.some((pattern) => pattern.test(url.pathname + url.search))) {
    return;
  }

  // Navegação (HTML) → network-first com fallback para cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Assets estáticos (JS, CSS, fontes) → cache-first
  if (CACHE_PATTERNS.some((pattern) => pattern.test(url.href))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
});

// ── Background Sync (futuro) ──────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});
