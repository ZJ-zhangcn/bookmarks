/**
 * 分类操作 API - DELETE /api/categories/[id]
 */

const { query, execute } = require('../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id } = req.query;

    try {
        if (req.method === 'DELETE') {
            await execute('DELETE FROM bookmarks WHERE category_id = ?', [id]);
            await execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Category delete error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
