// Keep in sync with <meta name="app-version"> in index.html; bump on every release.
const VERSION = '2.6.0';
const CACHE = 'spend-tracker-' + VERSION;
// css/js carry ?v=VERSION in index.html so every release has its own URLs: a page can never pair with another release's files.
const JS_FILES = ['core', 'cards', 'wealth-core', 'wealth-prices', 'format', 'chips-settings', 'entry-form', 'edit-month', 'trips', 'entries-hero', 'overview-charts', 'cards-ui', 'wealth-ui', 'data-ui', 'boot'];
const ASSETS = [
  './', './index.html', './manifest.json', './vendor/chart.umd.js', './icon-180.png', './icon-192.png', './icon-512.png',
  `./css/app.css?v=${VERSION}`,
  ...JS_FILES.map(n => `./js/${n}.js?v=${VERSION}`)
];
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
    const isUpgrade = keys.some(k => k.startsWith('spend-tracker-') && k !== CACHE);
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    // The page offers the update toast; only an upgrade (an older cache existed) announces it, not a first install.
    if (isUpgrade) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(c => c.postMessage({ type: 'update-available', version: VERSION }));
    }
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
    const update = (async () => {
      try {
        const res = await fetchWithTimeout(isPage ? new Request('./index.html', { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' }));
        if (!res || !res.ok) return null;
        if (isPage) {
          // Keep the cached page and the cached css/js from the same release: a page from another release is never
          // stored. The newer sw.js installs instead and precaches the whole matching set (then notifies the page).
          const v = appVersionOf(await res.clone().text());
          if (v !== VERSION) {
            self.registration.update().catch(() => {});
            return cached ? null : res;
          }
        }
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
