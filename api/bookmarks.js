/**
 * 书签 API - 合并所有书签相关操作
 * GET /api/bookmarks - 获取所有书签
 * GET /api/bookmarks?grouped=true - 获取分组书签
 * POST /api/bookmarks - 创建/更新书签
 * POST /api/bookmarks?action=icons - 批量获取图标
 * PUT /api/bookmarks - 排序
 * DELETE /api/bookmarks?id=xxx - 删除书签
 */

const { query, execute, queryOne, transaction } = require('./_lib/db');

async function ensureAiTables() {
    await execute(`
        CREATE TABLE IF NOT EXISTS bookmark_ai (
            bookmark_id VARCHAR(50) PRIMARY KEY,
            tags LONGTEXT,
            summary TEXT,
            provider VARCHAR(50),
            model VARCHAR(100),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);
}

async function attachBookmarkAi(bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return;
    const ids = bookmarks.map(b => b.id).filter(Boolean);
    if (ids.length === 0) return;

    await ensureAiTables();
    const placeholders = ids.map(() => '?').join(',');
    const rows = await query(
        `SELECT bookmark_id, tags, summary FROM bookmark_ai WHERE bookmark_id IN (${placeholders})`,
        ids
    );

    const aiMap = new Map();
    rows.forEach(row => {
        let tags = [];
        try { tags = JSON.parse(row.tags || '[]'); } catch {}
        aiMap.set(row.bookmark_id, {
            tags: Array.isArray(tags) ? tags : [],
            summary: row.summary || ''
        });
    });

    bookmarks.forEach(b => {
        const ai = aiMap.get(b.id);
        b.tags = ai ? ai.tags : [];
        b.ai_summary = ai ? ai.summary : '';
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - 获取书签
        if (req.method === 'GET') {
            // 分组获取
            if (req.query.grouped === 'true') {
                const categories = await query('SELECT * FROM categories ORDER BY sort_order, created_at');
                const bookmarks = await query('SELECT * FROM bookmarks ORDER BY sort_order, created_at');
                try {
                    await attachBookmarkAi(bookmarks);
                } catch {}

                const grouped = categories.map(cat => ({
                    ...cat,
                    items: bookmarks.filter(b => b.category_id === cat.id)
                }));

                return res.json({ success: true, data: grouped });
            }

            // 普通获取
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
            try {
                await attachBookmarkAi(bookmarks);
            } catch {}
            return res.json({ success: true, data: bookmarks });
        }

        // POST - 创建/更新书签 或 批量获取图标
        if (req.method === 'POST') {
            // 批量获取图标
            if (req.query.action === 'icons') {
                const { ids } = req.body;
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.json({ success: true, data: {} });
                }

                const placeholders = ids.map(() => '?').join(',');
                const bookmarks = await query(
                    `SELECT id, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders})`,
                    ids
                );

                const iconMap = {};
                bookmarks.forEach(b => {
                    if (b.icon_data) {
                        iconMap[b.id] = { icon_data: b.icon_data, icon_type: b.icon_type };
                    }
                });

                return res.json({ success: true, data: iconMap });
            }

            // 创建/更新书签
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

        // PUT - 排序
        if (req.method === 'PUT') {
            const { order } = req.body;
            if (!Array.isArray(order)) {
                return res.status(400).json({ success: false, error: '无效的排序数据' });
            }

            await transaction(async (connection) => {
                for (const item of order) {
                    await connection.execute(
                        'UPDATE bookmarks SET sort_order = ? WHERE id = ?',
                        [item.sort_order, item.id]
                    );
                }
            });
            return res.json({ success: true });
        }

        // DELETE - 删除书签
        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少书签 ID' });
            }
            await execute('DELETE FROM bookmarks WHERE id = ?', [id]);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Bookmarks API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
