const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('PWA manifest exposes a GET share target and quick-add opens a confirmation modal', () => {
    const manifest = JSON.parse(read('frontend/manifest.webmanifest'));
    assert.equal(manifest.share_target.action, '/?action=share');
    assert.equal(manifest.share_target.method, 'GET');
    const main = read('frontend/main.js');
    assert.match(main, /openBookmarkFromUrlParams/);
    assert.match(main, /openBookmarkModal\(null, null, \{ name: title, url: sharedUrl \}\)/);
    assert.equal(main.includes('saveBookmark()'), false);
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
