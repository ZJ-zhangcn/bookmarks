/**
 * 分类排序 API - POST /api/categories/sort
 */

const { transaction } = require('../_lib/db');

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

    const { order } = req.body;
    if (!Array.isArray(order)) {
        return res.status(400).json({ success: false, error: '无效的排序数据' });
    }

    try {
        await transaction(async (connection) => {
            for (const item of order) {
                await connection.execute(
                    'UPDATE categories SET sort_order = ? WHERE id = ?',
                    [item.sort_order, item.id]
                );
            }
        });
        res.json({ success: true });
    } catch (e) {
        console.error('Category sort error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
