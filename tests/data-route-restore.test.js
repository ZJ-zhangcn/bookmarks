const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const createDataRoute = require('../backend/routes/data');
const { errorHandler } = require('../backend/utils');

function listen(app) {
    return new Promise(resolve => {
        const server = app.listen(0, '127.0.0.1', () => resolve(server));
    });
}

test('restore route validates first, backs up, then replaces data', async () => {
    const previousAuth = process.env.DISABLE_ADMIN_AUTH;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.DISABLE_ADMIN_AUTH = 'true';
    process.env.NODE_ENV = 'production';

    const events = [];
    const db = {
        async createRestoreBackup() {
            events.push('backup');
            return { fileName: 'bookmarks-pre-restore-test.db' };
        },
        async transaction(fn) {
            events.push('transaction');
            await fn({
                async execute(sql) {
                    events.push(sql);
                    return { changes: 1 };
                }
            });
        }
    };

    const app = express();
    app.use(express.json());
    app.use('/api/data', createDataRoute(db));
    app.use(errorHandler);
    const server = await listen(app);

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}/api/data`;
        const invalid = await fetch(`${baseUrl}?mode=restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: '9.0', categories: [], bookmarks: [], engines: [] })
        });
        const invalidBody = await invalid.json();
        assert.equal(invalid.status, 400);
        assert.match(invalidBody.error, /高于当前支持版本/);
        assert.deepEqual(events, []);

        const response = await fetch(`${baseUrl}?mode=restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: '1.2', categories: [], bookmarks: [], engines: [] })
        });
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.mode, 'restore');
        assert.equal(body.data.backup, 'bookmarks-pre-restore-test.db');
        assert.deepEqual(body.data.counts, {
            categories: 0,
            bookmarks: 0,
            bookmark_ai: 0,
            icon_library: 0,
            todos: 0,
            engines: 0
        });
        assert.equal(events[0], 'backup');
        assert.equal(events[1], 'transaction');
        assert.match(events[2], /^DELETE FROM bookmark_ai/);

        const invalidMode = await fetch(`${baseUrl}?mode=replace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        assert.equal(invalidMode.status, 400);
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (previousAuth === undefined) delete process.env.DISABLE_ADMIN_AUTH;
        else process.env.DISABLE_ADMIN_AUTH = previousAuth;
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
    }
});
