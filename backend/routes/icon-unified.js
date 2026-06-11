/**
 * 统一图标服务路由模块
 * 整合了 favicon.js, icon.js, icons.js 的所有功能
 */
const express = require('express');
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, requireStrictAdmin } = require('../middleware/security');
const { proxyIconRequest } = require('../utils/icon-proxy');
const { createIconDiscoveryService } = require('../services/icon-discovery-service');
const {
    fetchPublicImageAsDataUrl,
    safeFetchPublicUrl,
    readLimitedArrayBuffer,
    DEFAULT_MAX_BYTES
} = require('../services/icons/fetch-image');
const { createIconLibraryService } = require('../services/icons/library-service');
const { createBookmarkIconService } = require('../services/icons/bookmark-icon-service');
const { createIconDiscoveryCache } = require('../services/icons/discovery-cache');

function isPersistentDiscoveryCacheEnabled() {
    return String(process.env.ICON_DISCOVERY_PERSISTENT_CACHE || '').toLowerCase() === 'true';
}

module.exports = function(db) {
    const router = express.Router();
    const iconDiscovery = createIconDiscoveryService({
        persistentCache: isPersistentDiscoveryCacheEnabled() ? createIconDiscoveryCache(db) : null
    });
    const iconLibrary = createIconLibraryService(db);
    const bookmarkIconService = createBookmarkIconService(db, { iconDiscovery });

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
    const proxyIconHandler = asyncHandler(async (req, res) => {
        await proxyIconRequest(req, res, {
            safeFetchPublicUrl,
            readLimitedArrayBuffer,
            maxBytes: DEFAULT_MAX_BYTES,
            transparentOnFailure: false
        });
    });

    router.get('/proxy-icon', proxyIconHandler);
    router.get('/icon/proxy', proxyIconHandler);

    /**
     * POST /api/icon/convert
     * 将 URL 图标转换为 base64
     */
    router.post('/icon/convert', requireStrictAdmin, asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('缺少 URL', 400);
        }

        res.json(success(await fetchPublicImageAsDataUrl(url)));
    }));

    /**
     * POST /api/icon/fix-all
     * 批量修复所有 URL 类型的图标为 base64
     */
    router.post('/icon/fix-all', requireStrictAdmin, asyncHandler(async (req, res) => {
        res.json(success(await bookmarkIconService.convertUrlIconsToBase64()));
    }));

    /**
     * POST /api/icon/fetch-all
     * 批量获取所有书签的图标
     */
    router.post('/icon/fetch-all', requireStrictAdmin, asyncHandler(async (req, res) => {
        res.json(success(await bookmarkIconService.fetchMissingBookmarkIcons()));
    }));

    // ========================================
    // 图标库管理服务 (原 icons.js)
    // ========================================

    /**
     * GET /api/icons
     * 获取所有图标库图标
     */
    router.get('/icons', asyncHandler(async (req, res) => {
        res.json(success(await iconLibrary.list()));
    }));

    /**
     * POST /api/icons
     * 上传或管理图标（支持多种 action）
     */
    router.post('/icons', requireAdmin, asyncHandler(async (req, res) => {
        const action = req.query.action;

        if (action === 'batch-delete') {
            await iconLibrary.batchDelete(req.body.ids);
            return res.json(success());
        }

        if (action === 'from-url') {
            return res.json(success(await iconLibrary.uploadFromUrl(req.body)));
        }

        if (action === 'clear-from-bookmarks') {
            await iconLibrary.clearFromBookmarks(req.body.iconData);
            return res.json(success());
        }

        if (action === 'batch-clear-from-bookmarks') {
            await iconLibrary.batchClearFromBookmarks(req.body.iconDataList);
            return res.json(success());
        }

        res.json(success(await iconLibrary.upload(req.body)));
    }));

    /**
     * DELETE /api/icons
     * 删除图标
     */
    router.delete('/icons', requireAdmin, asyncHandler(async (req, res) => {
        await iconLibrary.deleteById(req.query.id);
        res.json(success());
    }));

    return router;
};
