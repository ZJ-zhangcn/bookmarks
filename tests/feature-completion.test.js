const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../backend/db');
const categories = require('../shared/services/categories');

async function withDatabase(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-feature-'));
    try {
        await db.initDatabase({ filePath: path.join(dir, 'bookmarks.db') });
        await db.createTables();
        return await fn();
    } finally {
        db.closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('deleting a bookmark category migrates its bookmarks instead of deleting them', async () => {
    await withDatabase(async () => {
        await db.execute('INSERT INTO categories (id, name, type, sort_order) VALUES (?, ?, ?, ?)', ['cat-a', 'A', 'bookmark', 0]);
        await db.execute('INSERT INTO categories (id, name, type, sort_order) VALUES (?, ?, ?, ?)', ['cat-b', 'B', 'bookmark', 1]);
        await db.execute('INSERT INTO bookmarks (id, category_id, name, url) VALUES (?, ?, ?, ?)', ['bm-1', 'cat-a', '书签', 'https://example.com']);
        const result = await categories.deleteCategory(db, 'cat-a', { targetCategoryId: 'cat-b' });
        assert.equal(result.moved, 1);
        assert.equal((await db.queryOne('SELECT category_id FROM bookmarks WHERE id = ?', ['bm-1'])).category_id, 'cat-b');
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM categories WHERE id = ?', ['cat-a'])).count, 0);
    });
});
