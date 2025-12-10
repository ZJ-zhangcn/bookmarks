/**
 * 导入 API - POST /api/import
 */

const { transaction, execute } = require('./_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { categories, bookmarks, engines, personalization } = req.body;

    try {
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

        res.json({ success: true });
    } catch (e) {
        console.error('Import API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
