/**
 * AI 数据库操作模块
 */

function isMysql(db) {
    return db.USE_MYSQL || db.getDatabaseType?.() === 'mysql';
}

async function ensureAiTables(db) {
    const createSql = isMysql(db)
        ? `CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id VARCHAR(50) PRIMARY KEY,
                tags LONGTEXT,
                summary TEXT,
                provider VARCHAR(50),
                model VARCHAR(100),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        : `CREATE TABLE IF NOT EXISTS bookmark_ai (
                bookmark_id TEXT PRIMARY KEY,
                tags TEXT,
                summary TEXT,
                provider TEXT,
                model TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`;
    await db.execute(createSql);
}

async function upsertBookmarkAi(db, { bookmarkId, tags, summary, provider, model }) {
    const tagsJson = JSON.stringify(tags || []);
    const sum = summary ? String(summary) : '';

    if (isMysql(db)) {
        await db.execute(
            `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE tags = VALUES(tags), summary = VALUES(summary), provider = VALUES(provider), model = VALUES(model)`,
            [bookmarkId, tagsJson, sum, provider || '', model || '']
        );
    } else {
        await db.execute(
            `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model, updated_at)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(bookmark_id) DO UPDATE SET
               tags = excluded.tags,
               summary = excluded.summary,
               provider = excluded.provider,
               model = excluded.model,
               updated_at = CURRENT_TIMESTAMP`,
            [bookmarkId, tagsJson, sum, provider || '', model || '']
        );
    }
}

module.exports = {
    ensureAiTables,
    upsertBookmarkAi
};
