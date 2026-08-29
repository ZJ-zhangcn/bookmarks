const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DAILY_BACKUP_LIMIT = 14;
const DEFAULT_RESTORE_BACKUP_LIMIT = 5;

function clampRetention(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 365) : fallback;
}

function timestampForFile(date) {
    return date.toISOString().replace(/[:.]/g, '-');
}

function listBackupFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory)
        .filter(name => name.endsWith('.db'))
        .map(name => {
            const filePath = path.join(directory, name);
            return { name, filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function getLatestBackupInfo(databasePath) {
    const root = path.dirname(databasePath);
    const candidates = [
        ['daily', 'daily-backups'],
        ['restore', 'restore-backups'],
        ['migration', 'migration-backups']
    ].flatMap(([type, directoryName]) => listBackupFiles(path.join(root, directoryName))
        .map(backup => ({ ...backup, type })));
    const latest = candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (!latest) return null;
    return {
        type: latest.type,
        fileName: latest.name,
        createdAt: new Date(latest.mtimeMs).toISOString(),
        size: fs.statSync(latest.filePath).size
    };
}

function pruneBackupFiles(directory, retention) {
    for (const backup of listBackupFiles(directory).slice(retention)) {
        fs.unlinkSync(backup.filePath);
    }
}

function verifyBackup(filePath) {
    const backup = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
        const integrity = backup.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok') throw new Error(`SQLite 备份完整性检查失败: ${integrity}`);
        return {
            integrity,
            userVersion: Number(backup.pragma('user_version', { simple: true })) || 0,
            size: fs.statSync(filePath).size
        };
    } finally {
        backup.close();
    }
}

async function createBackup({
    connection,
    databasePath,
    directoryName,
    prefix,
    retention,
    now = new Date()
}) {
    const directory = path.join(path.dirname(databasePath), directoryName);
    fs.mkdirSync(directory, { recursive: true });
    const fileName = `${prefix}-${timestampForFile(now)}.db`;
    const filePath = path.join(directory, fileName);

    await connection.backup(filePath);
    fs.utimesSync(filePath, now, now);
    let verification;
    try {
        verification = verifyBackup(filePath);
    } catch (error) {
        fs.rmSync(filePath, { force: true });
        throw error;
    }
    pruneBackupFiles(directory, retention);

    return {
        fileName,
        filePath,
        createdAt: now.toISOString(),
        ...verification
    };
}

async function createRestoreBackup(options) {
    return createBackup({
        ...options,
        directoryName: 'restore-backups',
        prefix: 'bookmarks-pre-restore',
        retention: clampRetention(options.retention, DEFAULT_RESTORE_BACKUP_LIMIT)
    });
}

async function createDailyBackupIfDue(options) {
    const now = options.now || new Date();
    const datePrefix = `bookmarks-daily-${now.toISOString().slice(0, 10)}`;
    const directory = path.join(path.dirname(options.databasePath), 'daily-backups');
    const existing = listBackupFiles(directory).find(backup => backup.name.startsWith(datePrefix));
    if (existing) {
        try {
            const verification = verifyBackup(existing.filePath);
            return { skipped: true, fileName: existing.name, filePath: existing.filePath, ...verification };
        } catch {
            fs.rmSync(existing.filePath, { force: true });
        }
    }

    const result = await createBackup({
        ...options,
        now,
        directoryName: 'daily-backups',
        prefix: datePrefix,
        retention: clampRetention(options.retention, DEFAULT_DAILY_BACKUP_LIMIT)
    });
    return { skipped: false, ...result };
}

module.exports = {
    DEFAULT_DAILY_BACKUP_LIMIT,
    DEFAULT_RESTORE_BACKUP_LIMIT,
    createBackup,
    createRestoreBackup,
    createDailyBackupIfDue,
    getLatestBackupInfo,
    verifyBackup
};
