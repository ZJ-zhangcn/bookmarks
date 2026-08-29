/**
 * 书签路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const bookmarksService = require('../../shared/services/bookmarks');

module.exports = function(db, options = {}) {
    const onDataChanged = typeof options.onDataChanged === 'function' ? options.onDataChanged : () => {};
    const onVisitRecorded = typeof options.onVisitRecorded === 'function' ? options.onVisitRecorded : () => {};
    // GET /api/bookmarks
    router.get('/', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons === 'true';
        const bookmarks = await bookmarksService.getAllBookmarks(db, { includeIcons });
        res.json(success(bookmarks));
    }));

    // GET /api/bookmarks/trash
    router.get('/trash', asyncHandler(async (_req, res) => {
        const removed = await bookmarksService.purgeTrash(db, { expiredOnly: true });
        const items = await bookmarksService.listTrash(db);
        res.json(success({ items, removed }));
    }));

    // POST /api/bookmarks/:id/restore
    router.post('/:id/restore', requireAdmin, asyncHandler(async (req, res) => {
        const bookmark = await bookmarksService.restoreBookmark(db, req.params.id);
        if (!bookmark) throw new AppError('回收站中不存在该书签', 404);
        onDataChanged();
        res.json(success(bookmark));
    }));

    // DELETE /api/bookmarks/trash (清空或清理过期记录)
    router.delete('/trash', requireAdmin, asyncHandler(async (req, res) => {
        const removed = await bookmarksService.purgeTrash(db, { expiredOnly: req.query.expired === '1' });
        res.json(success({ removed }));
    }));

    // DELETE /api/bookmarks/trash/:id (永久删除单条)
    router.delete('/trash/:id', requireAdmin, asyncHandler(async (req, res) => {
        const removed = await bookmarksService.deleteTrash(db, req.params.id);
        if (!removed) throw new AppError('回收站中不存在该记录', 404);
        res.json(success({ removed: 1 }));
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

    // POST /api/bookmarks/batch - 批量整理（单事务，最多 500 条）
    router.post('/batch', requireAdmin, asyncHandler(async (req, res) => {
        const { ids, action, payload } = req.body || {};
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new AppError('至少选择一个书签', 400);
        }
        if (ids.length > 500) {
            throw new AppError('一次最多整理 500 个书签', 400);
        }
        const safeIds = ids.map(id => String(id || '').trim());
        if (safeIds.some(id => !id || id.length > 128)) {
            throw new AppError('书签 ID 格式无效', 400);
        }
        const allowedActions = ['move', 'add-tags', 'remove-tags', 'trash', 'refresh-icons'];
        if (!allowedActions.includes(action)) {
            throw new AppError(`批量操作必须是 ${allowedActions.join('、')}`, 400);
        }
        let result;
        try {
            result = await bookmarksService.batchUpdateBookmarks(db, { ids: safeIds, action, payload: payload || {} });
        } catch (error) {
            throw new AppError(error.message, 400);
        }
        if (result.processed > 0) onDataChanged();
        res.json(success(result));
    }));

    // POST /api/bookmarks/:id/visit
    router.post('/:id/visit', asyncHandler(async (req, res) => {
        const { id } = req.params;
        if (!id) throw new AppError('缺少书签 ID', 400);
        const result = await bookmarksService.recordBookmarkVisit(db, id);
        if (result.bookmark) onVisitRecorded(id, result.bookmark);
        res.json(success(result.bookmark));
    }));

    // POST /api/bookmarks (普通创建/更新)
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        // 创建/更新书签
        const { id, category_id, name, url, description, icon, icon_type, icon_data } = req.body;

        if (!name?.trim()) {
            throw new AppError('书签名称不能为空', 400);
        }

        const result = await bookmarksService.saveBookmark(db, { id, category_id, name, url, description, icon, icon_type, icon_data });
        onDataChanged();
        res.json(success(result));
    }));

    // DELETE /api/bookmarks?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少书签 ID', 400);
        }
        const removed = await bookmarksService.deleteBookmark(db, id);
        if (!removed) throw new AppError('书签不存在', 404);
        onDataChanged();
        res.json(success(removed));
    }));

    // PUT /api/bookmarks (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }
        await bookmarksService.sortBookmarks(db, order);
        onDataChanged();
        res.json(success());
    }));

    return router;
};
