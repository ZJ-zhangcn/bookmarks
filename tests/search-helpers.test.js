const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSearchEmptyState } = require('../frontend/modules/search-helpers.cjs');

test('buildSearchEmptyState includes action buttons for no-result query', () => {
    const html = buildSearchEmptyState('not-found');
    assert.match(html, /没有找到匹配的书签/);
    assert.match(html, /data-action="add-bookmark"/);
    assert.match(html, /data-action="web-search"/);
    assert.match(html, /not-found/);
});
