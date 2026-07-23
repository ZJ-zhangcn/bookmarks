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

test('final light global-search overrides keep its opaque surfaces ahead of the dark defaults', () => {
  const marker = '/* Global search light-theme contrast */';
  const finalOverride = css.lastIndexOf(marker);
  assert.notEqual(finalOverride, -1, 'expected a final global-search light-theme override block');
  assert.ok(finalOverride > css.indexOf('.global-search-panel {'), 'light global-search rules must follow dark defaults');

  const block = css.slice(finalOverride);
  for (const selector of [
    '.global-search-overlay',
    '.global-search-panel',
    '.global-search-header',
    '.global-search-result-icon',
    '.global-search-result:hover',
    '.global-search-close:hover'
  ]) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(block, new RegExp(`\\[data-theme="light"\\][\\s\\S]*${escapedSelector}`), `missing light override for ${selector}`);
    assert.match(block, new RegExp(`\\[data-theme="light"\\]\\[data-wallpaper-tone\\][\\s\\S]*${escapedSelector}`), `missing wallpaper-light override for ${selector}`);
  }

  assert.match(block, /background:\s*hsl\(210,\s*24%,\s*96%\)\s*!important/);
  assert.match(block, /background:\s*hsl\(0,\s*0%,\s*100%\)\s*!important/);
  assert.match(block, /background:\s*hsl\(210,\s*22%,\s*91%\)\s*!important/);
  assert.match(block, /background:\s*rgba\(15,\s*23,\s*42,\s*0\.36\)\s*!important/);
  assert.match(block, /color:\s*var\(--text-primary\)\s*!important/);
  assert.doesNotMatch(block, /hsl\(220,\s*13%,\s*10%\)/, 'light override must not reintroduce the dark global-search panel surface');
});
