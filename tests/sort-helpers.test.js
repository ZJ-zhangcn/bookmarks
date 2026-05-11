const test = require('node:test');
const assert = require('node:assert/strict');

const { moveItemInList } = require('../frontend/modules/sort-helpers.cjs');

test('moveItemInList moves an item upward without mutating input', () => {
    const items = ['a', 'b', 'c'];
    assert.deepEqual(moveItemInList(items, 2, -1), ['a', 'c', 'b']);
    assert.deepEqual(items, ['a', 'b', 'c']);
});

test('moveItemInList keeps item in bounds', () => {
    assert.deepEqual(moveItemInList(['a', 'b'], 0, -1), ['a', 'b']);
    assert.deepEqual(moveItemInList(['a', 'b'], 1, 1), ['a', 'b']);
});
