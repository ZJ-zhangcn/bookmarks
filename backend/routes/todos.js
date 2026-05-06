/**
 * TODO 待办路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError, clampInt, toInt01, normalizeDatetime, nowDatetime } = require('../utils');
const { requireAdmin } = require('../middleware/security');

module.exports = function(db) {
    // GET /api/todos
    router.get('/', asyncHandler(async (req, res) => {
        const status = String(req.query.status || 'all').trim().toLowerCase();
        const q = String(req.query.q || '').trim();
        const limit = clampInt(req.query.limit, 1, 200, 200);
        const offset = clampInt(req.query.offset, 0, 1000000, 0);

        const where = [];
        const params = [];

        if (status === 'pending') {
            where.push('t.is_done = 0');
        } else if (status === 'done') {
            where.push('t.is_done = 1');
        } else if (status !== 'all') {
            throw new AppError('status 必须为 all/pending/done', 400);
        }

        if (q) {
            where.push('t.title LIKE ?');
            params.push(`%${q}%`);
        }

        let sql = 'SELECT t.* FROM todos t';
        if (where.length > 0) {
            sql += ` WHERE ${where.join(' AND ')} `;
        }
        sql += `
            ORDER BY
                t.is_done ASC,
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
            'SELECT * FROM todos WHERE id = ?',
            [req.params.id]
        );
        if (!row) throw new AppError('TODO 不存在', 404);
        res.json(success(row));
    }));

    // POST /api/todos (创建/更新，简化版 - 仅标题)
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const body = req.body || {};
        const todoId = body.id ? String(body.id) : `td_${Date.now()}`;

        const existing = body.id
            ? await db.queryOne('SELECT * FROM todos WHERE id = ?', [todoId])
            : null;

        const title = (body.title !== undefined) ? String(body.title || '').trim() : String(existing?.title || '').trim();
        if (!title) throw new AppError('TODO 标题不能为空', 400);

        const isDone = (body.is_done !== undefined) ? toInt01(body.is_done, 0) : toInt01(existing?.is_done, 0);

        const sortOrderRaw = (body.sort_order !== undefined) ? body.sort_order : existing?.sort_order;
        let sortOrder = parseInt(sortOrderRaw, 10);
        if (!Number.isFinite(sortOrder)) {
            if (existing) {
                sortOrder = existing.sort_order ?? 0;
            } else {
                const max = await db.queryOne('SELECT MAX(sort_order) as max_order FROM todos');
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
            title,
            isDone,
            sortOrder,
            completedAt
        ];

        if (db.USE_MYSQL) {
            await db.execute(
                `INSERT INTO todos (id, title, is_done, sort_order, completed_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    is_done = VALUES(is_done),
                    sort_order = VALUES(sort_order),
                    completed_at = VALUES(completed_at)`,
                params
            );
        } else {
            await db.execute(
                `INSERT INTO todos (id, title, is_done, sort_order, completed_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    is_done = excluded.is_done,
                    sort_order = excluded.sort_order,
                    completed_at = excluded.completed_at,
                    updated_at = CURRENT_TIMESTAMP`,
                params
            );
        }

        res.json(success({ id: todoId }));
    }));

    // PUT /api/todos (排序)
    router.put('/', requireAdmin, asyncHandler(async (req, res) => {
        const { order } = req.body || {};
        if (!Array.isArray(order)) throw new AppError('无效的排序数据', 400);

        await db.transaction(async (conn) => {
            for (const item of order) {
                const id = item?.id ? String(item.id) : '';
                if (!id) continue;

                const sortOrder = parseInt(item.sort_order, 10);
                if (Number.isFinite(sortOrder)) {
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
    router.delete('/completed/all', requireAdmin, asyncHandler(async (req, res) => {
        const result = await db.execute('DELETE FROM todos WHERE is_done = 1');
        res.json(success({ deleted: result.changes || 0 }));
    }));

    return router;
};
