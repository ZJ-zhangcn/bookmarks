/**
 * 图标转换工具路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, assertPublicFetchUrl } = require('../middleware/security');
const { safeFetchPublicUrl, readLimitedArrayBuffer, DEFAULT_MAX_BYTES } = require('../utils/safe-fetch');
const { selectBestIcons } = require('../utils/icon-discovery');
const { proxyIconRequest } = require('../utils/icon-proxy');

const IMAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'image/*,*/*;q=0.8'
};
const PAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

async function fetchPublicImage(url) {
    const { response, url: finalUrl } = await safeFetchPublicUrl(url, {
        timeoutMs: 10000,
        fetchOptions: { headers: IMAGE_HEADERS }
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
        await proxyIconRequest(req, res, {
            safeFetchPublicUrl,
            readLimitedArrayBuffer,
            maxBytes: DEFAULT_MAX_BYTES,
            transparentOnFailure: false
        });
    }));

    // POST /api/icon/convert
    router.post('/convert', requireAdmin, asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('缺少 URL', 400);
        }

        const { buffer, contentType } = await fetchPublicImage(url);
        const base64 = buffer.toString('base64');
        res.json(success(`data:${contentType.split(';')[0]};base64,${base64}`));
    }));

    // POST /api/icon/fix-all
    router.post('/fix-all', requireAdmin, asyncHandler(async (req, res) => {
        const bookmarks = await db.queryAll(`
            SELECT id, icon_data FROM bookmarks
            WHERE icon_type = 'url' AND icon_data IS NOT NULL AND icon_data != ''
        `);

        let fixed = 0;
        let failed = 0;

        const failures = [];

        for (const bm of bookmarks) {
            try {
                const { buffer, contentType } = await fetchPublicImage(bm.icon_data);
                const base64 = buffer.toString('base64');
                const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                fixed++;
            } catch (e) {
                failures.push({ id: bm.id, reason: e.message || '转换失败' });
                failed++;
            }
        }

        res.json(success({ message: `修复完成：${fixed} 个成功，${failed} 个保留原图标`, fixed, failed, total: bookmarks.length, failures }));
    }));

    // POST /api/icon/fetch-all
    router.post('/fetch-all', requireAdmin, asyncHandler(async (req, res) => {
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
                        const icons = await selectBestIcons(html, parsedUrl.href, async manifestUrl => {
                            const { response: manifestResponse } = await safeFetchPublicUrl(manifestUrl, {
                                timeoutMs: 5000,
                                fetchOptions: { headers: PAGE_HEADERS }
                            });
                            if (!manifestResponse.ok) return null;
                            const manifestText = (await readLimitedArrayBuffer(manifestResponse, 128 * 1024)).toString('utf8');
                            return JSON.parse(manifestText);
                        });
                        iconUrl = icons[0] || null;
                    }
                } catch { }

                if (!iconUrl) {
                    iconUrl = `${baseUrl}/favicon.ico`;
                }

                const { buffer, contentType } = await fetchPublicImage(iconUrl);
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
