const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

test('icon route delegates fetch, library, and bookmark batch work to services', () => {
    const routes = read('backend/routes/icon-unified.js');

    assert.match(routes, /services\/icons\/fetch-image/);
    assert.match(routes, /services\/icons\/library-service/);
    assert.match(routes, /services\/icons\/bookmark-icon-service/);

    assert.doesNotMatch(routes, /async function fetchPublicImage/);
    assert.doesNotMatch(routes, /function readLimitedArrayBuffer/);
    assert.doesNotMatch(routes, /SELECT id, icon_data FROM bookmarks/);
    assert.doesNotMatch(routes, /SELECT id, url FROM bookmarks/);
});
