/**
 * 图标库路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, assertSafeFetchUrl } = require('../middleware/security');

module.exports = function(db) {
    async function getAllIcons() {
        const icons = [];

        const uploadedIcons = await db.queryAll(`
            SELECT id, name, data, type, created_at
            FROM icon_library
            ORDER BY created_at DESC
        `);

        uploadedIcons.forEach(icon => {
            icons.push({
                id: icon.id,
                data: icon.data,
                type: icon.type,
                source: icon.name || '手动上传',
                uploaded: true
            });
        });

        const bookmarkIcons = await db.queryAll(`
            SELECT DISTINCT icon_data, icon_type, name
            FROM bookmarks
            WHERE icon_type IN ('base64', 'url') AND icon_data IS NOT NULL AND icon_data != ''
        `);

        const engineIcons = await db.queryAll(`
            SELECT DISTINCT icon, name
            FROM search_engines
            WHERE icon IS NOT NULL AND icon != '' AND (icon LIKE 'http%' OR icon LIKE 'data:%')
        `);

        bookmarkIcons.forEach(b => {
            if (b.icon_data && !icons.find(i => i.data === b.icon_data)) {
                icons.push({
                    data: b.icon_data,
                    type: b.icon_type,
                    source: b.name,
                    uploaded: false
                });
            }
        });

        engineIcons.forEach(e => {
            if (e.icon && !icons.find(i => i.data === e.icon)) {
                icons.push({
                    data: e.icon,
                    type: e.icon.startsWith('data:') ? 'base64' : 'url',
                    source: e.name,
                    uploaded: false
                });
            }
        });

        return icons;
    }

    // GET /api/icons
    router.get('/', asyncHandler(async (req, res) => {
        const icons = await getAllIcons();
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
            const placeholders = ids.map(() => '?').join(',');
            await db.execute(`DELETE FROM icon_library WHERE id IN (${placeholders})`, ids);
            return res.json(success());
        }

        if (action === 'from-url') {
            const { url, name } = req.body;
            if (!url) {
                throw new AppError('缺少 URL', 400);
            }
            assertSafeFetchUrl(url);
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) throw new AppError(`HTTP ${response.status}`, 500);
            const buffer = await response.arrayBuffer();
            const contentType = response.headers.get('content-type') || 'image/png';
            const base64 = Buffer.from(buffer).toString('base64');
            const data = `data:${contentType.split(';')[0]};base64,${base64}`;
            const iconId = `icon_${Date.now()}`;
            await db.execute(
                'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
                [iconId, name || url, data, 'base64']
            );
            return res.json(success({ id: iconId, data }));
        }

        if (action === 'clear-from-bookmarks') {
            const { iconData } = req.body;
            if (!iconData) {
                throw new AppError('缺少图标数据', 400);
            }
            await db.execute(
                "UPDATE bookmarks SET icon_data = '', icon_type = 'auto' WHERE icon_data = ?",
                [iconData]
            );
            return res.json(success());
        }

        if (action === 'batch-clear-from-bookmarks') {
            const { iconDataList } = req.body;
            if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
                return res.json(success());
            }
            for (const iconData of iconDataList) {
                await db.execute(
                    "UPDATE bookmarks SET icon_data = '', icon_type = 'auto' WHERE icon_data = ?",
                    [iconData]
                );
            }
            return res.json(success());
        }

        const { name, data, type } = req.body;
        if (!data) {
            throw new AppError('缺少图标数据', 400);
        }
        const iconId = `icon_${Date.now()}`;
        await db.execute(
            'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
            [iconId, name || '', data, type || 'base64']
        );
        res.json(success({ id: iconId }));
    }));

    // DELETE /api/icons?id=xxx
    router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少图标 ID', 400);
        }
        await db.execute('DELETE FROM icon_library WHERE id = ?', [id]);
        res.json(success());
    }));

    // 旧路径兼容
    router.get('/library', asyncHandler(async (req, res) => {
        const icons = await getAllIcons();
        res.json(success(icons));
    }));

    router.post('/library', requireAdmin, asyncHandler(async (req, res) => {
        const { name, data, type } = req.body;
        if (!data) {
            throw new AppError('缺少图标数据', 400);
        }
        const iconId = `icon_${Date.now()}`;
        await db.execute(
            'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
            [iconId, name || '', data, type || 'base64']
        );
        res.json(success({ id: iconId }));
    }));

    router.post('/library/from-url', requireAdmin, asyncHandler(async (req, res) => {
        const { name, url } = req.body;
        if (!url) {
            throw new AppError('缺少图标 URL', 400);
        }
        assertSafeFetchUrl(url);
        const response = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        if (!response.ok) {
            throw new AppError(`HTTP ${response.status}`, 500);
        }
        const iconId = `icon_${Date.now()}`;
        await db.execute(
            'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
            [iconId, name || '', url, 'url']
        );
        res.json(success({ id: iconId, data: url }));
    }));

    router.delete('/library/:id', requireAdmin, asyncHandler(async (req, res) => {
        const result = await db.execute('DELETE FROM icon_library WHERE id = ?', [req.params.id]);
        if (result.changes === 0) {
            throw new AppError('图标不存在', 404);
        }
        res.json(success());
    }));

    router.post('/library/batch-delete', requireAdmin, asyncHandler(async (req, res) => {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new AppError('无效的图标 ID 列表', 400);
        }
        const placeholders = ids.map(() => '?').join(',');
        const result = await db.execute(`DELETE FROM icon_library WHERE id IN (${placeholders})`, ids);
        res.json(success({ deleted: result.changes }));
    }));

    router.post('/clear-from-bookmarks', requireAdmin, asyncHandler(async (req, res) => {
        const { iconData } = req.body;
        if (!iconData) {
            throw new AppError('缺少图标数据', 400);
        }
        const result = await db.execute(
            `UPDATE bookmarks SET icon_type = 'emoji', icon_data = '' WHERE icon_data = ?`,
            [iconData]
        );
        await db.execute(`UPDATE search_engines SET icon = '🔍' WHERE icon = ?`, [iconData]);
        res.json(success({ cleared: result.changes }));
    }));

    router.post('/batch-clear-from-bookmarks', requireAdmin, asyncHandler(async (req, res) => {
        const { iconDataList } = req.body;
        if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
            throw new AppError('缺少图标数据列表', 400);
        }
        let totalCleared = 0;
        for (const iconData of iconDataList) {
            const result = await db.execute(
                `UPDATE bookmarks SET icon_type = 'emoji', icon_data = '' WHERE icon_data = ?`,
                [iconData]
            );
            totalCleared += result.changes;
            await db.execute(`UPDATE search_engines SET icon = '🔍' WHERE icon = ?`, [iconData]);
        }
        res.json(success({ cleared: totalCleared }));
    }));

    return router;
};
