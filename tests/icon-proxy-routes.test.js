const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

test('legacy /api/icon/proxy route stays registered before SPA fallback', () => {
  const routes = read('backend/routes/icon-unified.js');
  assert.match(routes, /router\.get\('\/proxy-icon'/);
  assert.match(routes, /router\.get\('\/icon\/proxy'/);

  const server = read('backend/server.js');
  assert.match(server, /app\.use\('\/api',\s*routes\.iconUnified\)/);
  assert.match(server, /app\.get\('\*'/);
  assert.ok(
    server.indexOf("app.use('/api', routes.iconUnified)") < server.indexOf("app.get('*'"),
    'icon routes must be registered before SPA fallback'
  );
});
