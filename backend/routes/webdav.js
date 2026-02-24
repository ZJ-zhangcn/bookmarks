/**
 * WebDAV 代理路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, assertSafeFetchUrl } = require('../middleware/security');
const webdavService = require('../../shared/services/webdav');

module.exports = function(_db) {
    // POST /api/webdav?action=upload/download
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath, data } = req.body;
        const action = req.query.action;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;
        assertSafeFetchUrl(fullUrl);

        if (action === 'upload') {
            const result = await webdavService.upload({ url, username, password, path: filePath, data });
            return res.json(success(null, result.message));
        }

        if (action === 'download') {
            const downloadedData = await webdavService.download({ url, username, password, path: filePath });
            return res.json(success(downloadedData));
        }

        throw new AppError('无效的操作，请使用 action=upload 或 action=download', 400);
    }));

    // 旧路径兼容
    router.post('/upload', requireAdmin, asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath, data } = req.body;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;
        assertSafeFetchUrl(fullUrl);

        const result = await webdavService.upload({ url, username, password, path: filePath, data });
        res.json(success(null, result.message));
    }));

    router.post('/download', requireAdmin, asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath } = req.body;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;
        assertSafeFetchUrl(fullUrl);

        const downloadedData = await webdavService.download({ url, username, password, path: filePath });
        res.json(success(downloadedData));
    }));

    return router;
};
