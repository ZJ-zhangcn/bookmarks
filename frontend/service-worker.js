const CACHE_NAME = 'bookmark-nav-pwa-v10';
const APP_SHELL = [
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
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

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
        || pathname === '/index.css'
        || pathname === '/main.js'
        || pathname === '/manifest.webmanifest'
        || pathname.startsWith('/assets/')
        || pathname.startsWith('/modules/')
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
