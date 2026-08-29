const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const webdav = require('../../shared/services/webdav');
const { verifyBackup } = require('./database-backup-service');

let running = false;
let status = { enabled: false, configured: false, state: 'disabled', lastSuccessAt: null, lastErrorAt: null, lastError: null, fileName: null, size: null, sha256: null, verified: false };

function getConfig() {
    const enabled = String(process.env.DB_OFFSITE_BACKUP_ENABLED || '').toLowerCase() === 'true';
    return {
        enabled,
        provider: String(process.env.DB_OFFSITE_BACKUP_PROVIDER || 'webdav').trim().toLowerCase(),
        url: String(process.env.DB_OFFSITE_WEBDAV_URL || '').trim(),
        username: String(process.env.DB_OFFSITE_WEBDAV_USERNAME || '').trim(),
        password: String(process.env.DB_OFFSITE_WEBDAV_PASSWORD || ''),
        directory: String(process.env.DB_OFFSITE_WEBDAV_PATH || 'bookmarks/sqlite-backups/').replace(/^\/+|\/+$/g, ''),
        limit: Math.min(365, Math.max(1, Number.parseInt(process.env.DB_OFFSITE_BACKUP_LIMIT || '30', 10) || 30))
    };
}

function getStatus() {
    const config = getConfig();
    return {
        ...status,
        enabled: config.enabled,
        provider: config.provider,
        configured: config.enabled && Boolean(config.url && config.username && config.password),
        state: config.enabled ? (status.state === 'disabled' ? 'idle' : status.state) : 'disabled'
    };
}

function remotePath(directory, fileName) {
    return `${directory.replace(/\/+$/, '')}/${fileName}`;
}

async function run({ db, webdavService = webdav } = {}) {
    const config = getConfig();
    if (!config.enabled) return getStatus();
    if (config.provider !== 'webdav') {
        status = { ...status, state: 'error', lastErrorAt: new Date().toISOString(), lastError: `不支持的异地备份 Provider: ${config.provider}` };
        return getStatus();
    }
    if (!config.url || !config.username || !config.password) {
        status = { ...status, state: 'error', lastErrorAt: new Date().toISOString(), lastError: '异地备份已启用，但 WebDAV 配置不完整' };
        return getStatus();
    }
    if (running) return getStatus();
    running = true;
    try {
        const localBackup = await db.createDailyBackupIfDue();
        const bytes = fs.readFileSync(localBackup.filePath);
        const fileName = `bookmarks-offsite-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
        const finalPath = remotePath(config.directory, fileName);
        const tempPath = `${finalPath}.uploading-${process.pid}`;
        await webdavService.uploadBinary({ url: config.url, username: config.username, password: config.password, path: tempPath, data: bytes });
        try {
            await webdavService.move({ url: config.url, username: config.username, password: config.password, from: tempPath, to: finalPath });
        } catch {
            await webdavService.uploadBinary({ url: config.url, username: config.username, password: config.password, path: finalPath, data: bytes });
            await webdavService.remove({ url: config.url, username: config.username, password: config.password, path: tempPath }).catch(() => {});
        }

        const verifyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmarks-offsite-verify-'));
        try {
            const downloaded = await webdavService.downloadBinary({ url: config.url, username: config.username, password: config.password, path: finalPath });
            const verifyPath = path.join(verifyDir, fileName);
            fs.writeFileSync(verifyPath, downloaded);
            verifyBackup(verifyPath);
        } finally {
            fs.rmSync(verifyDir, { recursive: true, force: true });
        }

        const remoteFiles = await webdavService.list({ url: config.url, username: config.username, password: config.password, path: config.directory }).catch(() => []);
        const backupNames = remoteFiles
            .map(value => decodeURIComponent(String(value)).split('/').pop())
            .filter(value => /bookmarks-offsite-.*\.db$/.test(value))
            .sort().reverse();
        for (const old of backupNames.slice(config.limit)) {
            await webdavService.remove({ url: config.url, username: config.username, password: config.password, path: remotePath(config.directory, old) }).catch(() => {});
        }
        status = {
            ...status,
            state: 'ok',
            lastSuccessAt: new Date().toISOString(),
            lastErrorAt: null,
            lastError: null,
            fileName,
            size: bytes.length,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
            verified: true
        };
    } catch (error) {
        status = { ...status, state: 'error', lastErrorAt: new Date().toISOString(), lastError: error.message };
        console.error('❌ WebDAV 异地备份失败:', error.message);
    } finally {
        running = false;
    }
    return getStatus();
}

module.exports = { getConfig, getStatus, run };
