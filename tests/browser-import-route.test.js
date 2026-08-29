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

test('browser import route previews without writes and applies the selected policy', async () => {
    const previousAuth = process.env.DISABLE_ADMIN_AUTH;
    process.env.DISABLE_ADMIN_AUTH = 'true';
    let transactionCount = 0;
    const executed = [];
    const db = {
        async queryAll(sql) {
            if (sql.includes('FROM categories')) {
                return [{ id: 'cat-existing', name: '工作', sort_order: 0 }];
            }
            return [{
                id: 'bookmark-existing',
                category_id: 'cat-existing',
                name: '旧名称',
                url: 'https://example.com/',
                sort_order: 0
            }];
        },
        async transaction(fn) {
            transactionCount += 1;
            await fn({
                async execute(sql, params) {
                    executed.push({ sql, params });
                    return { changes: 1 };
                }
            });
        }
    };
    const html = '<DL><DT><H3>工作</H3><DL><DT><A HREF="https://example.com/#fragment">新名称</A></DL></DL>';
    const app = express();
    app.use(express.json());
    app.use('/api/data', createDataRoute(db));
    app.use(errorHandler);
    const server = await listen(app);

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}/api/data/browser-import`;
        const previewResponse = await fetch(`${baseUrl}?preview=true&duplicates=skip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html })
        });
        const preview = await previewResponse.json();
        assert.equal(previewResponse.status, 200);
        assert.equal(preview.data.newBookmarks, 0);
        assert.equal(preview.data.duplicateBookmarks, 1);
        assert.equal(preview.data.sampleDuplicates[0].existingName, '旧名称');
        assert.equal(transactionCount, 0);

        const importResponse = await fetch(`${baseUrl}?duplicates=update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html })
        });
        const imported = await importResponse.json();
        assert.equal(importResponse.status, 200);
        assert.equal(imported.data.bookmarksUpdated, 1);
        assert.equal(transactionCount, 1);
        assert.match(executed[0].sql, /^UPDATE bookmarks/);
        assert.deepEqual(executed[0].params, ['cat-existing', '新名称', 'https://example.com/#fragment', 'bookmark-existing']);

        const invalidResponse = await fetch(`${baseUrl}?duplicates=replace`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ html })
        });
        assert.equal(invalidResponse.status, 400);
        assert.equal(transactionCount, 1);
    } finally {
        await new Promise(resolve => server.close(resolve));
        if (previousAuth === undefined) delete process.env.DISABLE_ADMIN_AUTH;
        else process.env.DISABLE_ADMIN_AUTH = previousAuth;
    }
});
