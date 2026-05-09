/**
 * 图标转换工具路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { assertPublicFetchUrl } = require('../middleware/security');
const { safeFetchPublicUrl, readLimitedArrayBuffer, DEFAULT_MAX_BYTES } = require('../utils/safe-fetch');

const IMAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'image/*,*/*;q=0.8'
};
const PAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

async function fetchPublicImage(url, { acceptAny = false } = {}) {
    const { response, url: finalUrl } = await safeFetchPublicUrl(url, {
        timeoutMs: 10000,
        fetchOptions: { headers: acceptAny ? PAGE_HEADERS : IMAGE_HEADERS }
    });

    if (!response.ok) {
        throw new AppError(`上游返回 ${response.status}`, 502);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
        throw new AppError('上游不是图片内容', 502);
    }

    const buffer = await readLimitedArrayBuffer(response, DEFAULT_MAX_BYTES);
    return { buffer, contentType, finalUrl };
}

module.exports = function(db) {
    // GET /api/icon/proxy - 代理外部图标（解决被墙问题）
    router.get('/proxy', asyncHandler(async (req, res) => {
        const { url } = req.query;
        if (!url) {
            throw new AppError('缺少 url 参数', 400);
        }

        try {
            const { buffer, contentType, finalUrl } = await fetchPublicImage(url);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 7天缓存
            res.setHeader('X-Proxy-Source', finalUrl.hostname);
            res.send(buffer);
        } catch (e) {
            if (e instanceof AppError) throw e;
            throw new AppError(`代理请求失败: ${e.message}`, e.statusCode || 502);
        }
    }));

    // POST /api/icon/convert
    router.post('/convert', asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('缺少 URL', 400);
        }

        const { buffer, contentType } = await fetchPublicImage(url, { acceptAny: true });
        const base64 = buffer.toString('base64');
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
                const { buffer, contentType } = await fetchPublicImage(bm.icon_data, { acceptAny: true });
                const base64 = buffer.toString('base64');
                const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                fixed++;
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
                const parsedUrl = await assertPublicFetchUrl(bm.url);
                const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

                let iconUrl = null;
                try {
                    const { response: pageRes } = await safeFetchPublicUrl(parsedUrl.href, {
                        timeoutMs: 10000,
                        fetchOptions: { headers: PAGE_HEADERS }
                    });
                    if (pageRes.ok) {
                        const pageBuffer = await readLimitedArrayBuffer(pageRes, 512 * 1024);
                        const html = pageBuffer.toString('utf8');
                        const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
                            || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
                        if (iconMatch) {
                            iconUrl = new URL(iconMatch[1], baseUrl).href;
                        }
                    }
                } catch { }

                if (!iconUrl) {
                    iconUrl = `${baseUrl}/favicon.ico`;
                }

                const { buffer, contentType } = await fetchPublicImage(iconUrl, { acceptAny: true });
                if (buffer.byteLength > 0) {
                    const base64 = buffer.toString('base64');
                    const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                    await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                    successCount++;
                    continue;
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
