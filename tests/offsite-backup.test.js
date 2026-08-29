const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../backend/db');
const offsite = require('../backend/services/offsite-backup-service');

test('offsite backup uploads, downloads and verifies the remote SQLite snapshot', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-offsite-'));
    const original = Object.fromEntries(Object.keys(process.env).filter(key => key.startsWith('DB_OFFSITE_')).map(key => [key, process.env[key]]));
    const remote = new Map();
    const service = {
        async uploadBinary({ path: remotePath, data }) { remote.set(remotePath, Buffer.from(data)); },
        async move({ from, to }) { remote.set(to, remote.get(from)); remote.delete(from); },
        async downloadBinary({ path: remotePath }) { return remote.get(remotePath); },
        async list() { return [...remote.keys()]; },
        async remove({ path: remotePath }) { remote.delete(remotePath); }
    };
    try {
        Object.assign(process.env, {
            DB_OFFSITE_BACKUP_ENABLED: 'true', DB_OFFSITE_WEBDAV_URL: 'https://dav.example/',
            DB_OFFSITE_WEBDAV_USERNAME: 'user', DB_OFFSITE_WEBDAV_PASSWORD: 'pass',
            DB_OFFSITE_WEBDAV_PATH: 'backups', DB_OFFSITE_BACKUP_LIMIT: '2'
        });
        await db.initDatabase({ filePath: path.join(dir, 'bookmarks.db') });
        await db.createTables();
        const status = await offsite.run({ db, webdavService: service });
        assert.equal(status.state, 'ok');
        assert.equal(status.verified, true);
        assert.match(status.sha256, /^[a-f0-9]{64}$/);
        assert.equal(remote.has(`backups/${status.fileName}`), true);
    } finally {
        db.closeDatabase();
        for (const key of Object.keys(process.env).filter(key => key.startsWith('DB_OFFSITE_'))) delete process.env[key];
        Object.assign(process.env, original);
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
