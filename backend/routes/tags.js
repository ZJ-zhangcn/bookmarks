const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const tagsService = require('../../shared/services/tags');

module.exports = function(db) {
    router.get('/', asyncHandler(async (req, res) => {
        res.json(success(await tagsService.listTags(db)));
    }));

    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        const action = req.body?.action;
        if (!['rename', 'delete'].includes(action)) throw new AppError('不支持的标签操作', 400);
        const result = await tagsService.updateTag(db, {
            tag: req.body?.tag,
            replacement: action === 'rename' ? req.body?.replacement : ''
        });
        res.json(success({ ...result, action }));
    }));

    return router;
};
