// MySQL优化版Bootstrap端点
module.exports = function registerBootstrapV2(app, db) {
    app.get('/api/bootstrap-v2', async (req, res) => {
        const start = Date.now();
        try {
            const sql = `
                SELECT
                    'category' as row_type, c.id, c.name, c.icon, c.sort_order, c.created_at,
                    NULL as category_id, NULL as url, NULL as description, NULL as icon_type,
                    NULL as icon_data, NULL as item_type, NULL as component_type,
                    NULL as category_name, NULL as category_icon, NULL as tags, NULL as ai_summary
                FROM categories c
                UNION ALL
                SELECT
                    'bookmark' as row_type, b.id, b.name, b.icon, b.sort_order, b.created_at,
                    b.category_id, b.url, b.description, b.icon_type,
                    CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
                    b.item_type, b.component_type,
                    c.name as category_name, c.icon as category_icon,
                    ba.tags, ba.summary as ai_summary
                FROM bookmarks b
                LEFT JOIN categories c ON b.category_id = c.id
                LEFT JOIN bookmark_ai ba ON b.id = ba.bookmark_id
                UNION ALL
                SELECT
                    'engine' as row_type, e.id, e.name, e.icon, e.sort_order, e.created_at,
                    NULL, e.url, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
                FROM search_engines e
                ORDER BY row_type, sort_order, created_at
            `;

            const [rows, configRow] = await Promise.all([
                db.queryAll(sql),
                db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization'])
            ]);

            console.log(`[Bootstrap-v2] Query: ${Date.now() - start}ms (${rows.length} rows)`);

            const categories = [];
            const bookmarks = [];
            const engines = [];

            rows.forEach(row => {
                if (row.row_type === 'category') {
                    categories.push({
                        id: row.id,
                        name: row.name,
                        icon: row.icon,
                        sort_order: row.sort_order,
                        created_at: row.created_at
                    });
                } else if (row.row_type === 'bookmark') {
                    let tags = [];
                    if (row.tags) {
                        try { tags = JSON.parse(row.tags); } catch {}
                    }
                    bookmarks.push({
                        id: row.id,
                        category_id: row.category_id,
                        name: row.name,
                        url: row.url,
                        description: row.description,
                        icon: row.icon,
                        icon_type: row.icon_type,
                        icon_data: row.icon_data,
                        item_type: row.item_type,
                        component_type: row.component_type,
                        sort_order: row.sort_order,
                        created_at: row.created_at,
                        category_name: row.category_name,
                        category_icon: row.category_icon,
                        tags: Array.isArray(tags) ? tags : [],
                        ai_summary: row.ai_summary || ''
                    });
                } else if (row.row_type === 'engine') {
                    engines.push({
                        id: row.id,
                        name: row.name,
                        icon: row.icon,
                        url: row.url,
                        sort_order: row.sort_order,
                        created_at: row.created_at
                    });
                }
            });

            let config = null;
            if (configRow && configRow.value) {
                try { config = JSON.parse(configRow.value); } catch { config = null; }
            }

            res.json({
                success: true,
                data: { categories, bookmarks, engines, config }
            });
            console.log(`[Bootstrap-v2] Total: ${Date.now() - start}ms`);
        } catch (e) {
            console.error(`[Bootstrap-v2] Error:`, e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
};
