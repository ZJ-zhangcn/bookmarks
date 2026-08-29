/**
 * 数据导入导出路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const dataService = require('../../shared/services/data');
const browserImportService = require('../services/browser-import-service');

module.exports = function(db) {
    // GET /api/data
    router.get('/', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons !== 'false';
        const data = await dataService.exportData(db, includeIcons);
        res.json(data);
    }));

    // POST /api/data
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const mode = req.query.mode || 'merge';
        if (!['merge', 'restore'].includes(mode)) {
            throw new AppError('导入模式必须是 merge 或 restore', 400);
        }
        let validation;
        try {
            validation = dataService.validateBackupPayload(req.body, { mode });
        } catch (error) {
            throw new AppError(error.message, 400);
        }
        let backup = null;
        if (mode === 'restore') {
            if (typeof db.createRestoreBackup !== 'function') {
                throw new AppError('当前数据库不支持完整恢复前备份', 500);
            }
            backup = await db.createRestoreBackup();
        }
        await dataService.importData(db, req.body, { mode });
        res.json(success({ mode, counts: validation.counts, backup: backup?.fileName || null }));
    }));

    // POST /api/data/browser-import - 导入浏览器书签 (Netscape HTML 格式)
    router.post('/browser-import', requireAdmin, asyncHandler(async (req, res) => {
        const { html } = req.body;
        if (!html) {
            throw new AppError('缺少书签数据', 400);
        }

        let plan;
        try {
            plan = await browserImportService.buildBrowserImportPlan(db, html);
        } catch (error) {
            throw new AppError(error.message, 400);
        }
        if (req.query.preview === 'true') {
            try {
                return res.json(success(browserImportService.publicPreview(plan, req.query.duplicates || 'skip')));
            } catch (error) {
                throw new AppError(error.message, 400);
            }
        }
        const duplicateMode = req.query.duplicates || 'skip';
        let result;
        try {
            result = await browserImportService.applyBrowserImport(db, plan, duplicateMode);
        } catch (error) {
            throw new AppError(error.message, 400);
        }
        res.json(success(result));
    }));

    return router;
};
