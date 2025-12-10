/**
 * 搜索引擎 API - GET/POST /api/engines
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
            const engines = await query('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC');
            return res.json({ success: true, data: engines });
        }

        if (req.method === 'POST') {
            const { id, name, icon, url, sort_order } = req.body;
            const engineId = id || `eng_${Date.now()}`;

            let order = sort_order;
            if (order === undefined || order === null) {
                const maxOrder = await queryOne('SELECT MAX(sort_order) as max FROM search_engines');
                order = (maxOrder?.max ?? 0) + 1;
            }

            await execute(
                `INSERT INTO search_engines (id, name, icon, url, sort_order)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)`,
                [engineId, name, icon || '🔍', url, order]
            );

            return res.json({ success: true, data: { id: engineId } });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Engines API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
