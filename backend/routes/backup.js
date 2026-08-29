const express = require('express');
const router = express.Router();
const { success, asyncHandler } = require('../utils');
const { requireAdmin } = require('../middleware/security');

module.exports = function(db, options = {}) {
    const service = options.service;
    router.get('/offsite', asyncHandler(async (_req, res) => {
        res.json(success(service.getStatus()));
    }));
    router.post('/offsite', requireAdmin, asyncHandler(async (_req, res) => {
        res.json(success(await service.run({ db })));
    }));
    return router;
};
