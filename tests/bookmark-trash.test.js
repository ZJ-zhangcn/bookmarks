const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../backend/db');
const bookmarks = require('../shared/services/bookmarks');

async function withDatabase(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-trash-'));
    try {
        await db.initDatabase({ filePath: path.join(dir, 'bookmarks.db') });
        await db.createTables();
        await db.execute('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', ['cat-1', '开发', '💻', 0]);
        return await fn();
    } finally {
        db.closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('deleting a bookmark snapshots it and restore brings back bookmark and AI data', async () => {
    await withDatabase(async () => {
        const saved = await bookmarks.saveBookmark(db, {
            id: 'bm-trash', category_id: 'cat-1', name: '待删除', url: 'https://example.com',
            description: '描述', icon: '🌐', icon_type: 'auto', icon_data: ''
        });
        await db.execute('INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model) VALUES (?, ?, ?, ?, ?)', ['bm-trash', '["AI"]', '摘要', 'openai', 'gpt-test']);

        const removed = await bookmarks.deleteBookmark(db, saved.id);
        assert.equal(removed.bookmarkId, 'bm-trash');
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmarks')).count, 0);
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmark_trash')).count, 1);

        const items = await bookmarks.listTrash(db);
        assert.equal(items.length, 1);
        assert.equal(items[0].name, '待删除');

        const restored = await bookmarks.restoreBookmark(db, removed.trashId);
        assert.equal(restored.id, 'bm-trash');
        assert.equal(restored.category_id, 'cat-1');
        assert.deepEqual(restored.tags, ['AI']);
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmark_trash')).count, 0);
        const ai = await db.queryOne('SELECT provider, model FROM bookmark_ai WHERE bookmark_id = ?', ['bm-trash']);
        assert.deepEqual(ai, { provider: 'openai', model: 'gpt-test' });
    });
});

test('restore recreates a missing category and permanent deletion removes trash record', async () => {
    await withDatabase(async () => {
        await bookmarks.saveBookmark(db, {
            id: 'bm-orphan', category_id: 'cat-1', name: '孤立书签', url: 'https://example.com/orphan'
        });
        const removed = await bookmarks.deleteBookmark(db, 'bm-orphan');
        await db.execute('DELETE FROM categories WHERE id = ?', ['cat-1']);

        const restored = await bookmarks.restoreBookmark(db, removed.trashId);
        assert.equal(restored.id, 'bm-orphan');
        assert.notEqual(restored.category_id, 'cat-1');
        assert.match(restored.category_name, /开发.*恢复/);

        const removedAgain = await bookmarks.deleteBookmark(db, 'bm-orphan');
        assert.equal(await bookmarks.deleteTrash(db, removedAgain.trashId), true);
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmark_trash')).count, 0);
    });
});
