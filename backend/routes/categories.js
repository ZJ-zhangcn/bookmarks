/**
 * 分类路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const categoriesService = require('../../shared/services/categories');

module.exports = function(db) {
    // GET /api/categories
    router.get('/', asyncHandler(async (req, res) => {
        const categories = await categoriesService.getAllCategories(db, req.query.type);
        res.json(success(categories));
    }));

    // POST /api/categories
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id, name, icon, type } = req.body;

        if (!name?.trim()) {
            throw new AppError('分类名称不能为空', 400);
        }

        const result = await categoriesService.saveCategory(db, { id, name, icon, type });
        res.json(success(result));
    }));

    // DELETE /api/categories?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少分类 ID', 400);
        }
        await categoriesService.deleteCategory(db, id);
        res.json(success());
    }));

    // PUT /api/categories (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }
        await categoriesService.sortCategories(db, order);
        res.json(success());
    }));

    return router;
};
