/**
 * Favicon 代理路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { createIconDiscoveryService } = require('../services/icon-discovery-service');

module.exports = function(_db) {
    const iconDiscovery = createIconDiscoveryService();

    // POST /api/favicon
    router.post('/', asyncHandler(async (req, res) => {
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

    return router;
};
