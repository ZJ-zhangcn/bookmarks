/**
 * SQLite 数据库层（简化版）
 * 移除 MySQL 支持，专注于 SQLite 的性能和稳定性
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let db = null;

/**
 * 初始化 SQLite 数据库
 */
async function initDatabase() {
    console.log('📦 使用 SQLite 数据库');

    // 确保数据目录存在
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(path.join(dataDir, 'bookmarks.db'));
    db.pragma('journal_mode = WAL'); // 启用 WAL 模式提升并发性能
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL'); // 平衡性能和安全性

    console.log('✅ SQLite 连接成功');
}

/**
 * 创建数据表和索引
 */
async function createTables() {
    db.exec(`
        -- 分类表
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '📁',
            type TEXT DEFAULT 'bookmark',
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 书签表
        CREATE TABLE IF NOT EXISTS bookmarks (
            id TEXT PRIMARY KEY,
            category_id TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT,
            description TEXT,
            icon TEXT DEFAULT '🌐',
            icon_type TEXT DEFAULT 'auto',
            icon_data TEXT,
            item_type TEXT DEFAULT 'bookmark',
            component_type TEXT,
            sort_order INTEGER DEFAULT 0,
            visit_count INTEGER DEFAULT 0,
            last_visited_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );

        -- 搜索引擎表
        CREATE TABLE IF NOT EXISTS search_engines (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '🔍',
            url TEXT NOT NULL,
            is_default INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 配置表
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        -- 图标库表
        CREATE TABLE IF NOT EXISTS icon_library (
            id TEXT PRIMARY KEY,
            name TEXT,
            data TEXT NOT NULL,
            type TEXT DEFAULT 'url',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- AI 标签/摘要表
        CREATE TABLE IF NOT EXISTS bookmark_ai (
            bookmark_id TEXT PRIMARY KEY,
            tags TEXT,
            summary TEXT,
            provider TEXT,
            model TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- TODO 待办表
        CREATE TABLE IF NOT EXISTS todos (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            is_done INTEGER DEFAULT 0,
            sort_order INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            CHECK (is_done IN (0, 1))
        );


        -- 性能优化索引
        CREATE INDEX IF NOT EXISTS idx_bookmarks_category_sort ON bookmarks(category_id, sort_order, created_at);
        CREATE INDEX IF NOT EXISTS idx_bookmarks_visits ON bookmarks(visit_count DESC, last_visited_at DESC);
        CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
        CREATE INDEX IF NOT EXISTS idx_engines_sort ON search_engines(sort_order);
        CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(is_done, sort_order, created_at);
        CREATE INDEX IF NOT EXISTS idx_bookmark_ai_lookup ON bookmark_ai(bookmark_id);
    `);

    console.log('✅ SQLite 数据表和索引创建完成');
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

module.exports = {
    initDatabase,
    createTables,
    queryAll,
    queryOne,
    execute,
    transaction,
    getDatabaseType,
    getSqliteDb
};
