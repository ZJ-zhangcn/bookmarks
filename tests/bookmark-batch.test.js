const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../backend/db');
const bookmarks = require('../shared/services/bookmarks');

async function withDatabase(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-batch-'));
    try {
        await db.initDatabase({ filePath: path.join(dir, 'bookmarks.db') });
        await db.createTables();
        await db.execute('INSERT INTO categories (id, name, icon, type, sort_order) VALUES (?, ?, ?, ?, ?)', ['cat-1', '开发', '💻', 'bookmark', 0]);
        await db.execute('INSERT INTO categories (id, name, icon, type, sort_order) VALUES (?, ?, ?, ?, ?)', ['cat-2', '工具', '🧰', 'bookmark', 1]);
        return await fn();
    } finally {
        db.closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

async function add(id, category = 'cat-1') {
    return bookmarks.saveBookmark(db, {
        id, category_id: category, name: id, url: `https://${id}.example.com`, icon_type: 'url', icon_data: 'https://old.example/icon.png'
    });
}

test('batch move and tag actions update all selected bookmarks in one operation', async () => {
    await withDatabase(async () => {
        await add('bm-1');
        await add('bm-2');
        await db.execute('INSERT INTO bookmark_ai (bookmark_id, tags, summary) VALUES (?, ?, ?)', ['bm-1', '["旧"]', '摘要']);

        const moved = await bookmarks.batchUpdateBookmarks(db, { ids: ['bm-1', 'bm-2', 'missing', 'bm-1'], action: 'move', payload: { category_id: 'cat-2' } });
        assert.deepEqual({ processed: moved.processed, skipped: moved.skipped }, { processed: 2, skipped: 2 });
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmarks WHERE category_id = ?', ['cat-2'])).count, 2);

        await bookmarks.batchUpdateBookmarks(db, { ids: ['bm-1', 'bm-2'], action: 'add-tags', payload: { tags: '新,旧' } });
        const tags = JSON.parse((await db.queryOne('SELECT tags FROM bookmark_ai WHERE bookmark_id = ?', ['bm-2'])).tags);
        assert.deepEqual(tags, ['新', '旧']);
        await bookmarks.batchUpdateBookmarks(db, { ids: ['bm-1', 'bm-2'], action: 'remove-tags', payload: { tags: ['旧'] } });
        assert.deepEqual(JSON.parse((await db.queryOne('SELECT tags FROM bookmark_ai WHERE bookmark_id = ?', ['bm-1'])).tags), ['新']);
    });
});

test('batch refresh icons resets icon data and batch trash preserves snapshots', async () => {
    await withDatabase(async () => {
        await add('bm-refresh');
        const refreshed = await bookmarks.batchUpdateBookmarks(db, { ids: ['bm-refresh'], action: 'refresh-icons' });
        assert.equal(refreshed.processed, 1);
        assert.deepEqual(await db.queryOne('SELECT icon_type, icon_data FROM bookmarks WHERE id = ?', ['bm-refresh']), { icon_type: 'auto', icon_data: '' });

        const removed = await bookmarks.batchUpdateBookmarks(db, { ids: ['bm-refresh'], action: 'trash' });
        assert.equal(removed.processed, 1);
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmarks')).count, 0);
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmark_trash')).count, 1);
        const restored = await bookmarks.restoreBookmark(db, removed.skippedIds?.[0] || (await db.queryOne('SELECT id FROM bookmark_trash')).id);
        assert.equal(restored.id, 'bm-refresh');
    });
});

test('batch actions reject an invalid target before changing data', async () => {
    await withDatabase(async () => {
        await add('bm-rollback');
        await assert.rejects(
            bookmarks.batchUpdateBookmarks(db, { ids: ['bm-rollback'], action: 'move', payload: { category_id: 'missing-category' } }),
            /目标分类不存在/
        );
        assert.equal((await db.queryOne('SELECT category_id FROM bookmarks WHERE id = ?', ['bm-rollback'])).category_id, 'cat-1');
    });
});
