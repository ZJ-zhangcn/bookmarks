/**
 * 个性化配置服务
 */

async function getConfig(db) {
    const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
    return row ? JSON.parse(row.value) : null;
}

async function saveConfig(db, configData) {
    const value = JSON.stringify(configData);
    if (db.USE_MYSQL) {
        await db.execute(
            'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
            ['personalization', value]
        );
    } else {
        await db.execute(
            'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
            ['personalization', value]
        );
    }
}

module.exports = { getConfig, saveConfig };
