/**
 * 搜索引擎 API
 * GET /api/engines - 获取所有搜索引擎
 * POST /api/engines - 创建/更新搜索引擎
 * PUT /api/engines - 排序
 * DELETE /api/engines?id=xxx - 删除搜索引擎
 */

const db = require('./_lib/db');
const { requireAdmin, setCors } = require('./_lib/auth');
const enginesService = require('../shared/services/engines');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const engines = await enginesService.getAllEngines(db);
            return res.json({ success: true, data: engines });
        }

        if (!requireAdmin(req, res)) return;

        if (req.method === 'POST') {
            const { id, name, icon, url, sort_order } = req.body;
            const result = await enginesService.saveEngine(db, { id, name, icon, url, sort_order });
            return res.json({ success: true, data: result });
        }

        if (req.method === 'PUT') {
            const { orders } = req.body;
            await enginesService.sortEngines(db, orders);
            return res.json({ success: true });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少引擎 ID' });
            }
            await enginesService.deleteEngine(db, id);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Engines API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
