/**
 * 导出 API - GET /api/export
 */

const { query, queryOne } = require('./_lib/db');

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

        res.json({
            version: '1.0',
            exportTime: new Date().toISOString(),
            includeIcons,
            categories,
            bookmarks,
            engines,
            personalization
        });
    } catch (e) {
        console.error('Export API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
