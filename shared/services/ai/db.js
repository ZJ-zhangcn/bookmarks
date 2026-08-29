/**
 * AI 数据库操作模块
 */

async function ensureAiTables(db) {
    const createSql = `CREATE TABLE IF NOT EXISTS bookmark_ai (
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

module.exports = {
    ensureAiTables,
    upsertBookmarkAi
};
