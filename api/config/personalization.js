/**
 * 个性化配置 API - GET/POST /api/config/personalization
 */

const { query, execute, queryOne } = require('../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const row = await queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
            if (row) {
                return res.json({ success: true, data: JSON.parse(row.value) });
            } else {
                return res.json({ success: true, data: null });
            }
        }

        if (req.method === 'POST') {
            const value = JSON.stringify(req.body);
            await execute(
                'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
                ['personalization', value]
            );
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Personalization API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
