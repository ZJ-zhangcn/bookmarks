const test = require('node:test');
const assert = require('node:assert/strict');

const { openaiGenerateWithConfig } = require('../shared/services/ai/providers/openai');

const originalFetch = global.fetch;

test.afterEach(() => {
    global.fetch = originalFetch;
});

function makeResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Map([['content-type', 'application/json']]),
        async text() {
            return JSON.stringify(body);
        }
    };
}

test('openai provider retries transient 408/503 auth gateway failures and returns the successful attempt', async () => {
    const calls = [];
    global.fetch = async (endpoint, options) => {
        calls.push({ endpoint, body: JSON.parse(options.body) });
        if (calls.length === 1) {
            return makeResponse(408, { error: { message: 'stream disconnected before completion' } });
        }
        if (calls.length === 2) {
            return makeResponse(503, { error: { message: 'auth_unavailable: no auth available (providers=codex, model=gpt-5.5-fast)' } });
        }
        return makeResponse(200, {
            choices: [{ message: { content: 'tags: AI,书签\nsummary: 稳定生成描述' } }]
        });
    };

    const result = await openaiGenerateWithConfig({
        name: 'Example',
        url: 'https://example.com',
        description: 'Example description',
        tagsHint: '',
        categories: [],
        mode: 'refine',
        baseUrl: 'https://newapi.example/v1',
        apiKey: 'test-key',
        model: 'gpt-5.5-fast',
        timeoutMs: 20000,
        generationParams: { maxTokens: 120, temperature: 0 }
    });

    assert.equal(calls.length, 3);
    assert.deepEqual(result.tags, ['AI', '书签']);
    assert.equal(result.summary, '稳定生成描述');
    assert.equal(result.model, 'gpt-5.5-fast');
});
