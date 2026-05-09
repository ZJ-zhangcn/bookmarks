/**
 * 书签路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const bookmarksService = require('../../shared/services/bookmarks');

module.exports = function(db) {
    // GET /api/bookmarks
    router.get('/', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons === 'true';
        const bookmarks = await bookmarksService.getAllBookmarks(db, { includeIcons });
        res.json(success(bookmarks));
    }));

    // GET /api/bookmarks/:id/icon
    router.get('/:id/icon', asyncHandler(async (req, res) => {
        const bookmark = await bookmarksService.getBookmarkIcon(db, req.params.id);
        if (!bookmark) {
            throw new AppError('书签不存在', 404);
        }
        res.json(success(bookmark));
    }));

    // GET /api/bookmarks/grouped
    router.get('/grouped', asyncHandler(async (req, res) => {
        const grouped = await bookmarksService.getGroupedBookmarks(db);
        res.json(success(grouped));
    }));

    // POST /api/bookmarks/icons - 批量读取图标（读接口，不要求写权限）
    router.post('/icons', asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.json(success({}));
        }
        if (ids.length > 100) {
            throw new AppError('一次最多读取 100 个图标', 400);
        }
        const safeIds = ids
            .map(id => String(id || '').trim())
            .filter(id => id && id.length <= 128);
        if (safeIds.length === 0) {
            return res.json(success({}));
        }
        const iconMap = await bookmarksService.getBatchIcons(db, [...new Set(safeIds)]);
        return res.json(success(iconMap));
    }));

    // POST /api/bookmarks (普通创建/更新)
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        // 创建/更新书签
        const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;

        if (!name?.trim()) {
            throw new AppError('书签名称不能为空', 400);
        }

        const safeComponentType = String(component_type || '').slice(0, 50);
        const result = await bookmarksService.saveBookmark(db, { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type: safeComponentType });
        res.json(success(result));
    }));

    // DELETE /api/bookmarks?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少书签 ID', 400);
        }
        await bookmarksService.deleteBookmark(db, id);
        res.json(success());
    }));

    // PUT /api/bookmarks (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }
        await bookmarksService.sortBookmarks(db, order);
        res.json(success());
    }));

    return router;
};
