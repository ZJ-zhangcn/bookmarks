const test = require('node:test');
const assert = require('node:assert/strict');

const bookmarksService = require('../shared/services/bookmarks');

function createMemoryBookmarkDb() {
    const tables = {
        categories: [{ id: 'cat-1', name: '默认', icon: '📁', sort_order: 0, created_at: '2026-01-01' }],
        bookmarks: []
    };

    const db = {
        USE_MYSQL: false,
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
                    icon: params[5], icon_type: params[6], icon_data: params[7], item_type: params[8],
                    component_type: params[9], sort_order: params[10], visit_count: params[11] || 0,
                    last_visited_at: params[12] || null, created_at: '2026-01-01'
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
        icon_data: '',
        item_type: 'bookmark',
        component_type: null
    });

    await bookmarksService.recordBookmarkVisit(db, 'bm-visit');

    assert.equal(db.tables.bookmarks[0].visit_count, 1);
    assert.equal(db.tables.bookmarks[0].last_visited_at, 'now');
});
