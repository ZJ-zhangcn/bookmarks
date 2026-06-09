/**
 * 统一图标服务路由模块
 * 整合了 favicon.js, icon.js, icons.js 的所有功能
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, requireStrictAdmin, assertPublicFetchUrl } = require('../middleware/security');
const { safeFetch } = require('../utils/safe-fetch');
const { proxyIconRequest } = require('../utils/icon-proxy');
const { createIconDiscoveryService } = require('../services/icon-discovery-service');
const iconsService = require('../../shared/services/icons');

const IMAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'image/*,*/*;q=0.8'
};

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * 获取公共图片资源
 */
async function fetchPublicImage(url) {
    const response = await safeFetch(url, {
        timeout: 10000,
        headers: IMAGE_HEADERS
    });

    if (!response.ok) {
        throw new AppError(`上游返回 ${response.status}`, 502);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
        throw new AppError('上游不是图片内容', 502);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > DEFAULT_MAX_BYTES) {
        throw new AppError('图片过大', 413);
    }

    return { buffer, contentType, finalUrl: url };
}

/**
 * 读取有限的 ArrayBuffer（兼容旧代码）
 */
async function readLimitedArrayBuffer(response, maxBytes = DEFAULT_MAX_BYTES) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
        throw new AppError('响应内容过大', 413);
    }

    return buffer;
}

/**
 * safeFetchPublicUrl 兼容包装（兼容旧代码）
 */
async function safeFetchPublicUrl(url, options = {}) {
    const response = await safeFetch(url, {
        timeout: options.timeoutMs || 10000,
        headers: options.fetchOptions?.headers || {}
    });

    return { response, url };
}

module.exports = function(db) {
    const iconDiscovery = createIconDiscoveryService();

    // ========================================
    // 图标发现服务 (原 favicon.js)
    // ========================================

    /**
     * POST /api/favicon
     * 发现网站可用的图标
     */
    router.post('/favicon', asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('URL is required', 400);
        }

        try {
            const result = await iconDiscovery.discoverIcons(url);
            res.json(success(result, 'ok'));
        } catch (e) {
            throw new AppError(e.message, 400);
        }
    }));

    // ========================================
    // 图标代理与转换服务 (原 icon.js)
    // ========================================

    /**
     * GET /api/proxy-icon
     * 代理外部图标请求（解决被墙问题）
     * 前端使用: /api/proxy-icon?url=...
     */
    router.get('/proxy-icon', asyncHandler(async (req, res) => {
        await proxyIconRequest(req, res, {
            safeFetchPublicUrl,
            readLimitedArrayBuffer,
            maxBytes: DEFAULT_MAX_BYTES,
            transparentOnFailure: false
        });
    }));

    /**
     * POST /api/icon/convert
     * 将 URL 图标转换为 base64
     */
    router.post('/icon/convert', requireStrictAdmin, asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('缺少 URL', 400);
        }

        const { buffer, contentType } = await fetchPublicImage(url);
        const base64 = buffer.toString('base64');
        res.json(success(`data:${contentType.split(';')[0]};base64,${base64}`));
    }));

    /**
     * POST /api/icon/fix-all
     * 批量修复所有 URL 类型的图标为 base64
     */
    router.post('/icon/fix-all', requireStrictAdmin, asyncHandler(async (req, res) => {
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

        res.json(success({
            message: `修复完成：${fixed} 个成功，${failed} 个保留原图标`,
            fixed,
            failed,
            total: bookmarks.length,
            failures
        }));
    }));

    /**
     * POST /api/icon/fetch-all
     * 批量获取所有书签的图标
     */
    router.post('/icon/fetch-all', requireStrictAdmin, asyncHandler(async (req, res) => {
        const bookmarks = await db.queryAll(`
            SELECT id, url FROM bookmarks
            WHERE url IS NOT NULL AND url != ''
            AND (icon_data IS NULL OR icon_data = '' OR icon_type = 'auto')
        `);

        let successCount = 0;
        let failed = 0;

        for (const bm of bookmarks) {
            try {
                const discovered = await iconDiscovery.discoverIcons(bm.url);
                const iconUrl = discovered.icons[0];
                if (!iconUrl) throw new AppError('未找到可用图标', 502);

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

        res.json(success({
            message: `获取完成：${successCount} 个成功，${failed} 个失败`,
            fetched: successCount,
            failed,
            total: bookmarks.length
        }));
    }));

    // ========================================
    // 图标库管理服务 (原 icons.js)
    // ========================================

    /**
     * GET /api/icons
     * 获取所有图标库图标
     */
    router.get('/icons', asyncHandler(async (req, res) => {
        const icons = await iconsService.getAllIcons(db);
        res.json(success(icons));
    }));

    /**
     * POST /api/icons
     * 上传或管理图标（支持多种 action）
     */
    router.post('/icons', requireAdmin, asyncHandler(async (req, res) => {
        const action = req.query.action;

        if (action === 'batch-delete') {
            const { ids } = req.body;
            if (!Array.isArray(ids) || ids.length === 0) {
                return res.json(success());
            }
            await iconsService.batchDeleteIcons(db, ids);
            return res.json(success());
        }

        if (action === 'from-url') {
            const { url, name } = req.body;
            if (!url) {
                throw new AppError('缺少 URL', 400);
            }
            const result = await iconsService.uploadIconFromUrl(db, { url, name }, assertPublicFetchUrl);
            return res.json(success(result));
        }

        if (action === 'clear-from-bookmarks') {
            const { iconData } = req.body;
            if (!iconData) {
                throw new AppError('缺少图标数据', 400);
            }
            await iconsService.clearIconFromBookmarks(db, iconData);
            return res.json(success());
        }

        if (action === 'batch-clear-from-bookmarks') {
            const { iconDataList } = req.body;
            if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
                return res.json(success());
            }
            await iconsService.batchClearIconsFromBookmarks(db, iconDataList);
            return res.json(success());
        }

        const { name, data, type } = req.body;
        if (!data) {
            throw new AppError('缺少图标数据', 400);
        }
        const result = await iconsService.uploadIcon(db, { name, data, type });
        res.json(success(result));
    }));

    /**
     * DELETE /api/icons
     * 删除图标
     */
    router.delete('/icons', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.query;
        if (!id) {
            throw new AppError('缺少图标 ID', 400);
        }
        await iconsService.deleteIcon(db, id);
        res.json(success());
    }));

    return router;
};
