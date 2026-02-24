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

    // POST /api/bookmarks (支持 action=icons 和普通创建)
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const action = req.query.action;

        // 批量获取图标
        if (action === 'icons') {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.json(success({}));
            }
            const iconMap = await bookmarksService.getBatchIcons(db, ids);
            return res.json(success(iconMap));
        }

        // 创建/更新书签
        const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;

        if (!name?.trim()) {
            throw new AppError('书签名称不能为空', 400);
        }

        const result = await bookmarksService.saveBookmark(db, { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type });
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

    // 旧路径兼容: DELETE /api/bookmarks/:id
    router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
        await bookmarksService.deleteBookmark(db, req.params.id);
        res.json(success());
    }));

    // 旧路径兼容: POST /api/bookmarks/icons
    router.post('/icons', asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.json(success({}));
        }
        const iconMap = await bookmarksService.getBatchIcons(db, ids);
        res.json(success(iconMap));
    }));

    // 旧路径兼容: POST /api/bookmarks/sort
    router.post('/sort', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }
        await bookmarksService.sortBookmarks(db, order);
        res.json(success());
    }));

    return router;
};
