const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createIconDiscoveryService,
    getFallbackIcons
} = require('../backend/services/icon-discovery-service');

function headers(values = {}) {
    const normalized = Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)])
    );
    return {
        get(name) {
            return normalized[String(name || '').toLowerCase()] || null;
        }
    };
}

function response({ ok = true, status = 200, contentType = 'text/html', body = '' } = {}) {
    const buffer = Buffer.from(body);
    return {
        ok,
        status,
        headers: headers({
            'content-type': contentType,
            'content-length': buffer.byteLength
        }),
        _body: buffer
    };
}

function createFakeService(routes, calls = []) {
    return createIconDiscoveryService({
        assertPublicFetchUrl: async raw => new URL(raw),
        isPrivateOrLocalAddress: () => false,
        safeFetchPublicUrl: async rawUrl => {
            const url = String(rawUrl);
            calls.push(url);
            if (routes[url] instanceof Error) throw routes[url];
            return {
                response: routes[url] || response({ ok: false, status: 404, contentType: 'text/plain' }),
                url: new URL(url)
            };
        },
        readLimitedArrayBuffer: async (res, maxBytes) => {
            const buffer = res._body || Buffer.alloc(0);
            if (buffer.byteLength > maxBytes) {
                throw new Error('response too large');
            }
            return buffer;
        }
    });
}

test('icon discovery validates candidates and rejects non-image URLs', async () => {
    const pageUrl = 'https://example.com/page';
    const html = `<!doctype html>
      <link rel="icon" sizes="512x512" href="/bad.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/good.png">`;
    const calls = [];
    const service = createFakeService({
        [pageUrl]: response({ body: html }),
        'https://example.com/bad.png': response({ contentType: 'text/html', body: '<p>not an icon</p>' }),
        'https://example.com/good.png': response({ contentType: 'image/png', body: 'png-bytes' })
    }, calls);

    const result = await service.discoverIcons(pageUrl);

    assert.deepEqual(result.icons, [
        'https://example.com/good.png',
        'https://icon.horse/icon/example.com'
    ]);
    assert.equal(result.status, 'ok');
    assert.equal(result.candidates[0].url, 'https://example.com/good.png');
    assert.equal(result.candidates[0].usable, true);
    assert.equal(result.candidates[0].source, 'link');
    assert.equal(result.candidates[0].score > 0, true);
    assert.equal(result.rejected.some(candidate => candidate.url === 'https://example.com/bad.png'), true);
    assert.equal(calls.includes('https://example.com/bad.png'), true);
});

test('icon discovery keeps public letter fallback when site icons are usable', async () => {
    const pageUrl = 'https://letters.example/page';
    const html = '<link rel="icon" sizes="32x32" href="/favicon.png">';
    const service = createFakeService({
        [pageUrl]: response({ body: html }),
        'https://letters.example/favicon.png': response({ contentType: 'image/png', body: 'png-bytes' })
    });

    const result = await service.discoverIcons(pageUrl);

    assert.deepEqual(result.icons, [
        'https://letters.example/favicon.png',
        'https://icon.horse/icon/letters.example'
    ]);
    assert.equal(result.candidates.at(-1).source, 'public-fallback');
});

test('icon discovery caches successful results by normalized origin', async () => {
    const pageUrl = 'https://example.com/docs/page';
    const html = '<link rel="icon" href="/favicon.png">';
    const calls = [];
    const service = createFakeService({
        [pageUrl]: response({ body: html }),
        'https://example.com/favicon.png': response({ contentType: 'image/png', body: 'png-bytes' })
    }, calls);

    const first = await service.discoverIcons(pageUrl);
    const second = await service.discoverIcons('https://example.com/other/page');

    assert.deepEqual(first.icons, [
        'https://example.com/favicon.png',
        'https://icon.horse/icon/example.com'
    ]);
    assert.deepEqual(second.icons, [
        'https://example.com/favicon.png',
        'https://icon.horse/icon/example.com'
    ]);
    assert.equal(second.cache, 'hit');
    assert.equal(calls.filter(url => url === pageUrl).length, 1);
});

test('icon discovery returns short-lived fallback icons when page fetch fails', async () => {
    const pageUrl = 'https://example.com/page';
    const service = createFakeService({
        [pageUrl]: new Error('network down')
    });

    const result = await service.discoverIcons(pageUrl);

    assert.equal(result.status, 'fallback');
    assert.deepEqual(result.icons, getFallbackIcons('example.com', 'https:'));
    assert.equal(result.candidates.every(candidate => candidate.usable === false), true);
});
