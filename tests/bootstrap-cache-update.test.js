const test = require('node:test');
const assert = require('node:assert/strict');

const bootstrap = require('../backend/bootstrap-v2');

function createResponse() {
    return {
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name] = value; },
        json(body) { this.body = body; return this; },
        status() { return this; }
    };
}

test('bookmark visit patches a warm bootstrap cache without invalidating it', async () => {
    bootstrap.clearBootstrapCache();
    let handler;
    const app = { get(path, fn) { assert.equal(path, '/api/bootstrap-v2'); handler = fn; } };
    const db = {
        async queryAll(sql) {
            if (/FROM todos/i.test(sql)) return [];
            return [{
                row_type: 'bookmark', id: 'bm-1', category_id: 'cat-1', name: 'Example', url: 'https://example.com',
                description: '', icon: '🌐', icon_type: 'auto', icon_data: null, sort_order: 0,
                visit_count: 1, last_visited_at: null, created_at: '2026-01-01', category_name: '默认',
                category_icon: '📁', tags: '[]', ai_summary: ''
            }];
        },
        async queryOne() { return null; }
    };
    bootstrap(app, db);

    const first = createResponse();
    await handler({}, first);
    assert.equal(first.headers['X-Cache'], 'MISS');

    assert.equal(bootstrap.updateCachedBookmarkVisit('bm-1', {
        visit_count: 2,
        last_visited_at: '2026-08-29T12:00:00.000Z'
    }), true);

    const second = createResponse();
    await handler({}, second);
    assert.equal(second.headers['X-Cache'], 'HIT');
    assert.equal(second.body.data.bookmarks[0].visit_count, 2);
    assert.equal(second.body.data.bookmarks[0].last_visited_at, '2026-08-29T12:00:00.000Z');
});
