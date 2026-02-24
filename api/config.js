/**
 * 配置 API
 * GET /api/config - 获取个性化配置
 * POST /api/config - 保存个性化配置
 */

const db = require('./_lib/db');
const { requireAdmin, setCors } = require('./_lib/auth');
const configService = require('../shared/services/config');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const data = await configService.getConfig(db);
            return res.json({ success: true, data });
        }

        if (req.method === 'POST') {
            if (!requireAdmin(req, res)) return;
            await configService.saveConfig(db, req.body);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Config API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
