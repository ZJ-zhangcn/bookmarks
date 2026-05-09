/**
 * 搜索引擎服务
 */
const { newId } = require('./ids');

function isMysql(db) {
    return db.USE_MYSQL || db.getDatabaseType?.() === 'mysql';
}


async function getAllEngines(db) {
    return db.queryAll('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC');
}

async function saveEngine(db, { id, name, icon, url, sort_order }) {
    const engineId = id || newId('eng');

    let order = sort_order;
    if (order === undefined || order === null) {
        const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max FROM search_engines');
        order = (maxOrder?.max ?? 0) + 1;
    }

    if (isMysql(db)) {
        await db.execute(
            'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
            [engineId, name.trim(), icon || '🔍', url.trim(), order]
        );
    } else {
        await db.execute(
            `INSERT INTO search_engines (id, name, icon, url, sort_order)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               icon = excluded.icon,
               url = excluded.url,
               sort_order = excluded.sort_order`,
            [engineId, name.trim(), icon || '🔍', url.trim(), order]
        );
    }

    return { id: engineId };
}

async function deleteEngine(db, id) {
    await db.execute('DELETE FROM search_engines WHERE id = ?', [id]);
}

async function sortEngines(db, orders) {
    await db.transaction(async (conn) => {
        for (const item of orders) {
            if (item.id && typeof item.sort_order === 'number') {
                await conn.execute('UPDATE search_engines SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
        }
    });
}

module.exports = { getAllEngines, saveEngine, deleteEngine, sortEngines };
