const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

test('renderInsightIcon uses stored url favicon instead of emoji fallback', async () => {
    global.window = { location: { origin: 'https://bookmarks.example', protocol: 'https:' } };
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/insights.js')).href;
    const { renderInsightIcon } = await import(`${moduleUrl}?url-icon-${Date.now()}`);

    const html = renderInsightIcon({
        id: 'newapi',
        name: 'New API',
        icon: '🌐',
        icon_type: 'url',
        icon_data: 'https://newapi.example/logo.png'
    }, new Map());

    assert.match(html, /<img\s/);
    assert.match(html, /src="https:\/\/newapi\.example\/logo\.png"/);
    assert.match(html, /data-original-src="https:\/\/newapi\.example\/logo\.png"/);
});

test('renderInsightIcon prefers lazily loaded cached base64 favicon', async () => {
    global.window = { location: { origin: 'https://bookmarks.example', protocol: 'https:' } };
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/insights.js')).href;
    const { renderInsightIcon } = await import(`${moduleUrl}?cached-icon-${Date.now()}`);
    const iconData = 'data:image/x-icon;base64,AAABAA==';
    const cache = new Map([['cached', { icon_type: 'base64', icon_data: iconData }]]);

    const html = renderInsightIcon({
        id: 'cached',
        name: 'Cached Icon',
        icon: '🌐',
        icon_type: 'base64',
        icon_data: null
    }, cache);

    assert.match(html, /<img\s/);
    assert.match(html, /data:image\/x-icon;base64,AAABAA==/);
});
