const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const databasePath = path.join(os.tmpdir(), 'bookmark-nav-playwright.db');
for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
}

process.env.NODE_ENV = 'test';
process.env.PORT = '43117';
process.env.DB_PATH = databasePath;
process.env.AUTH_MODE = 'off';
process.env.DB_DAILY_BACKUP_ENABLED = 'false';
process.env.APP_VERSION = 'e2e';
process.env.GIT_COMMIT = 'playwright';
process.env.BUILD_TIME = '2026-08-29T00:00:00.000Z';

require('../../backend/server');
