const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('PWA manifest no longer exposes the removed share target', () => {
    const manifest = JSON.parse(read('frontend/manifest.webmanifest'));
    assert.equal(manifest.share_target, undefined);
    const main = read('frontend/main.js');
    assert.doesNotMatch(main, /openBookmarkFromUrlParams/);
});

test('R7 uses a precomputed search index, IndexedDB fallback and binary-search virtual rows', () => {
    assert.match(read('frontend/modules/state.js'), /searchText: normalizeSearchText/);
    assert.match(read('frontend/modules/api.js'), /readBootstrapCache/);
    assert.match(read('frontend/modules/bootstrap-cache.js'), /indexedDB\.open/);
    const virtual = read('frontend/modules/virtual-scroll.js');
    assert.match(virtual, /rowPrefix/);
    assert.match(virtual, /findRowAtOffset/);
    assert.doesNotMatch(virtual, /for \(let row = 0; row < rowCount; row\+\+\) \{\s*const rowHeight = this\.getRowHeight\(row\);\s*const rowBottom/);
});
