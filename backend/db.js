/**
 * SQLite 数据库层（简化版）
 * 专注于 SQLite 的性能和稳定性
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { CURRENT_SCHEMA_VERSION, getSchemaVersion, migrateDatabase } = require('./db/migrations');
const backupService = require('./services/database-backup-service');

let db = null;
let databasePath = null;

const DEFAULT_MIGRATION_BACKUP_LIMIT = 5;

function hasExistingUserTables() {
    const row = db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    `).get();
    return Number(row?.count) > 0;
}

function migrationBackupLimit() {
    const parsed = Number.parseInt(process.env.DB_MIGRATION_BACKUP_LIMIT || '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_MIGRATION_BACKUP_LIMIT;
}

function migrationBackupFileName(fromVersion) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `bookmarks-v${fromVersion}-to-v${CURRENT_SCHEMA_VERSION}-${timestamp}.db`;
}

function pruneMigrationBackups(backupDir) {
    const backupFiles = fs.readdirSync(backupDir)
        .filter(name => name.endsWith('.db'))
        .map(name => {
            const filePath = path.join(backupDir, name);
            return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const backup of backupFiles.slice(migrationBackupLimit())) {
        fs.unlinkSync(backup.filePath);
    }
}

async function backupBeforeMigration(fromVersion) {
    if (!hasExistingUserTables()) return null;

    const backupDir = path.join(path.dirname(databasePath), 'migration-backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, migrationBackupFileName(fromVersion));
    await db.backup(backupPath);
    pruneMigrationBackups(backupDir);
    return backupPath;
}

/**
 * 初始化 SQLite 数据库
 */
async function initDatabase(options = {}) {
    console.log('📦 使用 SQLite 数据库');

    const configuredPath = options.filePath || process.env.DB_PATH;
    databasePath = configuredPath
        ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(__dirname, configuredPath))
        : path.join(__dirname, 'data', 'bookmarks.db');

    // 确保数据目录存在
    const dataDir = path.dirname(databasePath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(databasePath);
    db.pragma('journal_mode = WAL'); // 启用 WAL 模式提升并发性能
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL'); // 平衡性能和安全性

    console.log('✅ SQLite 连接成功');
}

function closeDatabase() {
    if (!db) return;
    db.close();
    db = null;
    databasePath = null;
}

/**
 * 创建数据表和索引
 */
async function createTables() {
    const fromVersion = getSchemaVersion(db);
    let backupPath = null;
    if (fromVersion < CURRENT_SCHEMA_VERSION) {
        backupPath = await backupBeforeMigration(fromVersion);
    }

    const result = migrateDatabase(db);
    if (result.applied.length > 0) {
        const versions = result.applied.map(item => `v${item.version}`).join(', ');
        console.log(`✅ SQLite 迁移完成: v${result.fromVersion} -> v${result.toVersion} (${versions})`);
        if (backupPath) console.log(`🗄️ 迁移前备份: ${backupPath}`);
    } else {
        console.log(`✅ SQLite 数据结构已是最新版本 v${result.toVersion}`);
    }
}

/**
 * 查询所有结果
 */
async function queryAll(sql, params = []) {
    return db.prepare(sql).all(...params);
}

/**
 * 查询单行结果
 */
async function queryOne(sql, params = []) {
    return db.prepare(sql).get(...params);
}

/**
 * 执行插入/更新/删除
 */
async function execute(sql, params = []) {
    return db.prepare(sql).run(...params);
}

/**
 * 执行事务
 */
async function transaction(callback) {
    db.exec('BEGIN IMMEDIATE');
    try {
        await callback({
            execute: (sql, params = []) => {
                const result = db.prepare(sql).run(...params);
                return Promise.resolve(result);
            }
        });
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }
}

/**
 * 获取数据库类型（固定为 sqlite）
 */
function getDatabaseType() {
    return 'sqlite';
}

/**
 * 获取原始 SQLite 连接
 */
function getSqliteDb() {
    return db;
}

function getRuntimeInfo() {
    return {
        type: 'sqlite',
        schemaVersion: db ? getSchemaVersion(db) : null,
        latestBackup: databasePath ? backupService.getLatestBackupInfo(databasePath) : null
    };
}

async function createRestoreBackup(options = {}) {
    return backupService.createRestoreBackup({
        connection: db,
        databasePath,
        retention: options.retention || process.env.DB_RESTORE_BACKUP_LIMIT,
        now: options.now
    });
}

async function createDailyBackupIfDue(options = {}) {
    return backupService.createDailyBackupIfDue({
        connection: db,
        databasePath,
        retention: options.retention || process.env.DB_DAILY_BACKUP_LIMIT,
        now: options.now
    });
}

module.exports = {
    initDatabase,
    createTables,
    queryAll,
    queryOne,
    execute,
    transaction,
    getDatabaseType,
    getSqliteDb,
    getRuntimeInfo,
    createRestoreBackup,
    createDailyBackupIfDue,
    closeDatabase
};
