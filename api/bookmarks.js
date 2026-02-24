/**
 * 书签 API
 * GET /api/bookmarks - 获取所有书签
 * GET /api/bookmarks?grouped=true - 获取分组书签
 * POST /api/bookmarks - 创建/更新书签
 * POST /api/bookmarks?action=icons - 批量获取图标
 * PUT /api/bookmarks - 排序
 * DELETE /api/bookmarks?id=xxx - 删除书签
 */

const db = require('./_lib/db');
const { requireAdmin, setCors } = require('./_lib/auth');
const bookmarksService = require('../shared/services/bookmarks');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            if (req.query.grouped === 'true') {
                const grouped = await bookmarksService.getGroupedBookmarks(db);
                return res.json({ success: true, data: grouped });
            }

            const includeIcons = req.query.includeIcons === 'true';
            const bookmarks = await bookmarksService.getAllBookmarks(db, { includeIcons });
            return res.json({ success: true, data: bookmarks });
        }

        if (req.method === 'POST') {
            // 批量获取图标（只读，无需鉴权）
            if (req.query.action === 'icons') {
                const { ids } = req.body;
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.json({ success: true, data: {} });
                }
                const iconMap = await bookmarksService.getBatchIcons(db, ids);
                return res.json({ success: true, data: iconMap });
            }

            // 创建/更新书签（需要鉴权）
            if (!requireAdmin(req, res)) return;

            const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;
            const result = await bookmarksService.saveBookmark(db, { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type });
            return res.json({ success: true, data: result });
        }

        if (req.method === 'PUT') {
            if (!requireAdmin(req, res)) return;
            const { order } = req.body;
            if (!Array.isArray(order)) {
                return res.status(400).json({ success: false, error: '无效的排序数据' });
            }
            await bookmarksService.sortBookmarks(db, order);
            return res.json({ success: true });
        }

        if (req.method === 'DELETE') {
            if (!requireAdmin(req, res)) return;
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少书签 ID' });
            }
            await bookmarksService.deleteBookmark(db, id);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Bookmarks API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
