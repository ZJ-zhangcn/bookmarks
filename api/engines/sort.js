/**
 * 搜索引擎排序 API - PUT /api/engines/sort
 */

const { transaction } = require('../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'PUT') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { orders } = req.body;

    try {
        await transaction(async (connection) => {
            for (const item of orders) {
                await connection.execute(
                    'UPDATE search_engines SET sort_order = ? WHERE id = ?',
                    [item.sort_order, item.id]
                );
            }
        });
        res.json({ success: true });
    } catch (e) {
        console.error('Engine sort error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
