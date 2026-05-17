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

function parseBooleanEnv(value, defaultValue = false) {
    if (value === undefined || value === null || value === '') return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function buildMysqlSslOptions(url) {
    const sslMode = String(url.searchParams.get('ssl-mode') || process.env.MYSQL_SSL_MODE || '').toLowerCase();
    const sslEnabled = parseBooleanEnv(process.env.MYSQL_SSL, false) || Boolean(sslMode);
    if (!sslEnabled || sslMode === 'disabled' || sslMode === 'disable') return undefined;

    const rejectUnauthorized = !['required', 'require', 'preferred', 'prefer'].includes(sslMode)
        && parseBooleanEnv(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED, true);
    const ssl = { rejectUnauthorized };

    if (process.env.MYSQL_SSL_CA) ssl.ca = process.env.MYSQL_SSL_CA.replace(/\\n/g, '\n');
    if (process.env.MYSQL_SSL_CERT) ssl.cert = process.env.MYSQL_SSL_CERT.replace(/\\n/g, '\n');
    if (process.env.MYSQL_SSL_KEY) ssl.key = process.env.MYSQL_SSL_KEY.replace(/\\n/g, '\n');
    return ssl;
}

function buildMysqlConnectionConfig(databaseUrl) {
    const url = new URL(databaseUrl);
    const ssl = buildMysqlSslOptions(url);
    url.searchParams.delete('ssl-mode');
    return {
        uri: url.toString(),
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 0,
        ...(ssl ? { ssl } : {})
    };
}


/**
 * 初始化数据库连接
 */
async function initDatabase() {
    if (USE_MYSQL) {
        console.log('📦 使用 MySQL 数据库模式');
        const mysql = require('mysql2/promise');

        mysqlPool = mysql.createPool(buildMysqlConnectionConfig(DATABASE_URL));

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
        db.pragma('foreign_keys = ON');
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
                    type VARCHAR(20) DEFAULT 'bookmark',
                    sort_order INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_categories_type (type)
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
                    visit_count INT DEFAULT 0,
                    last_visited_at DATETIME NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_category (category_id),
                    CONSTRAINT fk_bookmarks_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
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

            // AI 标签/摘要（可选）
            await conn.execute(`
                CREATE TABLE IF NOT EXISTS bookmark_ai (
                    bookmark_id VARCHAR(50) PRIMARY KEY,
                    tags LONGTEXT,
                    summary TEXT,
                    provider VARCHAR(50),
                    model VARCHAR(100),
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            // TODO 待办
            await conn.execute(`
                CREATE TABLE IF NOT EXISTS todos (
                    id VARCHAR(50) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    is_done TINYINT DEFAULT 0,
                    sort_order INT DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    completed_at DATETIME NULL,
                    INDEX idx_todos_done (is_done),
                    INDEX idx_todos_list (is_done, sort_order, created_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            // Hermes 控制台审计
            await conn.execute(`
                CREATE TABLE IF NOT EXISTS hermes_audit (
                    id VARCHAR(50) PRIMARY KEY,
                    job_id VARCHAR(80) NOT NULL,
                    action VARCHAR(80) NOT NULL,
                    risk VARCHAR(30) DEFAULT 'low',
                    status VARCHAR(30) NOT NULL,
                    message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_hermes_audit_created (created_at),
                    INDEX idx_hermes_audit_job (job_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            `);

            // 添加性能优化索引（忽略已存在的索引错误）
            const indexStatements = [
                'CREATE INDEX idx_bookmarks_sort ON bookmarks(category_id, sort_order, created_at)',
                'CREATE INDEX idx_categories_sort ON categories(sort_order)',
                'CREATE INDEX idx_engines_sort ON search_engines(sort_order)'
            ];
            const foreignKeyStatements = [
                `ALTER TABLE bookmarks
                 ADD CONSTRAINT fk_bookmarks_category
                 FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE`
            ];
            for (const sql of indexStatements) {
                try {
                    await conn.execute(sql);
                } catch (e) {
                    // 索引已存在，忽略错误
                    if (!e.message.includes('Duplicate')) {
                        console.warn('索引创建警告:', e.message);
                    }
                }
            }
            for (const sql of foreignKeyStatements) {
                try {
                    await conn.execute(sql);
                } catch (e) {
                    if (!e.message.includes('Duplicate') && !e.message.includes('errno: 121')) {
                        console.warn('外键创建警告:', e.message);
                    }
                }
            }

            // 添加可能缺失的列（数据库迁移）
            const alterStatements = [
                "ALTER TABLE categories ADD COLUMN type VARCHAR(20) DEFAULT 'bookmark'",
                "ALTER TABLE bookmarks ADD COLUMN visit_count INT DEFAULT 0",
                "ALTER TABLE bookmarks ADD COLUMN last_visited_at DATETIME NULL"
            ];
            for (const sql of alterStatements) {
                try {
                    await conn.execute(sql);
                } catch (e) {
                    // 列已存在，忽略错误
                    if (!e.message.includes('Duplicate')) {
                        // ignore
                    }
                }
            }

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
                type TEXT DEFAULT 'bookmark',
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
                visit_count INTEGER DEFAULT 0,
                last_visited_at DATETIME,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
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

            -- AI 标签/摘要（可选）
            CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id TEXT PRIMARY KEY,
                tags TEXT,
                summary TEXT,
                provider TEXT,
                model TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- TODO 待办
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

            -- Hermes 控制台审计
            CREATE TABLE IF NOT EXISTS hermes_audit (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                action TEXT NOT NULL,
                risk TEXT DEFAULT 'low',
                status TEXT NOT NULL,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            -- 性能优化索引
            CREATE INDEX IF NOT EXISTS idx_bookmarks_category_id ON bookmarks(category_id);
            CREATE INDEX IF NOT EXISTS idx_bookmarks_sort_order ON bookmarks(sort_order);
            CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
            CREATE INDEX IF NOT EXISTS idx_search_engines_sort_order ON search_engines(sort_order);
            CREATE INDEX IF NOT EXISTS idx_todos_is_done ON todos(is_done);
            CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(is_done, sort_order, created_at);
            CREATE INDEX IF NOT EXISTS idx_hermes_audit_created ON hermes_audit(created_at);
            CREATE INDEX IF NOT EXISTS idx_hermes_audit_job ON hermes_audit(job_id);
        `);

        // 添加可能缺失的列
        try { db.exec('ALTER TABLE bookmarks ADD COLUMN item_type TEXT DEFAULT \'bookmark\''); } catch (e) {}
        try { db.exec('ALTER TABLE bookmarks ADD COLUMN component_type TEXT'); } catch (e) {}
        try { db.exec('ALTER TABLE bookmarks ADD COLUMN visit_count INTEGER DEFAULT 0'); } catch (e) {}
        try { db.exec('ALTER TABLE bookmarks ADD COLUMN last_visited_at DATETIME'); } catch (e) {}
        try { db.exec('ALTER TABLE search_engines ADD COLUMN sort_order INTEGER DEFAULT 0'); } catch (e) {}
        try { db.exec('ALTER TABLE categories ADD COLUMN type TEXT DEFAULT \'bookmark\''); } catch (e) {}

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
 * 支持 async callback，SQLite 模式使用手动事务管理
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
        // SQLite 模式：手动管理事务以支持 async callback
        db.exec('BEGIN IMMEDIATE');
        try {
            await callback({
                execute: (sql, params = []) => {
                    // 同步执行，返回 Promise 以保持 API 一致性
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
