const CACHE_NAME = globalThis.__PWA_CACHE_NAME__ || 'bookmark-nav-pwa-dev-v17';
const CACHE_PREFIX = 'bookmark-nav-pwa-';
const CACHE_HISTORY_KEY = '/__pwa-cache-history__';
const APP_SHELL = globalThis.__PWA_APP_SHELL__ || [
    '/',
    '/index.html',
    '/index.css',
    '/main.js',
    '/manifest.webmanifest',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];
const BOOTSTRAP_PATH = '/api/bootstrap-v2';

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        rememberAndPruneCaches()
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Authenticated bootstrap data must never be served from an offline cache.
    if (url.pathname === BOOTSTRAP_PATH) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(request, '/index.html'));
        return;
    }

    if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirst(request));
    }
});

function isStaticAsset(pathname) {
    return pathname === '/'
        || pathname === '/index.html'
        || pathname === '/manifest.webmanifest'
        || pathname.startsWith('/assets/')
        || pathname.endsWith('.js')
        || pathname.endsWith('.css')
        || pathname.endsWith('.png')
        || pathname.endsWith('.svg')
        || pathname.endsWith('.webmanifest');
}

async function networkFirst(request, fallbackPath) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (_err) {
            if (new URL(request.url).pathname === BOOTSTRAP_PATH) throw _err;
        const cached = await cache.match(request);
        if (cached) return cached;
        if (fallbackPath) {
            const fallback = await cache.match(fallbackPath);
            if (fallback) return fallback;
        }
        throw _err;
    }
}

async function cacheFirst(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response && response.ok) {
        cache.put(request, response.clone());
    }
    return response;
}

async function rememberAndPruneCaches() {
    const keys = await caches.keys();
    const existingPwaCaches = keys.filter(key => key.startsWith(CACHE_PREFIX));
    const remembered = [];

    // CacheStorage.keys() 按创建顺序返回，倒序读取可优先采用最近一版记录的历史。
    for (const cacheName of [...existingPwaCaches].reverse()) {
        try {
            const stored = await (await caches.open(cacheName)).match(CACHE_HISTORY_KEY);
            const history = stored ? await stored.json() : [];
            if (Array.isArray(history)) remembered.push(...history);
        } catch {
            // 损坏或旧格式的历史记录不应阻止 Service Worker 激活。
        }
    }

    const fallbackPrevious = existingPwaCaches
        .filter(name => name !== CACHE_NAME)
        .reverse();
    const history = [CACHE_NAME, ...remembered, ...fallbackPrevious]
        .filter((name, index, all) => name.startsWith(CACHE_PREFIX)
            && (name === CACHE_NAME || existingPwaCaches.includes(name))
            && all.indexOf(name) === index)
        .slice(0, 2);

    const cache = await caches.open(CACHE_NAME);
    await cache.put(CACHE_HISTORY_KEY, new Response(JSON.stringify(history), {
        headers: { 'Content-Type': 'application/json' }
    }));
    await Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && !history.includes(key))
        .map(key => caches.delete(key)));
}
