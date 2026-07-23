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
            if (/FROM categories WHERE name/i.test(sql)) return tables.categories.find(c => c.name === params[0]) || null;
            if (/MAX\(sort_order\).*FROM bookmarks/i.test(sql)) {
                const categoryId = params[0];
                const rows = tables.bookmarks.filter(b => b.category_id === categoryId);
                return { max_order: rows.length ? Math.max(...rows.map(b => b.sort_order || 0)) : null };
            }
            if (/MAX\(sort_order\).*FROM categories/i.test(sql)) {
                return { max_order: Math.max(...tables.categories.map(c => c.sort_order || 0)) };
            }
            if (/SELECT sort_order FROM bookmarks/i.test(sql)) {
                const row = tables.bookmarks.find(b => b.id === params[0]);
                return row ? { sort_order: row.sort_order } : null;
            }
            return null;
        },
        async execute(sql, params = []) {
            if (/INSERT INTO categories/i.test(sql)) {
                const [id, name, icon, sort_order] = params;
                await db.onCategoryInsert?.({ id, name, icon, sort_order });
                if (tables.categories.some(c => c.id === id)) {
                    const error = new Error('UNIQUE constraint failed: categories.id');
                    error.code = 'SQLITE_CONSTRAINT_PRIMARYKEY';
                    throw error;
                }
                tables.categories.push({ id, name, icon, sort_order, created_at: '2026-01-01' });
                return { changes: 1 };
            }
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
            throw new Error(`unexpected SQL in test: ${sql}`);
        },
        async transaction(fn) {
            await fn({ execute: this.execute.bind(this) });
        }
    };
    return db;
}

function saveTestBookmark(db, id, category_id, { omitCategory = false } = {}) {
    const bookmark = {
        id,
        name: 'Example',
        url: 'https://example.com',
        description: '',
        icon: '🌐',
        icon_type: 'auto',
        icon_data: ''
    };
    if (!omitCategory) bookmark.category_id = category_id;
    return bookmarksService.saveBookmark(db, bookmark);
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

    await bookmarksService.recordBookmarkVisit(db, 'bm-visit');

    assert.equal(db.tables.bookmarks[0].visit_count, 1);
    assert.equal(db.tables.bookmarks[0].last_visited_at, 'now');
});

test('saveBookmark maps the __inbox__ sentinel to a visible inbox category', async () => {
    const db = createMemoryBookmarkDb();

    await saveTestBookmark(db, 'bm-sentinel', '__inbox__');

    const inboxes = db.tables.categories.filter(category => category.name === '收件箱');
    assert.equal(inboxes.length, 1);
    assert.equal(inboxes[0].id, 'cat_inbox');
    assert.equal(db.tables.bookmarks[0].category_id, inboxes[0].id);
    assert.equal(db.tables.categories.filter(category => category.name === '__inbox__').length, 0);
});

test('saveBookmark reuses one inbox for blank, omitted, and sentinel category requests', async () => {
    const db = createMemoryBookmarkDb();

    await saveTestBookmark(db, 'bm-blank', '   ');
    await saveTestBookmark(db, 'bm-omitted', undefined, { omitCategory: true });
    await saveTestBookmark(db, 'bm-sentinel', '__inbox__');

    const inboxes = db.tables.categories.filter(category => category.name === '收件箱');
    assert.equal(inboxes.length, 1);
    assert.deepEqual(
        db.tables.bookmarks.map(bookmark => bookmark.category_id),
        [inboxes[0].id, inboxes[0].id, inboxes[0].id]
    );
});

test('saveBookmark reuses an existing visible inbox category', async () => {
    const db = createMemoryBookmarkDb();
    db.tables.categories.push({ id: 'existing-inbox', name: '收件箱', icon: '📥', sort_order: 1, created_at: '2026-01-01' });

    await saveTestBookmark(db, 'bm-existing-inbox', '__inbox__');

    assert.equal(db.tables.bookmarks[0].category_id, 'existing-inbox');
    assert.equal(db.tables.categories.filter(category => category.name === '收件箱').length, 1);
});

test('saveBookmark recovers when a concurrent writer creates the inbox first', async () => {
    const db = createMemoryBookmarkDb();
    db.onCategoryInsert = async category => {
        if (category.id !== 'cat_inbox') return;
        db.onCategoryInsert = undefined;
        db.tables.categories.push({ ...category, created_at: '2026-01-01' });
    };

    await saveTestBookmark(db, 'bm-concurrent-inbox', '__inbox__');

    assert.equal(db.tables.categories.filter(category => category.name === '收件箱').length, 1);
    assert.equal(db.tables.bookmarks[0].category_id, 'cat_inbox');
});

test('saveBookmark does not use an unrelated category that occupies the inbox ID', async () => {
    const db = createMemoryBookmarkDb();
    db.tables.categories.push({ id: 'cat_inbox', name: 'Not an inbox', icon: '📁', sort_order: 1, created_at: '2026-01-01' });

    await saveTestBookmark(db, 'bm-inbox-id-collision', '__inbox__');

    const inboxes = db.tables.categories.filter(category => category.name === '收件箱');
    assert.equal(inboxes.length, 1);
    assert.notEqual(inboxes[0].id, 'cat_inbox');
    assert.equal(db.tables.bookmarks[0].category_id, inboxes[0].id);
    assert.notEqual(db.tables.bookmarks[0].category_id, 'cat_inbox');
});

test('saveBookmark creates an exact-name category for an unknown legacy category value', async () => {
    const db = createMemoryBookmarkDb();

    await saveTestBookmark(db, 'bm-legacy', 'Legacy Saved Category');

    const legacyCategories = db.tables.categories.filter(category => category.name === 'Legacy Saved Category');
    assert.equal(legacyCategories.length, 1);
    assert.equal(db.tables.bookmarks[0].category_id, legacyCategories[0].id);
});
