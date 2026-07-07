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

test('wallpaper tone CSS drives adaptive floating surfaces', () => {
  assert.match(css, /\[data-wallpaper-tone="light"\]\s*{[\s\S]*--adaptive-text:\s*hsl\(222,\s*34%,\s*12%\)/);
  assert.match(css, /\[data-wallpaper-tone="dark"\]\s*{[\s\S]*--adaptive-text:\s*hsl\(210,\s*18%,\s*94%\)/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.fixed-btn,[\s\S]*\.confirm-dialog\s*{[\s\S]*background:\s*var\(--adaptive-surface\)/);
  assert.match(css, /\[data-wallpaper-tone\]\s+\.category-fab-chevron,[\s\S]*\.confirm-input-wrap span\s*{[\s\S]*color:\s*var\(--adaptive-muted\)/);
});
