/**
 * 搜索引擎路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');

module.exports = function(db) {
    // GET /api/engines
    router.get('/', asyncHandler(async (req, res) => {
        const engines = await db.queryAll('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC');
        res.json(success(engines));
    }));

    // POST /api/engines
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id, name, icon, url, sort_order } = req.body;

        if (!name?.trim()) {
            throw new AppError('搜索引擎名称不能为空', 400);
        }
        if (!url?.trim()) {
            throw new AppError('搜索 URL 不能为空', 400);
        }

        const engineId = id || `eng_${Date.now()}`;
        let order = sort_order;
        if (order === undefined || order === null) {
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max FROM search_engines');
            order = (maxOrder?.max ?? 0) + 1;
        }

        if (db.USE_MYSQL) {
            await db.execute(
                'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
                [engineId, name.trim(), icon || '🔍', url.trim(), order]
            );
        } else {
            await db.execute(
                'INSERT OR REPLACE INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)',
                [engineId, name.trim(), icon || '🔍', url.trim(), order]
            );
        }
        res.json(success({ id: engineId }));
    }));

    // DELETE /api/engines?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少引擎 ID', 400);
        }
        await db.execute('DELETE FROM search_engines WHERE id = ?', [id]);
        res.json(success());
    }));

    // PUT /api/engines (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { orders } = req.body;
        if (!Array.isArray(orders)) {
            throw new AppError('无效的排序数据', 400);
        }

        await db.transaction(async (conn) => {
            for (const item of orders) {
                if (item.id && typeof item.sort_order === 'number') {
                    await conn.execute('UPDATE search_engines SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
                }
            }
        });
        res.json(success());
    }));

    // 旧路径兼容: DELETE /api/engines/:id
    router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
        await db.execute('DELETE FROM search_engines WHERE id = ?', [req.params.id]);
        res.json(success());
    }));

    // 旧路径兼容: PUT /api/engines/sort
    router.put('/sort', requireAdmin, asyncHandler(async (req, res) => {
        const { orders } = req.body;
        if (!Array.isArray(orders)) {
            throw new AppError('无效的排序数据', 400);
        }

        await db.transaction(async (conn) => {
            for (const item of orders) {
                if (item.id && typeof item.sort_order === 'number') {
                    await conn.execute('UPDATE search_engines SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
                }
            }
        });
        res.json(success());
    }));

    return router;
};
