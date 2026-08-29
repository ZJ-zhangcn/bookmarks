const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const healthService = require('../services/bookmark-health-service');
const linkChecker = require('../services/bookmark-link-checker');
const { requireAdmin } = require('../middleware/security');

module.exports = function(db, options = {}) {
    router.get('/bookmarks', asyncHandler(async (req, res) => {
        const staleDays = Number.parseInt(req.query.staleDays || '180', 10);
        if (!Number.isFinite(staleDays) || staleDays < 1 || staleDays > 3650) {
            throw new AppError('staleDays 必须是 1 到 3650 之间的整数', 400);
        }
        const result = await healthService.runLocalHealthChecks(db, { staleDays });
        res.json(success({ ...result, offsiteBackup: options.getOffsiteStatus?.() || null }));
    }));
    router.get('/links', asyncHandler(async (_req, res) => {
        res.json(success({ status: linkChecker.getStatus(db), results: await linkChecker.listResults(db) }));
    }));
    router.post('/links', requireAdmin, asyncHandler(async (_req, res) => {
        res.status(202).json(success(linkChecker.start(db)));
    }));
    router.post('/links/pause', requireAdmin, asyncHandler(async (_req, res) => {
        res.json(success(linkChecker.pause(db)));
    }));
    return router;
};
