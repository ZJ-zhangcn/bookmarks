/**
 * 数据导入导出 API
 * GET /api/data - 导出数据
 * POST /api/data - 导入数据
 */

const { query, queryOne, transaction } = require('./_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - 导出
        if (req.method === 'GET') {
            const includeIcons = req.query.includeIcons !== 'false';

            const categories = await query('SELECT * FROM categories');
            let bookmarks = await query('SELECT * FROM bookmarks');
            let engines = await query('SELECT * FROM search_engines');

            // 获取个性化设置
            let personalization = null;
            const row = await queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
            if (row) {
                personalization = JSON.parse(row.value);
            }

            // 如果不包含图标，清除 icon_data 字段
            if (!includeIcons) {
                bookmarks = bookmarks.map(b => ({
                    ...b,
                    icon_data: b.icon_type === 'emoji' ? b.icon_data : ''
                }));
                engines = engines.map(e => ({
                    ...e,
                    icon: (e.icon && !e.icon.startsWith('data:') && !e.icon.startsWith('http')) ? e.icon : '🔍'
                }));
            }

            return res.json({
                version: '1.0',
                exportTime: new Date().toISOString(),
                includeIcons,
                categories,
                bookmarks,
                engines,
                personalization
            });
        }

        // POST - 导入
        if (req.method === 'POST') {
            const { categories, bookmarks, engines, personalization } = req.body;

            await transaction(async (connection) => {
                if (categories) {
                    for (let i = 0; i < categories.length; i++) {
                        const c = categories[i];
                        await connection.execute(
                            'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                            [c.id, c.name, c.icon, c.sort_order ?? i]
                        );
                    }
                }

                if (bookmarks) {
                    for (let i = 0; i < bookmarks.length; i++) {
                        const b = bookmarks[i];
                        await connection.execute(
                            `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE
                             category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url),
                             description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type),
                             icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type),
                             sort_order = VALUES(sort_order)`,
                            [
                                b.id, b.category_id, b.name, b.url, b.description || '',
                                b.icon || '🌐', b.icon_type || 'auto', b.icon_data || '',
                                b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i
                            ]
                        );
                    }
                }

                if (engines) {
                    for (let i = 0; i < engines.length; i++) {
                        const e = engines[i];
                        await connection.execute(
                            'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
                            [e.id, e.name, e.icon, e.url, e.sort_order ?? i]
                        );
                    }
                }

                if (personalization) {
                    await connection.execute(
                        'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
                        ['personalization', JSON.stringify(personalization)]
                    );
                }
            });

            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Data API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
