/**
 * 数据库抽象层
 * 支持 SQLite 和 MySQL 两种模式
 * 通过环境变量 DATABASE_URL 自动切换
 */

const path = require('path');
const fs = require('fs');

// 检测数据库类型
const DATABASE_URL = process.env.DATABASE_URL;
const USE_MYSQL = DATABASE_URL && DATABASE_URL.startsWith('mysql://');

let db = null;
let mysqlPool = null;

/**
 * 初始化数据库连接
 */
async function initDatabase() {
    if (USE_MYSQL) {
        console.log('📦 使用 MySQL 数据库模式');
        const mysql = require('mysql2/promise');

        // 移除 ssl-mode 参数，改用 mysql2 原生 ssl 配置
        let connectionString = DATABASE_URL.replace(/[?&]ssl-mode=[^&]*/gi, '');

        mysqlPool = mysql.createPool({
            uri: connectionString,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            ssl: { rejectUnauthorized: false }
        });

        // 测试连接
        try {
            const conn = await mysqlPool.getConnection();
            conn.release();
            console.log('✅ MySQL 连接成功');
        } catch (err) {
            console.error('❌ MySQL 连接失败:', err.message);
            throw err;
        }
    } else {
        console.log('📦 使用 SQLite 数据库模式');
        const Database = require('better-sqlite3');

        // 确保数据目录存在
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        db = new Database(path.join(dataDir, 'bookmarks.db'));
        console.log('✅ SQLite 连接成功');
    }
}

/**
 * 创建数据表
 */
async function createTables() {
    if (USE_MYSQL) {
        const conn = await mysqlPool.getConnection();
        try {
            await conn.execute(`
                CREATE TABLE IF NOT EXISTS categories (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    icon VARCHAR(50) DEFAULT '📁',
                    sort_order INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await conn.execute(`
                CREATE TABLE IF NOT EXISTS bookmarks (
                    id VARCHAR(50) PRIMARY KEY,
                    category_id VARCHAR(50) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    url TEXT,
                    description TEXT,
                    icon VARCHAR(50) DEFAULT '🌐',
                    icon_type VARCHAR(20) DEFAULT 'auto',
                    icon_data LONGTEXT,
                    item_type VARCHAR(20) DEFAULT 'bookmark',
                    component_type VARCHAR(50),
                    sort_order INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_category (category_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await conn.execute(`
                CREATE TABLE IF NOT EXISTS search_engines (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    icon VARCHAR(255),
                    url TEXT NOT NULL,
                    is_default TINYINT DEFAULT 0,
                    sort_order INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await conn.execute(`
                CREATE TABLE IF NOT EXISTS config (
                    \`key\` VARCHAR(100) PRIMARY KEY,
                    value LONGTEXT
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            await conn.execute(`
                CREATE TABLE IF NOT EXISTS icon_library (
                    id VARCHAR(50) PRIMARY KEY,
                    name VARCHAR(255),
                    data LONGTEXT NOT NULL,
                    type VARCHAR(20) DEFAULT 'url',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            console.log('✅ MySQL 数据表创建/检查完成');
        } finally {
            conn.release();
        }
    } else {
        // SQLite 建表
        db.exec(`
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '📁',
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

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
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            CREATE TABLE IF NOT EXISTS search_engines (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT DEFAULT '🔍',
                url TEXT NOT NULL,
                is_default INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS icon_library (
                id TEXT PRIMARY KEY,
                name TEXT,
                data TEXT NOT NULL,
                type TEXT DEFAULT 'url',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 添加可能缺失的列
        try { db.exec(`ALTER TABLE bookmarks ADD COLUMN item_type TEXT DEFAULT 'bookmark'`); } catch (e) {}
        try { db.exec(`ALTER TABLE bookmarks ADD COLUMN component_type TEXT`); } catch (e) {}
        try { db.exec(`ALTER TABLE search_engines ADD COLUMN sort_order INTEGER DEFAULT 0`); } catch (e) {}

        console.log('✅ SQLite 数据表创建/检查完成');
    }
}

// ========================================
// 统一的数据库操作接口
// ========================================

/**
 * 执行查询，返回所有结果
 */
async function queryAll(sql, params = []) {
    if (USE_MYSQL) {
        // MySQL 使用 ? 占位符，需要转换 SQLite 的参数格式
        const [rows] = await mysqlPool.execute(sql, params);
        return rows;
    } else {
        return db.prepare(sql).all(...params);
    }
}

/**
 * 执行查询，返回第一行
 */
async function queryOne(sql, params = []) {
    if (USE_MYSQL) {
        const [rows] = await mysqlPool.execute(sql, params);
        return rows[0] || null;
    } else {
        return db.prepare(sql).get(...params);
    }
}

/**
 * 执行插入/更新/删除
 */
async function execute(sql, params = []) {
    if (USE_MYSQL) {
        const [result] = await mysqlPool.execute(sql, params);
        return { changes: result.affectedRows, lastInsertRowid: result.insertId };
    } else {
        return db.prepare(sql).run(...params);
    }
}

/**
 * 执行事务
 */
async function transaction(callback) {
    if (USE_MYSQL) {
        const conn = await mysqlPool.getConnection();
        try {
            await conn.beginTransaction();
            await callback({
                execute: async (sql, params) => {
                    const [result] = await conn.execute(sql, params);
                    return result;
                }
            });
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    } else {
        const sqliteTransaction = db.transaction(callback);
        sqliteTransaction({
            execute: (sql, params) => db.prepare(sql).run(...params)
        });
    }
}

/**
 * 获取数据库类型
 */
function getDatabaseType() {
    return USE_MYSQL ? 'mysql' : 'sqlite';
}

/**
 * 获取原始 SQLite 连接（仅 SQLite 模式）
 */
function getSqliteDb() {
    return db;
}

/**
 * 获取 MySQL 连接池（仅 MySQL 模式）
 */
function getMysqlPool() {
    return mysqlPool;
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
    getMysqlPool,
    USE_MYSQL
};
