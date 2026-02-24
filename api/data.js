/**
 * 数据导入导出 API
 * GET /api/data - 导出数据
 * POST /api/data - 导入数据
 */

const db = require('./_lib/db');
const { requireAdmin, setCors } = require('./_lib/auth');
const dataService = require('../shared/services/data');

async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const includeIcons = req.query.includeIcons !== 'false';
            const data = await dataService.exportData(db, includeIcons);
            return res.json(data);
        }

        if (req.method === 'POST') {
            if (!requireAdmin(req, res)) return;
            await dataService.importData(db, req.body);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Data API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
}

module.exports = handler;
