/**
 * 书签分组 API - GET /api/bookmarks/grouped
 */

const { query } = require('../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const categories = await query('SELECT * FROM categories ORDER BY sort_order, created_at');
        const bookmarks = await query('SELECT * FROM bookmarks ORDER BY sort_order, created_at');

        const grouped = categories.map(cat => ({
            ...cat,
            items: bookmarks.filter(b => b.category_id === cat.id)
        }));

        res.json({ success: true, data: grouped });
    } catch (e) {
        console.error('Bookmarks grouped error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
