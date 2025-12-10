/**
 * 书签 API - GET/POST /api/bookmarks
 */

const { query, execute, queryOne } = require('./_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const includeIcons = req.query.includeIcons === 'true';

            let sql;
            if (includeIcons) {
                sql = `
                    SELECT b.*, c.name as category_name, c.icon as category_icon
                    FROM bookmarks b
                    LEFT JOIN categories c ON b.category_id = c.id
                    ORDER BY c.sort_order, b.sort_order, b.created_at
                `;
            } else {
                sql = `
                    SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                           CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
                           b.item_type, b.component_type, b.sort_order, b.created_at,
                           c.name as category_name, c.icon as category_icon
                    FROM bookmarks b
                    LEFT JOIN categories c ON b.category_id = c.id
                    ORDER BY c.sort_order, b.sort_order, b.created_at
                `;
            }

            const bookmarks = await query(sql);
            return res.json({ success: true, data: bookmarks });
        }

        if (req.method === 'POST') {
            const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;
            const bookmarkId = id || `bm_${Date.now()}`;
            const isNewBookmark = !id;

            // 检查分类是否存在
            let finalCategoryId = category_id;
            const existingCat = await queryOne('SELECT id FROM categories WHERE id = ?', [category_id]);
            if (!existingCat) {
                const newCatId = `cat_${Date.now()}`;
                const maxCatOrder = await queryOne('SELECT MAX(sort_order) as max_order FROM categories');
                const catSortOrder = (maxCatOrder?.max_order ?? -1) + 1;
                await execute(
                    'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
                    [newCatId, category_id, '📁', catSortOrder]
                );
                finalCategoryId = newCatId;
            }

            let sortOrder = 0;
            if (isNewBookmark) {
                const maxOrder = await queryOne(
                    'SELECT MAX(sort_order) as max_order FROM bookmarks WHERE category_id = ?',
                    [finalCategoryId]
                );
                sortOrder = (maxOrder?.max_order ?? -1) + 1;
            } else {
                const existing = await queryOne('SELECT sort_order FROM bookmarks WHERE id = ?', [bookmarkId]);
                sortOrder = existing?.sort_order ?? 0;
            }

            await execute(
                `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url),
                 description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type),
                 icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type),
                 sort_order = VALUES(sort_order)`,
                [
                    bookmarkId,
                    finalCategoryId,
                    name,
                    url || '',
                    description || '',
                    icon || '🌐',
                    icon_type || 'auto',
                    icon_data || '',
                    item_type || 'bookmark',
                    component_type || null,
                    sortOrder
                ]
            );

            return res.json({ success: true, data: { id: bookmarkId } });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Bookmarks API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
