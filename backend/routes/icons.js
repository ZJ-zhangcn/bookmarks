/**
 * 图标库路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, assertSafeFetchUrl } = require('../middleware/security');
const iconsService = require('../../shared/services/icons');

module.exports = function(db) {
    // GET /api/icons
    router.get('/', asyncHandler(async (req, res) => {
        const icons = await iconsService.getAllIcons(db);
        res.json(success(icons));
    }));

    // POST /api/icons (支持多种 action)
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const action = req.query.action;

        if (action === 'batch-delete') {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.json(success());
            }
            await iconsService.batchDeleteIcons(db, ids);
            return res.json(success());
        }

        if (action === 'from-url') {
            const { url, name } = req.body;
            if (!url) {
                throw new AppError('缺少 URL', 400);
            }
            const result = await iconsService.uploadIconFromUrl(db, { url, name }, assertSafeFetchUrl);
            return res.json(success(result));
        }

        if (action === 'clear-from-bookmarks') {
            const { iconData } = req.body;
            if (!iconData) {
                throw new AppError('缺少图标数据', 400);
            }
            await iconsService.clearIconFromBookmarks(db, iconData);
            return res.json(success());
        }

        if (action === 'batch-clear-from-bookmarks') {
            const { iconDataList } = req.body;
            if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
                return res.json(success());
            }
            await iconsService.batchClearIconsFromBookmarks(db, iconDataList);
            return res.json(success());
        }

        const { name, data, type } = req.body;
        if (!data) {
            throw new AppError('缺少图标数据', 400);
        }
        const result = await iconsService.uploadIcon(db, { name, data, type });
        res.json(success(result));
    }));

    // DELETE /api/icons?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少图标 ID', 400);
        }
        await iconsService.deleteIcon(db, id);
        res.json(success());
    }));

    return router;
};
