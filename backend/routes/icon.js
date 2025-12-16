/**
 * 图标转换工具路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');

module.exports = function(db) {
    // POST /api/icon/convert
    router.post('/convert', asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('缺少 URL', 400);
        }

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!response.ok) {
            throw new AppError(`HTTP ${response.status}`, 500);
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/png';
        const base64 = Buffer.from(buffer).toString('base64');
        res.json(success(`data:${contentType.split(';')[0]};base64,${base64}`));
    }));

    // POST /api/icon/fix-all
    router.post('/fix-all', asyncHandler(async (req, res) => {
        const bookmarks = await db.queryAll(`
            SELECT id, icon_data FROM bookmarks
            WHERE icon_type = 'url' AND icon_data IS NOT NULL AND icon_data != ''
        `);

        let fixed = 0;
        let failed = 0;

        for (const bm of bookmarks) {
            try {
                const response = await fetch(bm.icon_data, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const contentType = response.headers.get('content-type') || 'image/png';
                    const base64 = Buffer.from(buffer).toString('base64');
                    const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                    await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                    fixed++;
                } else {
                    await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['emoji', '', bm.id]);
                    failed++;
                }
            } catch {
                await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['emoji', '', bm.id]);
                failed++;
            }
        }

        res.json(success({ message: `修复完成：${fixed} 个成功，${failed} 个使用默认图标`, fixed, failed, total: bookmarks.length }));
    }));

    // POST /api/icon/fetch-all
    router.post('/fetch-all', asyncHandler(async (req, res) => {
        const bookmarks = await db.queryAll(`
            SELECT id, url FROM bookmarks
            WHERE url IS NOT NULL AND url != ''
            AND (icon_data IS NULL OR icon_data = '' OR icon_type = 'auto')
        `);

        let successCount = 0;
        let failed = 0;

        for (const bm of bookmarks) {
            try {
                const parsedUrl = new URL(bm.url);
                const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

                let iconUrl = null;
                try {
                    const pageRes = await fetch(bm.url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    if (pageRes.ok) {
                        const html = await pageRes.text();
                        const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
                            || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
                        if (iconMatch) {
                            iconUrl = iconMatch[1].startsWith('http') ? iconMatch[1]
                                : iconMatch[1].startsWith('//') ? 'https:' + iconMatch[1]
                                : iconMatch[1].startsWith('/') ? baseUrl + iconMatch[1]
                                : baseUrl + '/' + iconMatch[1];
                        }
                    }
                } catch { }

                if (!iconUrl) {
                    iconUrl = baseUrl + '/favicon.ico';
                }

                const iconRes = await fetch(iconUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                if (iconRes.ok) {
                    const buffer = await iconRes.arrayBuffer();
                    if (buffer.byteLength > 0) {
                        const contentType = iconRes.headers.get('content-type') || 'image/x-icon';
                        const base64 = Buffer.from(buffer).toString('base64');
                        const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                        await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                        successCount++;
                        continue;
                    }
                }
                failed++;
            } catch {
                failed++;
            }
        }

        res.json(success({ message: `获取完成：${successCount} 个成功，${failed} 个失败`, fetched: successCount, failed, total: bookmarks.length }));
    }));

    return router;
};
