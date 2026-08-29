const test = require('node:test');
const assert = require('node:assert/strict');

const bookmarksService = require('../shared/services/bookmarks');

function createMemoryBookmarkDb() {
    const tables = {
        categories: [{ id: 'cat-1', name: '默认', icon: '📁', sort_order: 0, created_at: '2026-01-01' }],
        bookmarks: [],
        bookmarkAi: []
    };

    const db = {
        getDatabaseType: () => 'sqlite',
        tables,
        async queryAll(sql, params = []) {
            if (/FROM bookmark_ai/i.test(sql)) return [];
            if (/FROM bookmarks b LEFT JOIN categories/i.test(sql)) {
                return tables.bookmarks.map(b => ({
                    ...b,
                    category_name: '默认',
                    category_icon: '📁'
                }));
            }
            if (/FROM bookmarks ORDER BY/i.test(sql)) return [...tables.bookmarks];
            if (/SELECT \* FROM categories/i.test(sql)) return [...tables.categories];
            if (/FROM bookmarks WHERE id IN/i.test(sql)) return tables.bookmarks.filter(b => params.includes(b.id));
            return [];
        },
        async queryOne(sql, params = []) {
            if (/SELECT b\.id, b\.category_id/i.test(sql)) {
                const row = tables.bookmarks.find(b => b.id === params[0]);
                return row ? { ...row, category_name: '默认', category_icon: '📁', tags: null, ai_summary: '' } : null;
            }
            if (/SELECT id, visit_count, last_visited_at FROM bookmarks/i.test(sql)) {
                const row = tables.bookmarks.find(b => b.id === params[0]);
                return row ? { id: row.id, visit_count: row.visit_count, last_visited_at: row.last_visited_at } : null;
            }
            if (/FROM categories WHERE id/i.test(sql)) return tables.categories.find(c => c.id === params[0]) || null;
            if (/MAX\(sort_order\).*FROM bookmarks/i.test(sql)) {
                const categoryId = params[0];
                const rows = tables.bookmarks.filter(b => b.category_id === categoryId);
                return { max_order: rows.length ? Math.max(...rows.map(b => b.sort_order || 0)) : null };
            }
            if (/MAX\(sort_order\).*FROM categories/i.test(sql)) return { max_order: 0 };
            if (/SELECT sort_order FROM bookmarks/i.test(sql)) {
                const row = tables.bookmarks.find(b => b.id === params[0]);
                return row ? { sort_order: row.sort_order } : null;
            }
            return null;
        },
        async execute(sql, params = []) {
            if (/INSERT INTO bookmarks/i.test(sql)) {
                const row = {
                    id: params[0], category_id: params[1], name: params[2], url: params[3], description: params[4],
                    icon: params[5], icon_type: params[6], icon_data: params[7], sort_order: params[8],
                    visit_count: params[9] || 0, last_visited_at: params[10] || null, created_at: '2026-01-01'
                };
                const index = tables.bookmarks.findIndex(b => b.id === row.id);
                if (index >= 0) tables.bookmarks[index] = { ...tables.bookmarks[index], ...row };
                else tables.bookmarks.push(row);
                return { changes: 1 };
            }
            if (/UPDATE bookmarks[\s\S]*visit_count = COALESCE\(visit_count, 0\) \+ 1/i.test(sql)) {
                const row = tables.bookmarks.find(b => b.id === params[0]);
                if (row) {
                    row.visit_count = (row.visit_count || 0) + 1;
                    row.last_visited_at = 'now';
                }
                return { changes: row ? 1 : 0 };
            }
            if (/DELETE FROM bookmark_ai/i.test(sql)) {
                tables.bookmarkAi = tables.bookmarkAi.filter(row => row.bookmark_id !== params[0]);
                return { changes: 1 };
            }
            if (/DELETE FROM bookmarks/i.test(sql)) {
                tables.bookmarks = tables.bookmarks.filter(row => row.id !== params[0]);
                return { changes: 1 };
            }
            throw new Error(`unexpected SQL in test: ${sql}`);
        },
        async transaction(fn) {
            await fn({ execute: this.execute.bind(this) });
        }
    };
    return db;
}

test('recordBookmarkVisit increments visit count and last visited timestamp', async () => {
    const db = createMemoryBookmarkDb();
    await bookmarksService.saveBookmark(db, {
        id: 'bm-visit',
        category_id: 'cat-1',
        name: 'Example',
        url: 'https://example.com',
        description: '',
        icon: '🌐',
        icon_type: 'auto',
        icon_data: ''
    });

    const result = await bookmarksService.recordBookmarkVisit(db, 'bm-visit');

    assert.equal(db.tables.bookmarks[0].visit_count, 1);
    assert.equal(db.tables.bookmarks[0].last_visited_at, 'now');
    assert.deepEqual(result.bookmark, { id: 'bm-visit', visit_count: 1, last_visited_at: 'now' });
});

test('saveBookmark returns the complete bookmark needed for local UI updates', async () => {
    const db = createMemoryBookmarkDb();
    const bookmark = await bookmarksService.saveBookmark(db, {
        category_id: 'cat-1',
        name: 'Local update',
        url: 'https://example.com/local',
        description: 'description',
        icon: '🌐',
        icon_type: 'auto',
        icon_data: ''
    });

    assert.equal(bookmark.name, 'Local update');
    assert.equal(bookmark.category_name, '默认');
    assert.deepEqual(bookmark.tags, []);
    assert.equal(bookmark.visit_count, 0);
});

test('deleting a bookmark removes its AI metadata in the same transaction', async () => {
    const db = createMemoryBookmarkDb();
    db.tables.bookmarks.push({ id: 'bm-delete' });
    db.tables.bookmarkAi.push({ bookmark_id: 'bm-delete', tags: '["AI"]' });

    await bookmarksService.deleteBookmark(db, 'bm-delete');

    assert.equal(db.tables.bookmarks.length, 0);
    assert.equal(db.tables.bookmarkAi.length, 0);
});
