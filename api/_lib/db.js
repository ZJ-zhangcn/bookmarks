/**
 * MySQL 数据库连接和操作封装
 * 用于 Vercel Serverless Functions
 */

const mysql = require('mysql2/promise');

// 数据库连接池
let pool = null;

/**
 * 获取数据库连接池
 */
function getPool() {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('DATABASE_URL 环境变量未设置');
        }

        pool = mysql.createPool({
            uri: connectionString,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0
        });
    }
    return pool;
}

/**
 * 执行查询
 */
async function query(sql, params = []) {
    const pool = getPool();
    const [rows] = await pool.execute(sql, params);
    return rows;
}

/**
 * 执行单条查询，返回第一行
 */
async function queryOne(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
}

/**
 * 执行插入/更新/删除
 */
async function execute(sql, params = []) {
    const pool = getPool();
    const [result] = await pool.execute(sql, params);
    return result;
}

/**
 * 事务执行
 */
async function transaction(callback) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    getPool,
    query,
    queryOne,
    execute,
    transaction
};
