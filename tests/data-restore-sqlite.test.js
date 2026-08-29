const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const db = require('../backend/db');
const dataService = require('../shared/services/data');

test('full restore works against SQLite and preserves extension-owned data', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-restore-'));
    const databasePath = path.join(directory, 'bookmarks.db');

    try {
        await db.initDatabase({ filePath: databasePath });
        await db.createTables();
        await db.execute('CREATE TABLE extension_data (id TEXT PRIMARY KEY, value TEXT)');
        await db.execute('INSERT INTO extension_data (id, value) VALUES (?, ?)', ['ext-1', 'keep-me']);
        await db.execute('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', ['old-cat', '旧分类', '', 0]);
        await db.execute(
            'INSERT INTO bookmarks (id, category_id, name, url, sort_order) VALUES (?, ?, ?, ?, ?)',
            ['old-bm', 'old-cat', '旧书签', 'https://old.example', 0]
        );
        await db.execute('INSERT INTO config (key, value) VALUES (?, ?)', ['personalization', '{"old":true}']);
        await db.execute('INSERT INTO config (key, value) VALUES (?, ?)', ['extension-setting', 'keep-me']);

        const backup = await db.createRestoreBackup({ now: new Date('2026-08-29T02:00:00.000Z') });
        await dataService.importData(db, {
            version: '1.2',
            categories: [{ id: 'new-cat', name: '新分类', icon: '', sort_order: 0 }],
            bookmarks: [{
                id: 'new-bm',
                category_id: 'new-cat',
                name: '新书签',
                url: 'https://new.example',
                sort_order: 0
            }],
            engines: [{ id: 'engine-1', name: '搜索', icon: '', url: 'https://search.example?q=', sort_order: 0 }],
            todos: [],
            bookmark_ai: [],
            icon_library: [],
            personalization: { theme: 'dark' }
        }, { mode: 'restore' });

        assert.deepEqual((await db.queryAll('SELECT id FROM categories')).map(row => row.id), ['new-cat']);
        assert.deepEqual((await db.queryAll('SELECT id FROM bookmarks')).map(row => row.id), ['new-bm']);
        assert.equal((await db.queryOne('SELECT value FROM extension_data WHERE id = ?', ['ext-1'])).value, 'keep-me');
        assert.equal((await db.queryOne('SELECT value FROM config WHERE key = ?', ['extension-setting'])).value, 'keep-me');
        assert.deepEqual(
            JSON.parse((await db.queryOne('SELECT value FROM config WHERE key = ?', ['personalization'])).value),
            { theme: 'dark' }
        );

        const snapshot = new Database(backup.filePath, { readonly: true });
        assert.equal(snapshot.prepare('SELECT COUNT(*) count FROM bookmarks WHERE id = ?').get('old-bm').count, 1);
        assert.equal(snapshot.prepare('SELECT value FROM extension_data WHERE id = ?').get('ext-1').value, 'keep-me');
        snapshot.close();
    } finally {
        db.closeDatabase();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
