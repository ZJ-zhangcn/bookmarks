/**
 * WebDAV 代理路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin, assertSafeFetchUrl } = require('../middleware/security');
const webdavService = require('../../shared/services/webdav');

function toOperationalError(err, fallbackStatusCode = 400) {
    if (err?.isOperational) {
        if ((err.statusCode || 500) >= 500) {
            return new AppError(err.message || 'WebDAV 操作失败', 424);
        }
        return err;
    }
    const statusCode = err?.statusCode || fallbackStatusCode;
    const operational = new AppError(err?.message || 'WebDAV 操作失败', statusCode >= 500 ? 424 : statusCode);
    if (err?.stack) operational.stack = err.stack;
    return operational;
}

module.exports = function(_db) {
    // POST /api/webdav?action=upload/download
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath, data } = req.body;
        const action = req.query.action;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;
        try {
            assertSafeFetchUrl(fullUrl);
        } catch (err) {
            throw toOperationalError(err, 400);
        }

        if (action === 'upload') {
            try {
                const result = await webdavService.upload({ url, username, password, path: filePath, data });
                return res.json(success(null, result.message));
            } catch (err) {
                throw toOperationalError(err, 424);
            }
        }

        if (action === 'download') {
            try {
                const downloadedData = await webdavService.download({ url, username, password, path: filePath });
                return res.json(success(downloadedData));
            } catch (err) {
                throw toOperationalError(err, 424);
            }
        }

        throw new AppError('无效的操作，请使用 action=upload 或 action=download', 400);
    }));

    return router;
};
