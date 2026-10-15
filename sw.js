// Keep in sync with <meta name="app-version"> in index.html; bump on every release.
const VERSION = '2.2.0';
const CACHE = 'spend-tracker-' + VERSION;
const ASSETS = ['./', './index.html', './manifest.json', './vendor/chart.umd.js', './icon-180.png', './icon-192.png', './icon-512.png'];
const NETWORK_TIMEOUT = 5000;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache:'reload' skips the HTTP cache (GitHub Pages sends max-age=600) so a release precaches fresh files.
    await cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function fetchWithTimeout(request) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

function appVersionOf(html) {
  const m = /<meta\s+name="app-version"\s+content="([^"]+)"/.exec(html);
  return m ? m[1] : null;
}

async function notifyIfNewVersion(oldRes, newRes) {
  try {
    const [oldV, newV] = [appVersionOf(await oldRes.text()), appVersionOf(await newRes.text())];
    if (!newV || newV === oldV) return;
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.postMessage({ type: 'update-available', version: newV }));
  } catch (e) {}
}

// Stale-while-revalidate for every same-origin GET, navigation included:
// answer from the cache at once, refresh it in the background, and only wait on the
// network when nothing is cached yet. Slow or filtered networks never delay opening.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('/index.html');
  const key = isPage ? './index.html' : req;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: isPage });
    // Clone before `cached` is handed to the page; its body can't be read afterwards.
    const cachedCopy = isPage && cached ? cached.clone() : null;

    const update = (async () => {
      try {
        const res = await fetchWithTimeout(isPage ? new Request('./index.html', { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' }));
        if (!res || !res.ok) return null;
        if (cachedCopy) await notifyIfNewVersion(cachedCopy, res.clone());
        await cache.put(key, res.clone());
        return res;
      } catch (e) {
        return null;
      }
    })();

    if (cached) {
      event.waitUntil(update);
      return cached;
    }
    const res = await update;
    if (res) return res;
    if (isPage) {
      const shell = await cache.match('./');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
