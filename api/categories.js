/**
 * 分类 API - 合并所有分类相关操作
 * GET /api/categories - 获取所有分类
 * POST /api/categories - 创建/更新分类
 * DELETE /api/categories?id=xxx - 删除分类
 * PUT /api/categories - 排序
 */

const { query, execute, queryOne, transaction } = require('./_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - 获取所有分类
        if (req.method === 'GET') {
            const categories = await query('SELECT * FROM categories ORDER BY sort_order, created_at');
            return res.json({ success: true, data: categories });
        }

        // POST - 创建/更新分类
        if (req.method === 'POST') {
            const { id, name, icon } = req.body;
            const categoryId = id || `cat_${Date.now()}`;
            const isNewCategory = !id;

            let sortOrder = 0;
            if (isNewCategory) {
                const maxOrder = await query('SELECT MAX(sort_order) as max_order FROM categories');
                sortOrder = (maxOrder[0]?.max_order ?? -1) + 1;
            } else {
                const existing = await query('SELECT sort_order FROM categories WHERE id = ?', [categoryId]);
                sortOrder = existing[0]?.sort_order ?? 0;
            }

            await execute(
                'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                [categoryId, name, icon || '📁', sortOrder]
            );

            return res.json({ success: true, data: { id: categoryId, name, icon: icon || '📁' } });
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
                        'UPDATE categories SET sort_order = ? WHERE id = ?',
                        [item.sort_order, item.id]
                    );
                }
            });
            return res.json({ success: true });
        }

        // DELETE - 删除分类
        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少分类 ID' });
            }
            await execute('DELETE FROM bookmarks WHERE category_id = ?', [id]);
            await execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Categories API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
