/**
 * 批量获取书签图标 API - POST /api/bookmarks/icons
 */

const { query } = require('../_lib/db');

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

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({ success: true, data: {} });
    }

    try {
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

        res.json({ success: true, data: iconMap });
    } catch (e) {
        console.error('Bookmarks icons error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
