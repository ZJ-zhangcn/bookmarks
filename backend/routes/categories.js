/**
 * 分类路由模块
 */
const express = require('express');
const router = express.Router();
const { success, error, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');

module.exports = function(db) {
    // GET /api/categories
    router.get('/', asyncHandler(async (req, res) => {
        const categories = await db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at');
        res.json(success(categories));
    }));

    // POST /api/categories
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id, name, icon } = req.body;

        if (!name?.trim()) {
            throw new AppError('分类名称不能为空', 400);
        }

        const categoryId = id || `cat_${Date.now()}`;
        const isNewCategory = !id;
        const categoryIcon = icon || '📁';

        let sortOrder = 0;
        if (isNewCategory) {
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories');
            sortOrder = (maxOrder?.max_order ?? -1) + 1;
        } else {
            const existing = await db.queryOne('SELECT sort_order FROM categories WHERE id = ?', [categoryId]);
            sortOrder = existing?.sort_order ?? 0;
        }

        if (db.USE_MYSQL) {
            await db.execute(
                'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                [categoryId, name.trim(), categoryIcon, sortOrder]
            );
        } else {
            await db.execute(
                'INSERT OR REPLACE INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
                [categoryId, name.trim(), categoryIcon, sortOrder]
            );
        }
        res.json(success({ id: categoryId, name: name.trim(), icon: categoryIcon }));
    }));

    // DELETE /api/categories?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少分类 ID', 400);
        }
        await db.execute('DELETE FROM bookmarks WHERE category_id = ?', [id]);
        await db.execute('DELETE FROM categories WHERE id = ?', [id]);
        res.json(success());
    }));

    // PUT /api/categories (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }

        await db.transaction(async (conn) => {
            for (const item of order) {
                if (item.id && typeof item.sort_order === 'number') {
                    await conn.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
                }
            }
        });
        res.json(success());
    }));

    // 旧路径兼容: DELETE /api/categories/:id
    router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
        await db.execute('DELETE FROM bookmarks WHERE category_id = ?', [req.params.id]);
        await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.json(success());
    }));

    // 旧路径兼容: POST /api/categories/sort
    router.post('/sort', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body;
        if (!Array.isArray(order)) {
            throw new AppError('无效的排序数据', 400);
        }

        await db.transaction(async (conn) => {
            for (const item of order) {
                if (item.id && typeof item.sort_order === 'number') {
                    await conn.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
                }
            }
        });
        res.json(success());
    }));

    return router;
};
