const test = require('node:test');
const assert = require('node:assert/strict');

const aiService = require('../shared/services/ai');
const { registerAiRoutes } = require('../backend/ai');

function createResponse() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            this.headers[name] = value;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

function captureAiHandler(options = {}) {
    let handler = null;
    const app = {
        all(path, fn) {
            assert.equal(path, '/api/ai');
            handler = fn;
        }
    };
    registerAiRoutes(app, {}, options);
    return handler;
}

test('manual AI bookmark save invalidates bootstrap data cache', async () => {
    const originalSave = aiService.saveBookmarkAi;
    let invalidations = 0;
    aiService.saveBookmarkAi = async () => {};
    try {
        const handler = captureAiHandler({ onDataChanged: () => { invalidations += 1; } });
        const res = createResponse();
        await handler({
            method: 'POST',
            query: { action: 'bookmark' },
            body: { bookmarkId: 'bm-1', tags: ['AI'], summary: '摘要' }
        }, res);

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.equal(invalidations, 1);
    } finally {
        aiService.saveBookmarkAi = originalSave;
    }
});

test('AI generation only invalidates bootstrap cache when the result is persisted', async () => {
    const originalGenerate = aiService.generateAi;
    let invalidations = 0;
    aiService.generateAi = async () => ({ tags: ['AI'], summary: '摘要' });
    try {
        const handler = captureAiHandler({ onDataChanged: () => { invalidations += 1; } });

        await handler({
            method: 'POST',
            query: { action: 'generate' },
            body: { persist: false },
            headers: {},
            ip: '127.0.0.1',
            socket: {}
        }, createResponse());
        assert.equal(invalidations, 0);

        await handler({
            method: 'POST',
            query: { action: 'generate' },
            body: { persist: true },
            headers: {},
            ip: '127.0.0.2',
            socket: {}
        }, createResponse());
        assert.equal(invalidations, 1);
    } finally {
        aiService.generateAi = originalGenerate;
    }
});
