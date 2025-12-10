/**
 * 搜索引擎 API - 合并所有搜索引擎相关操作
 * GET /api/engines - 获取所有搜索引擎
 * POST /api/engines - 创建/更新搜索引擎
 * PUT /api/engines - 排序
 * DELETE /api/engines?id=xxx - 删除搜索引擎
 */

const { query, execute, queryOne, transaction } = require('./_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - 获取所有搜索引擎
        if (req.method === 'GET') {
            const engines = await query('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC');
            return res.json({ success: true, data: engines });
        }

        // POST - 创建/更新搜索引擎
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

        // PUT - 排序
        if (req.method === 'PUT') {
            const { orders } = req.body;

            await transaction(async (connection) => {
                for (const item of orders) {
                    await connection.execute(
                        'UPDATE search_engines SET sort_order = ? WHERE id = ?',
                        [item.sort_order, item.id]
                    );
                }
            });
            return res.json({ success: true });
        }

        // DELETE - 删除搜索引擎
        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少引擎 ID' });
            }
            await execute('DELETE FROM search_engines WHERE id = ?', [id]);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Engines API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
