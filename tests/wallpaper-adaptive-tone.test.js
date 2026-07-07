const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../frontend/index.css'), 'utf8');
const settingsSource = fs.readFileSync(path.join(__dirname, '../frontend/modules/settings.js'), 'utf8');

test('wallpaper luminance maps to adaptive foreground tone after dim overlay', () => {
  assert.match(settingsSource, /export function getWallpaperToneFromLuminance\(luminance, dimPercent = 30\)/);
  assert.match(settingsSource, /const perceived = Math\.max\(0, Math\.min\(1, value\)\) \* \(1 - dim\)/);
  assert.match(settingsSource, /return perceived >= 0\.48 \? 'light' : 'dark'/);
  assert.match(settingsSource, /return ''/);
});

test('wallpaper loader samples image luminance and writes data-wallpaper-tone', () => {
  assert.match(settingsSource, /const WALLPAPER_TONE_ATTR = 'data-wallpaper-tone'/);
  assert.match(settingsSource, /function detectWallpaperTone\(displayUrl, dimPercent, seq\)/);
  assert.match(settingsSource, /sampleImageLuminance\(img\)/);
  assert.match(settingsSource, /detectWallpaperTone\(displayUrl, dim, seq\)/);
  assert.match(settingsSource, /setWallpaperTone\('', NaN\)/);
});

test('wallpaper tone CSS drives adaptive semi-transparent surfaces', () => {
  assert.match(css, /\[data-wallpaper-tone="light"\]\s*{[\s\S]*--adaptive-surface:\s*hsla\(222,\s*34%,\s*12%,\s*0\.42\)[\s\S]*--adaptive-border:\s*hsla\(210,\s*18%,\s*96%,\s*0\.20\)/);
  assert.match(css, /\[data-wallpaper-tone="dark"\]\s*{[\s\S]*--adaptive-surface:\s*hsla\(220,\s*13%,\s*10%,\s*0\.50\)[\s\S]*--adaptive-border:\s*hsla\(210,\s*18%,\s*96%,\s*0\.18\)/);
  assert.match(css, /\[data-theme="light"\]\[data-wallpaper-tone\]\s*{[\s\S]*--adaptive-surface:\s*hsla\(0,\s*0%,\s*100%,\s*0\.72\)[\s\S]*--adaptive-text:\s*hsl\(222,\s*34%,\s*12%\)/);
  assert.match(css, /\[data-theme="dark"\]\[data-wallpaper-tone\]\s*{[\s\S]*--adaptive-text:\s*hsl\(210,\s*18%,\s*96%\)/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.fixed-btn,[\s\S]*\.confirm-dialog\s*{[\s\S]*background:\s*var\(--adaptive-surface\)[\s\S]*border-color:\s*var\(--adaptive-border\)[\s\S]*backdrop-filter:\s*none/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.web-search-input,[\s\S]*\.footer\s*{[\s\S]*background:\s*var\(--adaptive-surface\) !important[\s\S]*border-color:\s*var\(--adaptive-border\) !important[\s\S]*box-shadow:\s*var\(--adaptive-shadow\) !important/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.web-search-input,[\s\S]*\.bookmark-card,[\s\S]*\.todo-card,[\s\S]*\.insight-card,[\s\S]*\.modal,[\s\S]*color:\s*var\(--adaptive-text\) !important/);
  assert.match(css, /\.category-sheet,[\s\S]*\[data-wallpaper-tone\]\s+\.category-sheet\s*{[\s\S]*background:\s*hsl\(220,\s*13%,\s*10%\) !important[\s\S]*backdrop-filter:\s*none !important/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.category-fab-chevron,[\s\S]*\.confirm-input-wrap span\s*{[\s\S]*color:\s*var\(--adaptive-muted\)/);
});
