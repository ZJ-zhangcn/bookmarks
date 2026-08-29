const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('frontend declares an installable PWA manifest', () => {
  const index = read('frontend/index.html');
  assert.match(index, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(index, /<meta\s+name="theme-color"\s+content="#0b0f14"/);

  assert.match(index, /<link\s+rel="icon"\s+type="image\/png"\s+sizes="512x512"\s+href="\/assets\/icon-512\.png"/);
  assert.match(index, /<img\s+class="logo-icon"\s+src="\/assets\/icon-512\.png"/);
  assert.doesNotMatch(index, /data:image\/svg\+xml/);
  assert.doesNotMatch(index, /<span class="logo-icon">🔖<\/span>/);

  const manifest = JSON.parse(read('frontend/manifest.webmanifest'));
  assert.equal(manifest.name, '书签导航');
  assert.equal(manifest.short_name, '书签');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0b0f14');
  assert.ok(manifest.icons.some(icon => icon.src === '/assets/icon-192.png' && icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.src === '/assets/icon-512.png' && icon.sizes === '512x512'));
});

test('frontend registers service worker module', () => {
  const main = read('frontend/main.js');
  assert.match(main, /import\s+\{\s*registerServiceWorker\s*\}\s+from\s+'\.\/modules\/pwa\.js'/);
  assert.match(main, /registerServiceWorker\(\)/);

  const pwa = read('frontend/modules/pwa.js');
  assert.match(pwa, /const\s+SERVICE_WORKER_VERSION\s*=\s*'v17'/);
  assert.match(pwa, /navigator\.serviceWorker\.register\(`\/service-worker\.js\?\$\{SERVICE_WORKER_VERSION\}`\)/);
  assert.match(pwa, /发现新版本/);
  assert.match(pwa, /立即刷新/);
  assert.match(pwa, /worker\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/);
  assert.match(pwa, /controllerchange/);

  const server = read('backend/server.js');
  assert.match(server, /path\.basename\(filePath\)\s*===\s*'service-worker\.js'/);
  assert.match(server, /Cache-Control',\s*'no-store, no-cache, must-revalidate, proxy-revalidate'/);
  assert.match(server, /max-age=31536000, immutable/);
  assert.match(server, /assets.*\[A-Za-z0-9_\-\]\{8,\}/);

  const sw = read('frontend/service-worker.js');
  assert.match(sw, /globalThis\.__PWA_CACHE_NAME__/);
  assert.match(sw, /globalThis\.__PWA_APP_SHELL__/);
  assert.match(sw, /\/api\/bootstrap-v2/);
  assert.match(sw, /if\s*\(request\.method\s*!==\s*'GET'\)\s*return;/);
  assert.match(sw, /if\s*\(url\.pathname\s*===\s*BOOTSTRAP_PATH\)\s*{\s*event\.respondWith\(networkFirst\(request\)\)/);
  assert.doesNotMatch(sw, /\.then\(\(\)\s*=>\s*self\.skipWaiting\(\)\)/);
  assert.match(sw, /event\.data\?\.type === 'SKIP_WAITING'/);
  assert.match(sw, /slice\(0, 2\)/);
  assert.match(sw, /await \(await caches\.open\(cacheName\)\)\.match\(CACHE_HISTORY_KEY\)/);
});

test('service worker retains the current and immediately previous PWA cache', async () => {
  const source = read('frontend/service-worker.js');
  const stores = new Map();
  const deleted = [];
  const makeCache = entries => ({
    async match(key) { return entries.get(key); },
    async put(key, value) { entries.set(key, value); },
    async addAll() {}
  });
  const addCache = (name, history) => {
    const entries = new Map();
    if (history) entries.set('/__pwa-cache-history__', new Response(JSON.stringify(history)));
    stores.set(name, makeCache(entries));
  };
  addCache('bookmark-nav-pwa-oldest', ['bookmark-nav-pwa-oldest']);
  addCache('bookmark-nav-pwa-previous', ['bookmark-nav-pwa-previous', 'bookmark-nav-pwa-oldest']);

  const context = vm.createContext({
    URL,
    Response,
    globalThis: {
      __PWA_CACHE_NAME__: 'bookmark-nav-pwa-current',
      __PWA_APP_SHELL__: []
    },
    self: {
      addEventListener() {},
      clients: { claim: async () => {} },
      location: { origin: 'https://example.test' },
      skipWaiting() {}
    },
    caches: {
      async keys() { return [...stores.keys()]; },
      async open(name) {
        if (!stores.has(name)) stores.set(name, makeCache(new Map()));
        return stores.get(name);
      },
      async delete(name) {
        deleted.push(name);
        return stores.delete(name);
      }
    },
    fetch: async () => new Response('{}')
  });
  vm.runInContext(source, context);
  await vm.runInContext('rememberAndPruneCaches()', context);

  assert.deepEqual([...stores.keys()].sort(), [
    'bookmark-nav-pwa-current',
    'bookmark-nav-pwa-previous'
  ]);
  assert.deepEqual(deleted, ['bookmark-nav-pwa-oldest']);
  const historyResponse = await stores.get('bookmark-nav-pwa-current').match('/__pwa-cache-history__');
  assert.deepEqual(await historyResponse.json(), [
    'bookmark-nav-pwa-current',
    'bookmark-nav-pwa-previous'
  ]);
});

test('frontend business modules use the unified API client instead of raw fetch', () => {
  const modulesDir = path.join(root, 'frontend', 'modules');
  const allowed = new Set(['api-client-core.cjs']);
  const violations = fs.readdirSync(modulesDir)
    .filter(name => /\.(?:js|cjs)$/.test(name) && !allowed.has(name))
    .filter(name => /\bfetch\s*\(/.test(read(path.join('frontend/modules', name))));
  assert.deepEqual(violations, []);
});

test('production service worker precaches hashed Vite assets', () => {
  const viteConfig = read('frontend/vite.config.js');
  assert.match(viteConfig, /createPwaServiceWorker/);
  assert.match(viteConfig, /this\.emitFile\(\{/);
  assert.match(viteConfig, /fileName:\s*'service-worker\.js'/);

  const distDir = path.join(root, 'dist');
  if (!fs.existsSync(path.join(distDir, 'service-worker.js'))) return;

  const distServiceWorker = read('dist/service-worker.js');
  const builtAssets = fs.readdirSync(path.join(distDir, 'assets'))
    .filter(name => /\.(js|css)$/.test(name));

  assert.doesNotMatch(distServiceWorker, /globalThis\.__PWA_(CACHE_NAME|APP_SHELL)__/);
  assert.doesNotMatch(distServiceWorker, /['"]\/main\.js['"]/);
  assert.doesNotMatch(distServiceWorker, /['"]\/index\.css['"]/);
  for (const asset of builtAssets) {
    assert.match(distServiceWorker, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
