/**
 * 分类 API - GET /api/categories
 */

const { query } = require('./_lib/db');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const categories = await query('SELECT * FROM categories ORDER BY sort_order, created_at');
            return res.json({ success: true, data: categories });
        }

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

            await query(
                'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                [categoryId, name, icon || '📁', sortOrder]
            );

            return res.json({ success: true, data: { id: categoryId, name, icon: icon || '📁' } });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Categories API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
