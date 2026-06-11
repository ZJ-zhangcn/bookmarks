const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('phase 4 keeps settings and AI out of the startup import graph', () => {
  const main = read('frontend/main.js');
  const events = read('frontend/modules/events.js');
  const bookmark = read('frontend/modules/bookmark.js');
  const vite = read('frontend/vite.config.js');

  assert.doesNotMatch(main, /from '\.\/modules\/settings\.js'/);
  assert.match(main, /from '\.\/modules\/theme\.js'/);

  assert.doesNotMatch(events, /from '\.\/settings\.js'/);
  assert.doesNotMatch(events, /from '\.\/ai\.js'/);
  assert.match(events, /import\('\.\/settings\.js'\)/);
  assert.match(events, /import\('\.\/ai\.js'\)/);

  assert.doesNotMatch(bookmark, /from '\.\/ai\.js'/);
  assert.match(bookmark, /import\('\.\/ai\.js'\)/);

  assert.match(vite, /return 'settings'/);
  assert.match(vite, /return 'ai'/);
});

test('virtual scroll uses a bounded internal viewport instead of 100 percent auto height', () => {
  const virtualScroll = read('frontend/modules/virtual-scroll.js');
  const render = read('frontend/modules/render.js');

  assert.doesNotMatch(virtualScroll, /wrapper\.style\.height\s*=\s*'100%'/);
  assert.match(virtualScroll, /viewportHeight/);
  assert.match(virtualScroll, /maxHeight/);
  assert.match(render, /viewportHeight:\s*'min\(72vh, 720px\)'/);
});
