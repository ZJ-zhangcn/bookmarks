const test = require('node:test');
const assert = require('node:assert/strict');

const { getFrequentBookmarks, getRecentBookmarks } = require('../frontend/modules/insights-helpers.cjs');

const items = [
    { id: 'a', name: 'A', visit_count: 3, last_visited_at: '2026-05-01T00:00:00.000Z' },
    { id: 'b', name: 'B', visit_count: 8, last_visited_at: '2026-05-02T00:00:00.000Z' },
    { id: 'c', name: 'C', visit_count: 0, last_visited_at: null },
    { id: 'd', name: 'D', visit_count: 8, last_visited_at: '2026-04-01T00:00:00.000Z' }
];

test('getFrequentBookmarks sorts by visit count then recent visit', () => {
    assert.deepEqual(getFrequentBookmarks(items, 3).map(item => item.id), ['b', 'd', 'a']);
});

test('getRecentBookmarks only returns visited bookmarks sorted by last visit time', () => {
    assert.deepEqual(getRecentBookmarks(items, 2).map(item => item.id), ['b', 'a']);
});
