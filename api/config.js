/**
 * 配置 API
 * GET /api/config - 获取个性化配置
 * POST /api/config - 保存个性化配置
 */

const { execute, queryOne } = require('./_lib/db');
const { requireAdmin, setCors } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    setCors(res, req);

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
            if (!requireAdmin(req, res)) return;

            const value = JSON.stringify(req.body);
            await execute(
                'INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
                ['personalization', value]
            );
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Config API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
