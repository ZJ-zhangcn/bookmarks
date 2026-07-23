const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/modules/command-palette.js'), 'utf8');

test('command palette retains normal creation and settings actions without global search', () => {
    assert.match(source, /command:\s*'add-bookmark'/);
    assert.match(source, /command:\s*'open-settings'/);
    assert.match(source, /command:\s*'open-todos'/);
    assert.match(source, /command:\s*'focus-filter'/);
    assert.doesNotMatch(source, /open-global-search|openGlobalSearch|globalSearch/);
});

test('command palette routes restored keyboard and engine focus to current surfaces', () => {
    assert.match(source, /key\s*===\s*'k'/);
    assert.match(source, /key\s*===\s*'f'\s*&&\s*isOpen\(\)/);
    assert.match(source, /commandActions\.openBookmarkSearch\?\.\(\)/);
    assert.match(source, /focusElement\('#searchInput'\)/);
    assert.match(source, /focusElement\('#webSearchInput'\)/);
});

test('command palette hands off bookmark search and keeps the shared scroll lock', () => {
    assert.match(source, /import\s*\{\s*syncDocumentScrollLock\s*\}\s*from\s*'\.\/overlay-state\.js';/);
    assert.match(source, /commandActions\.closeBookmarkSearch\?\.\(\);\s*openCommandPalette\(\);/);
    assert.match(source, /function openCommandPalette\(\)[\s\S]*?overlay\.classList\.add\('open'\);[\s\S]*?syncDocumentScrollLock\(\);/);
    assert.match(source, /function closeCommandPalette\(\)[\s\S]*?overlay\.classList\.remove\('open'\);[\s\S]*?syncDocumentScrollLock\(\);/);
});
