const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

test('frontend declares an installable PWA manifest', () => {
  const index = read('frontend/index.html');
  assert.match(index, /<link\s+rel="manifest"\s+href="\/manifest\.webmanifest"/);
  assert.match(index, /<meta\s+name="theme-color"\s+content="#0b0f14"/);

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
  assert.match(pwa, /navigator\.serviceWorker\.register\('\/service-worker\.js'\)/);

  const sw = read('frontend/service-worker.js');
  assert.match(sw, /const\s+CACHE_NAME\s*=/);
  assert.match(sw, /\/api\/bootstrap-v2/);
  assert.match(sw, /if\s*\(request\.method\s*!==\s*'GET'\)\s*return;/);
  assert.match(sw, /if\s*\(url\.pathname\s*===\s*BOOTSTRAP_PATH\)\s*{\s*event\.respondWith\(networkFirst\(request\)\)/);
});
