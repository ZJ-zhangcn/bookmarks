/**
 * 服务状态路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const serviceStatus = require('../../shared/services/service-status');
const serviceChecker = require('../services/service-checker');

module.exports = function(db, options = {}) {
    const checker = options.checker || serviceChecker;

    // GET /api/service-status
    router.get('/', asyncHandler(async (_req, res) => {
        const rows = await serviceStatus.getServiceStatus(db);
        res.json(success(rows));
    }));

    // POST /api/service-status/check
    router.post('/check', requireAdmin, asyncHandler(async (req, res) => {
        const { id } = req.body || {};
        const results = id
            ? [await checker.checkServiceById(db, id)]
            : await checker.checkAllEnabledServices(db);
        res.json(success(results));
    }));

    // POST /api/service-status/services
    router.post('/services', requireAdmin, asyncHandler(async (req, res) => {
        const saved = await serviceStatus.saveService(db, req.body || {});
        res.json(success(saved));
    }));

    // DELETE /api/service-status/services/:id
    router.delete('/services/:id', requireAdmin, asyncHandler(async (req, res) => {
        const id = String(req.params.id || '').trim();
        if (!id) throw new AppError('缺少服务 ID', 400);
        await serviceStatus.deleteService(db, id);
        res.json(success());
    }));

    return router;
};
