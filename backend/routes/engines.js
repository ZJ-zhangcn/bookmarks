/**
 * 搜索引擎路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const enginesService = require('../../shared/services/engines');

module.exports = function(db) {
    // GET /api/engines
    router.get('/', asyncHandler(async (req, res) => {
        const engines = await enginesService.getAllEngines(db);
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

        const result = await enginesService.saveEngine(db, { id, name, icon, url, sort_order });
        res.json(success(result));
    }));

    // DELETE /api/engines?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少引擎 ID', 400);
        }
        await enginesService.deleteEngine(db, id);
        res.json(success());
    }));

    // PUT /api/engines (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { orders } = req.body;
        if (!Array.isArray(orders)) {
            throw new AppError('无效的排序数据', 400);
        }
        await enginesService.sortEngines(db, orders);
        res.json(success());
    }));

    // 旧路径兼容: DELETE /api/engines/:id
    router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
        await enginesService.deleteEngine(db, req.params.id);
        res.json(success());
    }));

    // 旧路径兼容: PUT /api/engines/sort
    router.put('/sort', requireAdmin, asyncHandler(async (req, res) => {
        const { orders } = req.body;
        if (!Array.isArray(orders)) {
            throw new AppError('无效的排序数据', 400);
        }
        await enginesService.sortEngines(db, orders);
        res.json(success());
    }));

    return router;
};
