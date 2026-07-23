const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../frontend/index.css'), 'utf8');

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test('bookmark search stays above URL-first capture and below confirmation', () => {
  assert.match(cssRule('#bookmarkModal'), /z-index:\s*1150;/);
  assert.match(cssRule('.bookmark-search-overlay'), /z-index:\s*1200;/);
  assert.match(cssRule('.confirm-overlay'), /z-index:\s*1300;/);
});
