/**
 * TODO 待办路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');

function clampInt(raw, min, max, fallback) {
    const n = parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function toInt01(raw, fallback = 0) {
    if (raw === true) return 1;
    if (raw === false) return 0;
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes') return 1;
    if (s === '0' || s === 'false' || s === 'no') return 0;
    return fallback;
}

function toMysqlDatetimeString(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeDatetime(raw, useMysql) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return useMysql ? toMysqlDatetimeString(d) : d.toISOString();
}

function nowDatetime(useMysql) {
    const d = new Date();
    return useMysql ? toMysqlDatetimeString(d) : d.toISOString();
}

module.exports = function(db) {
    // GET /api/todos
    router.get('/', asyncHandler(async (req, res) => {
        const categoryId = req.query.category_id != null ? String(req.query.category_id) : null;
        const status = String(req.query.status || 'all').trim().toLowerCase();
        const q = String(req.query.q || '').trim();
        const limit = clampInt(req.query.limit, 1, 200, 200);
        const offset = clampInt(req.query.offset, 0, 1000000, 0);

        const where = [];
        const params = [];

        if (categoryId && categoryId !== 'null' && categoryId !== '__null__') {
            where.push('t.category_id = ?');
            params.push(categoryId);
        } else if (categoryId === 'null' || categoryId === '__null__') {
            where.push('t.category_id IS NULL');
        }

        if (status === 'pending') {
            where.push('t.is_done = 0');
        } else if (status === 'done') {
            where.push('t.is_done = 1');
        } else if (status !== 'all') {
            throw new AppError('status 必须为 all/pending/done', 400);
        }

        if (q) {
            where.push('(t.title LIKE ? OR t.notes LIKE ?)');
            params.push(`%${q}%`, `%${q}%`);
        }

        let sql = `
            SELECT
                t.*,
                c.name as category_name,
                c.icon as category_icon
            FROM todos t
            LEFT JOIN categories c ON t.category_id = c.id
        `;
        if (where.length > 0) {
            sql += ` WHERE ${where.join(' AND ')} `;
        }
        sql += `
            ORDER BY
                t.is_done ASC,
                t.priority DESC,
                (t.due_at IS NULL) ASC,
                t.due_at ASC,
                t.sort_order ASC,
                t.created_at ASC
            LIMIT ${limit} OFFSET ${offset}
        `;

        const rows = await db.queryAll(sql, params);
        res.json(success(rows));
    }));

    // GET /api/todos/:id
    router.get('/:id', asyncHandler(async (req, res) => {
        const row = await db.queryOne(
            `SELECT t.*, c.name as category_name, c.icon as category_icon
             FROM todos t LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.id = ?`,
            [req.params.id]
        );
        if (!row) throw new AppError('TODO 不存在', 404);
        res.json(success(row));
    }));

    // POST /api/todos (创建/更新)
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const body = req.body || {};
        const todoId = body.id ? String(body.id) : `td_${Date.now()}`;

        const existing = body.id
            ? await db.queryOne('SELECT * FROM todos WHERE id = ?', [todoId])
            : null;

        const title = (body.title !== undefined) ? String(body.title || '').trim() : String(existing?.title || '').trim();
        if (!title) throw new AppError('TODO 标题不能为空', 400);

        const notes = (body.notes !== undefined) ? String(body.notes || '') : String(existing?.notes || '');

        const rawCategoryId = (body.category_id !== undefined) ? body.category_id : existing?.category_id;
        const categoryId = (rawCategoryId == null || String(rawCategoryId).trim() === '') ? null : String(rawCategoryId).trim();
        if (categoryId) {
            const cat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [categoryId]);
            if (!cat) throw new AppError('分类不存在', 400);
        }

        const isDone = (body.is_done !== undefined) ? toInt01(body.is_done, 0) : toInt01(existing?.is_done, 0);

        const priorityRaw = (body.priority !== undefined) ? body.priority : existing?.priority;
        const priority = clampInt(priorityRaw, 0, 3, 0);

        const dueAt = (body.due_at !== undefined)
            ? normalizeDatetime(body.due_at, db.USE_MYSQL)
            : (existing?.due_at ?? null);

        const sortOrderRaw = (body.sort_order !== undefined) ? body.sort_order : existing?.sort_order;
        let sortOrder = parseInt(sortOrderRaw, 10);
        if (!Number.isFinite(sortOrder)) {
            if (existing) {
                sortOrder = existing.sort_order ?? 0;
            } else {
                const max = await db.queryOne(
                    'SELECT MAX(sort_order) as max_order FROM todos WHERE ((category_id = ?) OR (category_id IS NULL AND ? IS NULL))',
                    [categoryId, categoryId]
                );
                sortOrder = (max?.max_order ?? -1) + 1;
            }
        }

        let completedAt = (body.completed_at !== undefined)
            ? normalizeDatetime(body.completed_at, db.USE_MYSQL)
            : (existing?.completed_at ?? null);

        if (isDone === 0) {
            completedAt = null;
        } else if (!completedAt) {
            if (existing && toInt01(existing.is_done, 0) === 1 && existing.completed_at) {
                completedAt = existing.completed_at;
            } else {
                completedAt = nowDatetime(db.USE_MYSQL);
            }
        }

        const params = [
            todoId,
            categoryId,
            title,
            notes,
            isDone,
            priority,
            dueAt,
            sortOrder,
            completedAt
        ];

        if (db.USE_MYSQL) {
            await db.execute(
                `INSERT INTO todos (id, category_id, title, notes, is_done, priority, due_at, sort_order, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    category_id = VALUES(category_id),
                    title = VALUES(title),
                    notes = VALUES(notes),
                    is_done = VALUES(is_done),
                    priority = VALUES(priority),
                    due_at = VALUES(due_at),
                    sort_order = VALUES(sort_order),
                    completed_at = VALUES(completed_at)`,
                params
            );
        } else {
            await db.execute(
                `INSERT INTO todos (id, category_id, title, notes, is_done, priority, due_at, sort_order, completed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    category_id = excluded.category_id,
                    title = excluded.title,
                    notes = excluded.notes,
                    is_done = excluded.is_done,
                    priority = excluded.priority,
                    due_at = excluded.due_at,
                    sort_order = excluded.sort_order,
                    completed_at = excluded.completed_at,
                    updated_at = CURRENT_TIMESTAMP`,
                params
            );
        }

        res.json(success({ id: todoId }));
    }));

    // PUT /api/todos (排序/移动)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body || {};
        if (!Array.isArray(order)) throw new AppError('无效的排序数据', 400);

        await db.transaction(async (conn) => {
            for (const item of order) {
                const id = item?.id ? String(item.id) : '';
                if (!id) continue;

                const sortOrder = parseInt(item.sort_order, 10);
                const hasSort = Number.isFinite(sortOrder);

                const rawCategoryId = (item.category_id !== undefined) ? item.category_id : undefined;
                const categoryId = (rawCategoryId == null || String(rawCategoryId).trim() === '') ? null : String(rawCategoryId).trim();

                if (item.category_id !== undefined && categoryId) {
                    const cat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [categoryId]);
                    if (!cat) throw new AppError('分类不存在', 400);
                }

                if (item.category_id !== undefined && hasSort) {
                    await conn.execute('UPDATE todos SET category_id = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [categoryId, sortOrder, id]);
                } else if (item.category_id !== undefined) {
                    await conn.execute('UPDATE todos SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [categoryId, id]);
                } else if (hasSort) {
                    await conn.execute('UPDATE todos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [sortOrder, id]);
                }
            }
        });

        res.json(success());
    }));

    // DELETE /api/todos?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const id = String(req.query.id || '').trim();
        if (!id) throw new AppError('缺少 TODO ID', 400);
        await db.execute('DELETE FROM todos WHERE id = ?', [id]);
        res.json(success());
    }));

    // DELETE /api/todos/completed/all - 清除所有已完成的待办
    // 必须在 /:id 路由之前定义
    router.delete('/completed/all', requireAdmin, asyncHandler(async (req, res) => {
        const result = await db.execute('DELETE FROM todos WHERE is_done = 1');
        res.json(success({ deleted: result.changes || 0 }));
    }));

    // 兼容: DELETE /api/todos/:id
    router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
        await db.execute('DELETE FROM todos WHERE id = ?', [req.params.id]);
        res.json(success());
    }));

    return router;
};
