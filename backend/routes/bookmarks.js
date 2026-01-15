/**
 * 书签路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');

module.exports = function(db) {
    // GET /api/bookmarks
    router.get('/', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons === 'true';

        const sql = includeIcons
            ? `SELECT b.*, c.name as category_name, c.icon as category_icon
               FROM bookmarks b LEFT JOIN categories c ON b.category_id = c.id
               ORDER BY c.sort_order, b.sort_order, b.created_at`
            : `SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                      CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
                      b.item_type, b.component_type, b.sort_order, b.created_at,
                      c.name as category_name, c.icon as category_icon
               FROM bookmarks b LEFT JOIN categories c ON b.category_id = c.id
               ORDER BY c.sort_order, b.sort_order, b.created_at`;

        const bookmarks = await db.queryAll(sql);

        // 获取 AI 标签信息
        try {
            const ids = bookmarks.map(b => b.id).filter(Boolean);
            if (ids.length > 0) {
                const placeholders = ids.map(() => '?').join(',');
                const rows = await db.queryAll(
                    `SELECT bookmark_id, tags, summary FROM bookmark_ai WHERE bookmark_id IN (${placeholders})`,
                    ids
                );

                const aiMap = new Map(rows.map(row => {
                    let tags = [];
                    try { tags = JSON.parse(row.tags || '[]'); } catch {}
                    return [row.bookmark_id, { tags: Array.isArray(tags) ? tags : [], summary: row.summary || '' }];
                }));

                bookmarks.forEach(b => {
                    const ai = aiMap.get(b.id);
                    b.tags = ai?.tags || [];
                    b.ai_summary = ai?.summary || '';
                });
            }
        } catch {
            bookmarks.forEach(b => {
                b.tags = b.tags || [];
                b.ai_summary = b.ai_summary || '';
            });
        }

        res.json(success(bookmarks));
    }));

    // GET /api/bookmarks/:id/icon
    router.get('/:id/icon', asyncHandler(async (req, res) => {
        const bookmark = await db.queryOne('SELECT icon_data, icon_type FROM bookmarks WHERE id = ?', [req.params.id]);
        if (!bookmark) {
            throw new AppError('书签不存在', 404);
        }
        res.json(success(bookmark));
    }));

    // GET /api/bookmarks/grouped
    router.get('/grouped', asyncHandler(async (req, res) => {
        const categories = await db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at');
        const bookmarks = await db.queryAll('SELECT * FROM bookmarks ORDER BY sort_order, created_at');

        const grouped = categories.map(cat => ({
            ...cat,
            items: bookmarks.filter(b => b.category_id === cat.id)
        }));

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

            const placeholders = ids.map(() => '?').join(',');
            const bookmarks = await db.queryAll(`SELECT id, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders})`, ids);
            const iconMap = Object.fromEntries(
                bookmarks.filter(b => b.icon_data).map(b => [b.id, { icon_data: b.icon_data, icon_type: b.icon_type }])
            );
            return res.json(success(iconMap));
        }

        // 创建/更新书签
        const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;

        if (!name?.trim()) {
            throw new AppError('书签名称不能为空', 400);
        }

        const bookmarkId = id || `bm_${Date.now()}`;
        const isNewBookmark = !id;

        let finalCategoryId = category_id;
        const existingCat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [category_id]);
        if (!existingCat) {
            const newCatId = `cat_${Date.now()}`;
            const maxCatOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories');
            const catSortOrder = (maxCatOrder?.max_order ?? -1) + 1;
            await db.execute('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', [newCatId, category_id, '📁', catSortOrder]);
            finalCategoryId = newCatId;
        }

        let sortOrder = 0;
        if (isNewBookmark) {
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM bookmarks WHERE category_id = ?', [finalCategoryId]);
            sortOrder = (maxOrder?.max_order ?? -1) + 1;
        } else {
            const existing = await db.queryOne('SELECT sort_order FROM bookmarks WHERE id = ?', [bookmarkId]);
            sortOrder = existing?.sort_order ?? 0;
        }

        const params = [bookmarkId, finalCategoryId, name.trim(), url || '', description || '', icon || '🌐', icon_type || 'auto', icon_data || '', item_type || 'bookmark', component_type || null, sortOrder];

        if (db.USE_MYSQL) {
            await db.execute(
                `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url), description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type), icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type), sort_order = VALUES(sort_order)`,
                params
            );
        } else {
            await db.execute(
                `INSERT OR REPLACE INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                params
            );
        }

        res.json(success({ id: bookmarkId }));
    }));

    // DELETE /api/bookmarks?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少书签 ID', 400);
        }
        await db.execute('DELETE FROM bookmarks WHERE id = ?', [id]);
        res.json(success());
    }));

    // PUT /api/bookmarks (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }

        await db.transaction(async (conn) => {
            for (const item of order) {
                if (item.id && typeof item.sort_order === 'number') {
                    await conn.execute('UPDATE bookmarks SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
                }
            }
        });
        res.json(success());
    }));

    // 旧路径兼容: DELETE /api/bookmarks/:id
    router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
        await db.execute('DELETE FROM bookmarks WHERE id = ?', [req.params.id]);
        res.json(success());
    }));

    // 旧路径兼容: POST /api/bookmarks/icons
    router.post('/icons', asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.json(success({}));
        }

        const placeholders = ids.map(() => '?').join(',');
        const bookmarks = await db.queryAll(`SELECT id, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders})`, ids);
        const iconMap = Object.fromEntries(
            bookmarks.filter(b => b.icon_data).map(b => [b.id, { icon_data: b.icon_data, icon_type: b.icon_type }])
        );
        res.json(success(iconMap));
    }));

    // 旧路径兼容: POST /api/bookmarks/sort
    router.post('/sort', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }

        await db.transaction(async (conn) => {
            for (const item of order) {
                if (item.id && typeof item.sort_order === 'number') {
                    await conn.execute('UPDATE bookmarks SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
                }
            }
        });
        res.json(success());
    }));

    return router;
};
