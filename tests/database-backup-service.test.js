const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const {
    createDailyBackupIfDue,
    createRestoreBackup,
    getLatestBackupInfo,
    verifyBackup
} = require('../backend/services/database-backup-service');

function createDatabaseFixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-backup-'));
    const databasePath = path.join(directory, 'bookmarks.db');
    const connection = new Database(databasePath);
    connection.exec("CREATE TABLE sample (id TEXT PRIMARY KEY); INSERT INTO sample VALUES ('one')");
    return { directory, databasePath, connection };
}

test('daily backup is verified and only created once per UTC date', async () => {
    const fixture = createDatabaseFixture();
    try {
        const now = new Date('2026-08-29T02:00:00.000Z');
        const first = await createDailyBackupIfDue({ ...fixture, now, retention: 14 });
        const second = await createDailyBackupIfDue({
            ...fixture,
            now: new Date('2026-08-29T20:00:00.000Z'),
            retention: 14
        });

        assert.equal(first.skipped, false);
        assert.equal(second.skipped, true);
        assert.equal(first.filePath, second.filePath);
        assert.equal(verifyBackup(first.filePath).integrity, 'ok');
        const snapshot = new Database(first.filePath, { readonly: true });
        assert.equal(snapshot.prepare('SELECT COUNT(*) n FROM sample').get().n, 1);
        snapshot.close();
    } finally {
        fixture.connection.close();
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('latest backup info reports the newest backup across backup types', async () => {
    const fixture = createDatabaseFixture();
    try {
        await createDailyBackupIfDue({
            ...fixture,
            now: new Date('2026-08-28T02:00:00.000Z'),
            retention: 14
        });
        await createRestoreBackup({
            ...fixture,
            now: new Date('2026-08-29T03:00:00.000Z'),
            retention: 5
        });
        const latest = getLatestBackupInfo(fixture.databasePath);
        assert.equal(latest.type, 'restore');
        assert.match(latest.fileName, /bookmarks-pre-restore/);
        assert.ok(latest.size > 0);
    } finally {
        fixture.connection.close();
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('a corrupt daily backup is replaced on the next check', async () => {
    const fixture = createDatabaseFixture();
    try {
        const now = new Date('2026-08-29T02:00:00.000Z');
        const first = await createDailyBackupIfDue({ ...fixture, now, retention: 14 });
        fs.writeFileSync(first.filePath, 'not a sqlite database');

        const replacement = await createDailyBackupIfDue({
            ...fixture,
            now: new Date('2026-08-29T20:00:00.000Z'),
            retention: 14
        });

        assert.equal(replacement.skipped, false);
        assert.equal(verifyBackup(replacement.filePath).integrity, 'ok');
    } finally {
        fixture.connection.close();
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('daily backups are pruned to the configured retention', async () => {
    const fixture = createDatabaseFixture();
    try {
        for (let day = 1; day <= 4; day += 1) {
            await createDailyBackupIfDue({
                ...fixture,
                now: new Date(`2026-08-0${day}T02:00:00.000Z`),
                retention: 2
            });
        }
        const files = fs.readdirSync(path.join(fixture.directory, 'daily-backups')).filter(name => name.endsWith('.db'));
        assert.equal(files.length, 2);
        assert.ok(files.some(name => name.includes('2026-08-04')));
        assert.ok(files.some(name => name.includes('2026-08-03')));
    } finally {
        fixture.connection.close();
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});

test('restore backup captures the database before destructive restore work', async () => {
    const fixture = createDatabaseFixture();
    try {
        const backup = await createRestoreBackup({
            ...fixture,
            now: new Date('2026-08-29T02:00:00.000Z'),
            retention: 5
        });
        fixture.connection.exec('DELETE FROM sample');

        const snapshot = new Database(backup.filePath, { readonly: true });
        assert.equal(snapshot.prepare('SELECT COUNT(*) n FROM sample').get().n, 1);
        snapshot.close();
    } finally {
        fixture.connection.close();
        fs.rmSync(fixture.directory, { recursive: true, force: true });
    }
});
