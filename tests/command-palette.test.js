const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

test('command palette module is wired to keyboard shortcuts', () => {
  const events = read('frontend/modules/events.js');
  assert.match(events, /import\s+\{\s*initCommandPalette\s*\}\s+from\s+'\.\/command-palette\.js'/);
  assert.match(events, /initCommandPalette\s*\(/);
  assert.doesNotMatch(events, /Ctrl\/Cmd \+ K: Focus search/);

  const module = read('frontend/modules/command-palette.js');
  assert.match(module, /export\s+function\s+initCommandPalette/);
  assert.match(module, /Cmd\/Ctrl\+K/);
  assert.match(module, /command:\s*'add-bookmark'/);
  assert.match(module, /command:\s*'open-settings'/);
  assert.match(module, /command:\s*'open-todos'/);
});

test('command palette has accessible overlay styles', () => {
  const css = read('frontend/index.css');
  assert.match(css, /\.command-palette-overlay/);
  assert.match(css, /\.command-palette-panel/);
  assert.match(css, /\.command-palette-item\.active/);
});
