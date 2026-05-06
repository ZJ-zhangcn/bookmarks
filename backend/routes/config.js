/**
 * 配置路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const configService = require('../../shared/services/config');

module.exports = function(db) {
    // GET /api/config
    router.get('/', asyncHandler(async (req, res) => {
        const data = await configService.getConfig(db);
        res.json(success(data));
    }));

    // POST /api/config
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        await configService.saveConfig(db, req.body);
        res.json(success());
    }));

    return router;
};
