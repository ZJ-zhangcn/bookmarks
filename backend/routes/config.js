/**
 * 配置路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler } = require('../utils');

module.exports = function(db) {
    // GET /api/config
    router.get('/', asyncHandler(async (req, res) => {
        const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
        res.json(success(row ? JSON.parse(row.value) : null));
    }));

    // POST /api/config
    router.post('/', asyncHandler(async (req, res) => {
        const value = JSON.stringify(req.body);
        if (db.USE_MYSQL) {
            await db.execute('INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['personalization', value]);
        } else {
            await db.execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['personalization', value]);
        }
        res.json(success());
    }));

    // 旧路径兼容: GET /api/config/personalization
    router.get('/personalization', asyncHandler(async (req, res) => {
        const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
        res.json(success(row ? JSON.parse(row.value) : null));
    }));

    // 旧路径兼容: POST /api/config/personalization
    router.post('/personalization', asyncHandler(async (req, res) => {
        const value = JSON.stringify(req.body);
        if (db.USE_MYSQL) {
            await db.execute('INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['personalization', value]);
        } else {
            await db.execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['personalization', value]);
        }
        res.json(success());
    }));

    return router;
};
