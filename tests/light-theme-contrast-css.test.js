const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../frontend/index.css'), 'utf8');

function getLightThemeBlock() {
  const marker = '[data-theme="light"] {';
  const start = css.lastIndexOf(marker);
  assert.notEqual(start, -1, 'expected local visual light theme block');
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unterminated light theme block');
}

test('local visual light theme defines its own readable text tokens', () => {
  const block = getLightThemeBlock();
  for (const token of ['--text-primary', '--text-secondary', '--text-tertiary', '--text-muted']) {
    assert.match(block, new RegExp(`${token}\\s*:`), `missing ${token} in final light theme block`);
  }

  assert.doesNotMatch(block, /--text-muted:\s*var\(--text-tertiary\)/, 'muted text should be explicit in light mode');
  assert.match(block, /--glass-bg:\s*hsla\(0,\s*0%,\s*100%,\s*0\.9\)/, 'light cards should be bright enough for dark text');
});

test('light theme overrides dark-only surfaces and low contrast chips', () => {
  assert.match(css, /\[data-theme="light"\]\s+body\s*{[\s\S]*color-scheme:\s*light;/);
  assert.match(css, /\[data-theme="light"\]\s+\.category-fab,[\s\S]*\.search-panel\s*{[\s\S]*background:\s*hsla\(0,\s*0%,\s*100%,\s*0\.94\)/);
  assert.match(css, /\[data-theme="light"\]\s+\.category-count\s*{[\s\S]*color:\s*hsl\(152,\s*70%,\s*20%\)/);
  assert.match(css, /\[data-theme="light"\]\s+\.tag-chip\s*{[\s\S]*color:\s*hsl\(215,\s*24%,\s*26%\)/);
});

test('bookmark search inherits readable light-theme surfaces without stale global-search overrides', () => {
  const lightTheme = getLightThemeBlock();
  assert.match(lightTheme, /--bg-secondary:\s*hsl\(210,\s*20%,\s*92%\)/);
  assert.match(lightTheme, /--bg-tertiary:\s*hsl\(210,\s*16%,\s*84%\)/);
  assert.match(lightTheme, /--text-primary:\s*hsl\(222,\s*34%,\s*12%\)/);

  assert.match(css, /\.bookmark-search-panel\s*\{[\s\S]*?background:\s*var\(--bg-secondary\);/);
  assert.match(css, /\.bookmark-search-header\s*\{[\s\S]*?background:\s*var\(--bg-tertiary\);/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.bookmark-search-panel,[\s\S]*?background:\s*var\(--adaptive-surface-strong\);/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.bookmark-search-panel,[\s\S]*?color:\s*var\(--adaptive-text\)\s*!important;/);
  assert.doesNotMatch(css, /\.global-search-/);
});
