/**
 * 图标库 API
 * GET /api/icons - 获取图标库
 * POST /api/icons - 上传图标
 * POST /api/icons?action=batch-delete - 批量删除
 * POST /api/icons?action=from-url - 从 URL 上传
 * POST /api/icons?action=clear-from-bookmarks - 清除书签图标
 * DELETE /api/icons?id=xxx - 删除图标
 */

const db = require('./_lib/db');
const { requireAdmin, setCors, assertSafeFetchUrl } = require('./_lib/auth');
const iconsService = require('../shared/services/icons');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const icons = await iconsService.getAllIcons(db);
            return res.json({ success: true, data: icons });
        }

        if (!requireAdmin(req, res)) return;

        if (req.method === 'POST') {
            const action = req.query.action;

            if (action === 'batch-delete') {
                const { ids } = req.body;
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.json({ success: true });
                }
                await iconsService.batchDeleteIcons(db, ids);
                return res.json({ success: true });
            }

            if (action === 'from-url') {
                const { url, name } = req.body;
                if (!url) {
                    return res.status(400).json({ success: false, error: '缺少 URL' });
                }
                const result = await iconsService.uploadIconFromUrl(db, { url, name }, assertSafeFetchUrl);
                return res.json({ success: true, data: result });
            }

            if (action === 'clear-from-bookmarks') {
                const { iconData } = req.body;
                if (!iconData) {
                    return res.status(400).json({ success: false, error: '缺少图标数据' });
                }
                await iconsService.clearIconFromBookmarks(db, iconData);
                return res.json({ success: true });
            }

            if (action === 'batch-clear-from-bookmarks') {
                const { iconDataList } = req.body;
                if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
                    return res.json({ success: true });
                }
                await iconsService.batchClearIconsFromBookmarks(db, iconDataList);
                return res.json({ success: true });
            }

            // 普通上传
            const { name, data, type } = req.body;
            if (!data) {
                return res.status(400).json({ success: false, error: '缺少图标数据' });
            }
            const result = await iconsService.uploadIcon(db, { name, data, type });
            return res.json({ success: true, data: result });
        }

        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少图标 ID' });
            }
            await iconsService.deleteIcon(db, id);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Icons API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
