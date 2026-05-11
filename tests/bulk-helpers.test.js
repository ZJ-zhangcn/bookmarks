const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeBulkSelection, applyBulkCategory } = require('../frontend/modules/bulk-helpers.cjs');

test('summarizeBulkSelection counts selected bookmark ids', () => {
    assert.equal(summarizeBulkSelection(new Set(['a', 'b'])), '已选择 2 个书签');
});

test('applyBulkCategory returns cloned bookmarks with selected ids moved', () => {
    const bookmarks = [
        { id: 'a', category_id: 'old', name: 'A' },
        { id: 'b', category_id: 'old', name: 'B' },
        { id: 'c', category_id: 'old', name: 'C' }
    ];
    const next = applyBulkCategory(bookmarks, new Set(['a', 'c']), 'new');
    assert.deepEqual(next.map(item => item.category_id), ['new', 'old', 'new']);
    assert.equal(bookmarks[0].category_id, 'old');
});
