/**
 * 个性化配置服务
 */

function isMysql(db) {
    return db.USE_MYSQL || db.getDatabaseType?.() === 'mysql';
}

async function getConfig(db) {
    const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
    return row ? JSON.parse(row.value) : null;
}

async function saveConfig(db, configData) {
    const value = JSON.stringify(configData);
    if (isMysql(db)) {
        await db.execute(
            'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
            ['personalization', value]
        );
    } else {
        await db.execute(
            `INSERT INTO config (key, value) VALUES (?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            ['personalization', value]
        );
    }
}

module.exports = { getConfig, saveConfig };
