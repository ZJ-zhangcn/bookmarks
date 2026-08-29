const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    CURRENT_SCHEMA_VERSION,
    REQUIRED_COLUMNS,
    getSchemaVersion,
    migrateDatabase
} = require('../backend/db/migrations');
const dbModule = require('../backend/db');

function withDatabase(fn) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-migration-'));
    const dbPath = path.join(tempDir, 'test.db');
    const connection = new Database(dbPath);
    try {
        return fn(connection, dbPath);
    } finally {
        connection.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

test('empty SQLite database migrates to the current schema version', () => {
    withDatabase(connection => {
        const result = migrateDatabase(connection);

        assert.equal(result.fromVersion, 0);
        assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
        assert.deepEqual(result.applied.map(item => item.version), [1, 2, 3]);
        assert.equal(getSchemaVersion(connection), CURRENT_SCHEMA_VERSION);

        for (const [tableName, expectedColumns] of Object.entries(REQUIRED_COLUMNS)) {
            const actualColumns = connection.prepare(`PRAGMA table_info("${tableName}")`).all().map(row => row.name);
            assert.deepEqual(actualColumns, expectedColumns);
        }
        assert.deepEqual(
            connection.prepare('PRAGMA table_info("bookmark_trash")').all().map(row => row.name),
            ['id', 'snapshot_json', 'deleted_at', 'expires_at']
        );
        assert.deepEqual(
            connection.prepare('PRAGMA table_info("bookmark_link_health")').all().map(row => row.name),
            ['url', 'state', 'status_code', 'consecutive_failures', 'error', 'checked_at']
        );
    });
});

test('version zero production-shaped database is baselined without changing data or extra tables', () => {
    withDatabase(connection => {
        migrateDatabase(connection);
        connection.pragma('user_version = 0');
        connection.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run('cat_existing', '现有分类');
        connection.prepare('CREATE TABLE hermes_audit (id TEXT PRIMARY KEY, message TEXT)').run();
        connection.prepare('INSERT INTO hermes_audit (id, message) VALUES (?, ?)').run('audit_1', '保留记录');

        const result = migrateDatabase(connection);

        assert.equal(result.fromVersion, 0);
        assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
        assert.equal(connection.prepare('SELECT name FROM categories WHERE id = ?').get('cat_existing').name, '现有分类');
        assert.equal(connection.prepare('SELECT message FROM hermes_audit WHERE id = ?').get('audit_1').message, '保留记录');
    });
});

test('migration is idempotent after reaching the current schema version', () => {
    withDatabase(connection => {
        migrateDatabase(connection);
        const result = migrateDatabase(connection);

        assert.equal(result.fromVersion, CURRENT_SCHEMA_VERSION);
        assert.equal(result.toVersion, CURRENT_SCHEMA_VERSION);
        assert.deepEqual(result.applied, []);
    });
});

test('version two database upgrades to link health schema without changing bookmarks', () => {
    withDatabase(connection => {
        migrateDatabase(connection);
        connection.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run('cat-v2', '现有分类');
        connection.prepare('INSERT INTO bookmarks (id, category_id, name, url) VALUES (?, ?, ?, ?)').run('bm-v2', 'cat-v2', '现有书签', 'https://example.com');
        connection.exec('DROP TABLE bookmark_link_health');
        connection.pragma('user_version = 2');

        const result = migrateDatabase(connection);
        assert.deepEqual(result.applied.map(item => item.version), [3]);
        assert.equal(connection.prepare('SELECT name FROM bookmarks WHERE id = ?').get('bm-v2').name, '现有书签');
        assert.deepEqual(
            connection.prepare('PRAGMA table_info("bookmark_link_health")').all().map(row => row.name),
            ['url', 'state', 'status_code', 'consecutive_failures', 'error', 'checked_at']
        );
    });
});

test('incompatible version zero schema fails and rolls back the version marker', () => {
    withDatabase(connection => {
        connection.exec(`
            CREATE TABLE categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );
            INSERT INTO categories (id, name) VALUES ('cat_existing', '现有分类');
        `);

        assert.throws(
            () => migrateDatabase(connection),
            /表 categories 缺少字段 icon, type, sort_order, created_at/
        );
        assert.equal(getSchemaVersion(connection), 0);
        assert.equal(connection.prepare('SELECT name FROM categories WHERE id = ?').get('cat_existing').name, '现有分类');
        assert.equal(
            connection.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'bookmarks'").get().count,
            0
        );
    });
});

test('database created by a newer app version is rejected', () => {
    withDatabase(connection => {
        connection.pragma(`user_version = ${CURRENT_SCHEMA_VERSION + 1}`);
        assert.throws(() => migrateDatabase(connection), /高于当前程序支持的版本/);
    });
});

test('database module creates an online backup before baselining an existing database', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-migration-backup-'));
    const dbPath = path.join(tempDir, 'bookmarks.db');
    const seed = new Database(dbPath);
    migrateDatabase(seed);
    seed.pragma('user_version = 0');
    seed.prepare('INSERT INTO categories (id, name) VALUES (?, ?)').run('cat_backup', '备份分类');
    seed.close();

    try {
        await dbModule.initDatabase({ filePath: dbPath });
        await dbModule.createTables();
        dbModule.closeDatabase();

        const backupDir = path.join(tempDir, 'migration-backups');
        const backups = fs.readdirSync(backupDir).filter(name => name.endsWith('.db'));
        assert.equal(backups.length, 1);

        const backup = new Database(path.join(backupDir, backups[0]), { readonly: true });
        assert.equal(getSchemaVersion(backup), 0);
        assert.equal(backup.prepare('SELECT name FROM categories WHERE id = ?').get('cat_backup').name, '备份分类');
        backup.close();

        const migrated = new Database(dbPath, { readonly: true });
        assert.equal(getSchemaVersion(migrated), CURRENT_SCHEMA_VERSION);
        migrated.close();
    } finally {
        dbModule.closeDatabase();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
