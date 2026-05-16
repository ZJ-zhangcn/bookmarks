const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const createWebdavRoute = require('../backend/routes/webdav');
const { errorHandler } = require('../backend/utils');
const webdavService = require('../shared/services/webdav');

function withEnv(overrides, fn) {
    const previous = {};
    for (const key of Object.keys(overrides)) {
        previous[key] = process.env[key];
        if (overrides[key] === undefined) delete process.env[key];
        else process.env[key] = overrides[key];
    }
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            for (const key of Object.keys(overrides)) {
                if (previous[key] === undefined) delete process.env[key];
                else process.env[key] = previous[key];
            }
        });
}

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, () => resolve(server));
    });
}

test('webdav route reports blocked private upload URL as operational 400 instead of masked 500', async () => {
    await withEnv({ DISABLE_ADMIN_AUTH: 'true', ALLOW_PRIVATE_FETCH: undefined, NODE_ENV: 'production' }, async () => {
        const app = express();
        app.use(express.json({ limit: '10mb' }));
        app.use('/api/webdav', createWebdavRoute({}));
        app.use(errorHandler);

        const server = await listen(app);
        try {
            const port = server.address().port;
            const response = await fetch(`http://127.0.0.1:${port}/api/webdav?action=upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: 'http://127.0.0.1:8080',
                    username: 'user',
                    password: 'pass',
                    path: 'bookmarks/config.json',
                    data: { ok: true }
                })
            });
            const body = await response.json();
            assert.equal(response.status, 400);
            assert.equal(body.success, false);
            assert.match(body.error, /禁止访问内网\/本地地址/);
        } finally {
            await new Promise(resolve => server.close(resolve));
        }
    });
});

test('webdav upload upstream failures keep their message visible in production error handler', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (_url, options = {}) => {
        if (options.method === 'MKCOL') return { ok: false, status: 405, text: async () => '' };
        return { ok: false, status: 507, text: async () => 'quota exceeded' };
    };
    try {
        await assert.rejects(
            () => webdavService.upload({
                url: 'https://webdav.example.test',
                username: 'user',
                password: 'pass',
                path: 'bookmarks/config.json',
                data: { ok: true }
            }),
            err => {
                assert.equal(err.statusCode, 507);
                assert.equal(err.isOperational, true);
                assert.match(err.message, /上传失败: 507 quota exceeded/);
                return true;
            }
        );
    } finally {
        global.fetch = originalFetch;
    }
});

test('webdav upload network failures are operational bad gateway errors', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (_url, options = {}) => {
        if (options.method === 'MKCOL') return { ok: false, status: 405, text: async () => '' };
        throw new Error('fetch failed');
    };
    try {
        await assert.rejects(
            () => webdavService.upload({
                url: 'https://webdav.example.test',
                username: 'user',
                password: 'pass',
                path: 'bookmarks/config.json',
                data: { ok: true }
            }),
            err => {
                assert.equal(err.statusCode, 502);
                assert.equal(err.isOperational, true);
                assert.match(err.message, /WebDAV 上传请求失败: fetch failed/);
                return true;
            }
        );
    } finally {
        global.fetch = originalFetch;
    }
});
