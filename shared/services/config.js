/**
 * 个性化配置服务
 */

async function getConfig(db) {
    const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
    return row ? JSON.parse(row.value) : null;
}

async function saveConfig(db, configData) {
    const value = JSON.stringify(configData);
    await db.execute(
        `INSERT INTO config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        ['personalization', value]
    );
}

module.exports = { getConfig, saveConfig };
