const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../backend/db');
const health = require('../backend/services/bookmark-health-service');
const links = require('../backend/services/bookmark-link-checker');

async function withDatabase(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-health-'));
    try {
        await db.initDatabase({ filePath: path.join(dir, 'bookmarks.db') });
        await db.createTables();
        await db.execute('INSERT INTO categories (id, name, icon, type) VALUES (?, ?, ?, ?)', ['cat-1', '默认', '📁', 'bookmark']);
        return await fn();
    } finally {
        db.closeDatabase();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

test('local health scan is read-only and groups normalized duplicate URLs', async () => {
    await withDatabase(async () => {
        await db.execute('INSERT INTO bookmarks (id, category_id, name, url, icon_type) VALUES (?, ?, ?, ?, ?)', ['a', 'cat-1', 'A', 'https://EXAMPLE.com/', 'auto']);
        await db.execute('INSERT INTO bookmarks (id, category_id, name, url, icon_type) VALUES (?, ?, ?, ?, ?)', ['b', 'cat-1', 'B', 'https://example.com', 'emoji']);
        await db.execute('INSERT INTO bookmarks (id, category_id, name, url) VALUES (?, ?, ?, ?)', ['c', 'cat-1', 'C', 'not-a-url']);
        const before = (await db.queryOne('SELECT COUNT(*) AS count FROM bookmarks')).count;
        const result = await health.runLocalHealthChecks(db);
        assert.equal(result.integrity, 'ok');
        assert.equal(result.duplicateUrls.length, 1);
        assert.equal(result.duplicateUrls[0].items.length, 2);
        assert.equal(result.invalidUrls[0].id, 'c');
        assert.equal((await db.queryOne('SELECT COUNT(*) AS count FROM bookmarks')).count, before);
    });
});

test('link checker only marks a URL failed after two consecutive failures', async () => {
    await withDatabase(async () => {
        const failed = { state: 'failed', statusCode: 500, error: 'HTTP 500' };
        assert.equal(await links.persistResult(db, 'https://failed.example', failed), 'warning');
        assert.equal(await links.persistResult(db, 'https://failed.example', failed), 'failed');
        const stored = await db.queryOne('SELECT state, consecutive_failures FROM bookmark_link_health WHERE url = ?', ['https://failed.example']);
        assert.deepEqual(stored, { state: 'failed', consecutive_failures: 2 });
        assert.equal(await links.persistResult(db, 'https://failed.example', { state: 'healthy', statusCode: 200, error: '' }), 'healthy');
        assert.equal((await db.queryOne('SELECT consecutive_failures FROM bookmark_link_health WHERE url = ?', ['https://failed.example'])).consecutive_failures, 0);
    });
});
