/**
 * 搜索联想路由模块
 */
const express = require('express');
const { getSuggestions } = require('../../shared/services/suggest');

module.exports = function(_db) {
    const router = express.Router();

    // GET /api/suggest
    router.get('/', async (req, res) => {
        const { q, engine = 'baidu' } = req.query;
        const data = await getSuggestions(q, engine);
        res.json({ success: true, data });
    });

    return router;
};
