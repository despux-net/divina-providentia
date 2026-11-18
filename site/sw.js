// Service worker de Vivinati: permite instalar la web como app y que cargue
// rápido con mala conexión. Reglas sencillas y seguras:
//  - Páginas (HTML): primero la red; si no hay conexión, la última copia
//    guardada o una página «Sin conexión».
//  - Estilos, scripts, imágenes y fuentes de vivinati.com: primero la copia
//    guardada y se actualiza en segundo plano.
//  - Nada de Supabase ni de otras webs se guarda (datos siempre frescos).
const VERSION = 'vivinati-v3';
const BASICOS = ['/', '/realestate/buscar.html', '/estilos.css', '/img/logo-vivinati-v2.png', '/img/logo-vivinati-blanco-v2.png', '/img/icono-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASICOS)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const SIN_CONEXION = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión — Vivinati</title><body style="font-family:Arial,sans-serif;text-align:center;padding:48px 16px;color:#2f3a45">
<img src="/img/logo-vivinati.png" width="180" alt="Vivinati"><h1 style="font-weight:400">Sin conexión</h1>
<p>Revisa tu internet y vuelve a intentarlo.</p><p><button onclick="location.reload()" style="padding:10px 22px;border-radius:22px;border:0;background:#005CA7;color:#fff;font-size:1rem">Reintentar</button></p></body></html>`;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;           // Supabase, mapas, fotos de otras webs: siempre de la red

  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(req).then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
        return r;
      }).catch(async () => (await caches.match(req)) || (await caches.match('/')) ||
        new Response(SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    );
    return;
  }

  if (/\.(css|js|png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const guardada = await c.match(req);
      const red = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => guardada);
      return guardada || red;
    }));
  }
});
