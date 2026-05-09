/**
 * 数据导入导出服务
 */

function isMysql(db) {
    return db.USE_MYSQL || db.getDatabaseType?.() === 'mysql';
}

async function exportData(db, includeIcons) {
    const categories = await db.queryAll('SELECT * FROM categories');
    let bookmarks = await db.queryAll('SELECT * FROM bookmarks');
    let engines = await db.queryAll('SELECT * FROM search_engines');
    let bookmarkAi = [];
    try {
        bookmarkAi = await db.queryAll('SELECT bookmark_id, tags, summary, provider, model, updated_at FROM bookmark_ai');
    } catch {
        bookmarkAi = [];
    }

    const todos = await db.queryAll('SELECT id, title, is_done, sort_order, created_at, updated_at, completed_at FROM todos');

    let personalization = null;
    const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
    if (row) {
        personalization = JSON.parse(row.value);
    }

    if (!includeIcons) {
        bookmarks = bookmarks.map(b => ({
            ...b,
            icon_data: b.icon_type === 'emoji' ? b.icon_data : ''
        }));
        engines = engines.map(e => ({
            ...e,
            icon: (e.icon && !e.icon.startsWith('data:') && !e.icon.startsWith('http')) ? e.icon : ''
        }));
    }

    return {
        version: '1.1',
        exportTime: new Date().toISOString(),
        includeIcons,
        categories,
        bookmarks,
        bookmark_ai: bookmarkAi,
        todos,
        engines,
        personalization
    };
}

async function importData(db, data) {
    const { categories, bookmarks, bookmark_ai: bookmarkAi, todos, engines, personalization } = data;

    await db.transaction(async (conn) => {
        if (categories) {
            for (let i = 0; i < categories.length; i++) {
                const c = categories[i];
                if (isMysql(db)) {
                    await conn.execute(
                        'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                        [c.id, c.name, c.icon, c.sort_order ?? i]
                    );
                } else {
                    await conn.execute(
                        `INSERT INTO categories (id, name, icon, sort_order)
                         VALUES (?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                           name = excluded.name,
                           icon = excluded.icon,
                           sort_order = excluded.sort_order`,
                        [c.id, c.name, c.icon, c.sort_order ?? i]
                    );
                }
            }
        }

        if (bookmarks) {
            for (let i = 0; i < bookmarks.length; i++) {
                const b = bookmarks[i];
                if (isMysql(db)) {
                    await conn.execute(
                        `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url),
                         description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type),
                         icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type), sort_order = VALUES(sort_order)`,
                        [b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i]
                    );
                } else {
                    await conn.execute(
                        `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                           category_id = excluded.category_id,
                           name = excluded.name,
                           url = excluded.url,
                           description = excluded.description,
                           icon = excluded.icon,
                           icon_type = excluded.icon_type,
                           icon_data = excluded.icon_data,
                           item_type = excluded.item_type,
                           component_type = excluded.component_type,
                           sort_order = excluded.sort_order`,
                        [b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i]
                    );
                }
            }
        }

        if (bookmarkAi) {
            for (const ai of bookmarkAi) {
                if (!ai || !ai.bookmark_id) continue;
                const tags = Array.isArray(ai.tags) ? JSON.stringify(ai.tags) : (ai.tags || '[]');
                const summary = ai.summary || '';
                const provider = ai.provider || '';
                const model = ai.model || '';
                if (isMysql(db)) {
                    await conn.execute(
                        `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE tags = VALUES(tags), summary = VALUES(summary),
                         provider = VALUES(provider), model = VALUES(model), updated_at = CURRENT_TIMESTAMP`,
                        [ai.bookmark_id, tags, summary, provider, model]
                    );
                } else {
                    await conn.execute(
                        `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model)
                         VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(bookmark_id) DO UPDATE SET
                           tags = excluded.tags,
                           summary = excluded.summary,
                           provider = excluded.provider,
                           model = excluded.model,
                           updated_at = CURRENT_TIMESTAMP`,
                        [ai.bookmark_id, tags, summary, provider, model]
                    );
                }
            }
        }

        if (todos) {
            for (let i = 0; i < todos.length; i++) {
                const t = todos[i] || {};
                const isDone = (t.is_done === true || t.is_done === 1 || t.is_done === '1') ? 1 : 0;
                const params = [
                    t.id,
                    t.title || '',
                    isDone,
                    Number.isFinite(t.sort_order) ? t.sort_order : (parseInt(t.sort_order, 10) || i),
                    (t.completed_at === '' || t.completed_at == null) ? null : t.completed_at
                ];

                if (isMysql(db)) {
                    await conn.execute(
                        `INSERT INTO todos (id, title, is_done, sort_order, completed_at)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE title = VALUES(title),
                         is_done = VALUES(is_done), sort_order = VALUES(sort_order),
                         completed_at = VALUES(completed_at)`,
                        params
                    );
                } else {
                    await conn.execute(
                        `INSERT INTO todos (id, title, is_done, sort_order, completed_at)
                         VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                           title = excluded.title,
                           is_done = excluded.is_done,
                           sort_order = excluded.sort_order,
                           completed_at = excluded.completed_at,
                           updated_at = CURRENT_TIMESTAMP`,
                        params
                    );
                }
            }
        }

        if (engines) {
            for (let i = 0; i < engines.length; i++) {
                const e = engines[i];
                if (isMysql(db)) {
                    await conn.execute(
                        'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
                        [e.id, e.name, e.icon, e.url, e.sort_order ?? i]
                    );
                } else {
                    await conn.execute(
                        `INSERT INTO search_engines (id, name, icon, url, sort_order)
                         VALUES (?, ?, ?, ?, ?)
                         ON CONFLICT(id) DO UPDATE SET
                           name = excluded.name,
                           icon = excluded.icon,
                           url = excluded.url,
                           sort_order = excluded.sort_order`,
                        [e.id, e.name, e.icon, e.url, e.sort_order ?? i]
                    );
                }
            }
        }

        if (personalization) {
            if (isMysql(db)) {
                await conn.execute(
                    'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
                    ['personalization', JSON.stringify(personalization)]
                );
            } else {
                await conn.execute(
                    `INSERT INTO config (key, value) VALUES (?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                    ['personalization', JSON.stringify(personalization)]
                );
            }
        }
    });
}

module.exports = { exportData, importData };
