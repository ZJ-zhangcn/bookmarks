const test = require('node:test');
const assert = require('node:assert/strict');

const { ApiRequestError, requestJson, withButtonPending } = require('../frontend/modules/api-client-core.cjs');

function response(body, { status = 200, contentType = 'application/json' } = {}) {
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': contentType }
    });
}

test('API client unwraps success data and reports HTTP/business errors', async () => {
    const data = await requestJson('/api/test', {
        fetchImpl: async () => response({ success: true, data: { ok: true } })
    });
    assert.deepEqual(data, { ok: true });

    await assert.rejects(
        () => requestJson('/api/test', {
            fetchImpl: async () => response({ success: false, error: '保存失败' }, { status: 400 })
        }),
        error => error instanceof ApiRequestError && error.status === 400 && error.message === '保存失败'
    );
    await assert.rejects(
        () => requestJson('/api/test', {
            fetchImpl: async () => response('<html>bad gateway</html>', { status: 502, contentType: 'text/html' })
        }),
        /非 JSON 响应/
    );
});

test('API client retries safe reads but never retries writes', async () => {
    let reads = 0;
    const data = await requestJson('/api/test', {
        retryDelayMs: 0,
        fetchImpl: async () => {
            reads += 1;
            if (reads === 1) return response({ success: false, error: 'temporary' }, { status: 503 });
            return response({ success: true, data: 'ok' });
        }
    });
    assert.equal(data, 'ok');
    assert.equal(reads, 2);

    let writes = 0;
    await assert.rejects(
        () => requestJson('/api/test', {
            method: 'POST',
            json: { value: 1 },
            fetchImpl: async () => {
                writes += 1;
                return response({ success: false, error: 'temporary' }, { status: 503 });
            }
        }),
        /temporary/
    );
    assert.equal(writes, 1);
});

test('API client times out and restores pending button state', async () => {
    await assert.rejects(
        () => requestJson('/api/slow', {
            timeoutMs: 5,
            retries: 0,
            fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
                options.signal.addEventListener('abort', () => reject(new Error('aborted')));
            })
        }),
        error => error.isTimeout && error.code === 'REQUEST_TIMEOUT'
    );

    const button = {
        disabled: false,
        innerHTML: '<span>保存</span>',
        textContent: '',
        setAttribute() {},
        removeAttribute() {}
    };
    await withButtonPending(button, async () => {
        assert.equal(button.disabled, true);
        assert.equal(button.textContent, '保存中...');
    }, { pendingText: '保存中...' });
    assert.equal(button.disabled, false);
    assert.equal(button.innerHTML, '<span>保存</span>');
});
