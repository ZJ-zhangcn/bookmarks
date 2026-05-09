const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const { attachBookmarkAi } = require('../shared/services/bookmarks');
const { saveBookmarkAi } = require('../shared/services/ai');

function createMemoryDb() {
    const bookmarkAi = new Map();
    return {
        USE_MYSQL: false,
        async execute(sql, params = []) {
            if (/INSERT INTO bookmark_ai/i.test(sql)) {
                const [bookmarkId, tags, summary, provider, model] = params;
                bookmarkAi.set(bookmarkId, {
                    bookmark_id: bookmarkId,
                    tags,
                    summary,
                    provider,
                    model,
                    updated_at: new Date().toISOString()
                });
            }
            return { changes: 1 };
        },
        async queryAll(sql, params = []) {
            if (/SELECT bookmark_id, tags, summary FROM bookmark_ai WHERE bookmark_id IN/i.test(sql)) {
                return params.map(id => bookmarkAi.get(id)).filter(Boolean);
            }
            return [];
        },
        async queryOne(sql, params = []) {
            if (/SELECT \* FROM bookmark_ai WHERE bookmark_id = \?/i.test(sql)) {
                return bookmarkAi.get(params[0]) || null;
            }
            return null;
        }
    };
}

test('saving empty manual tags removes stale tags from bookmark list data', async () => {
    const db = createMemoryDb();
    const bookmarkId = 'bm-tags-clear';

    await saveBookmarkAi(db, { bookmarkId, tags: 'AI工具,开发', summary: '' });
    await saveBookmarkAi(db, { bookmarkId, tags: '', summary: '' });

    const bookmarks = [{ id: bookmarkId, name: 'Example' }];
    await attachBookmarkAi(db, bookmarks);

    assert.deepEqual(bookmarks[0].tags, []);
    assert.equal(bookmarks[0].ai_summary, '');
});

test('bookmark cards show saved tags even when not filtering', async () => {
    global.window = { location: { protocol: 'https:' } };
    global.document = { querySelectorAll: () => [] };
    global.CSS = { escape: value => String(value) };

    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/render.js')).href;
    const { createBookmarkCard } = await import(`${moduleUrl}?tags-card-${Date.now()}`);

    const html = createBookmarkCard({
        id: 'bm-visible-tags',
        name: '工具站',
        url: 'https://example.com',
        description: 'Example',
        icon: '🌐',
        icon_type: 'emoji',
        icon_data: '',
        tags: ['开发', '效率']
    }, '');

    assert.match(html, /class="bookmark-tags"/);
    assert.match(html, /开发/);
    assert.match(html, /效率/);
});
