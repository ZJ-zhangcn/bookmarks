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

function createFakeService(routes, calls = [], overrides = {}) {
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
        },
        ...overrides
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
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        'https://favicon.im/example.com',
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
        'https://www.google.com/s2/favicons?domain=letters.example&sz=64',
        'https://favicon.im/letters.example',
        'https://icon.horse/icon/letters.example'
    ]);
    assert.equal(result.candidates.at(-1).source, 'public-fallback');
});

test('icon discovery returns only the highest-quality site icon plus public letter fallback', async () => {
    const pageUrl = 'https://multi.example/page';
    const html = `<!doctype html>
      <link rel="icon" sizes="16x16" href="/icon-16.png">
      <link rel="icon" sizes="64x64" href="/icon-64.png">
      <link rel="apple-touch-icon" sizes="256x256" href="/icon-256.png">`;
    const service = createFakeService({
        [pageUrl]: response({ body: html }),
        'https://multi.example/icon-16.png': response({ contentType: 'image/png', body: 'small' }),
        'https://multi.example/icon-64.png': response({ contentType: 'image/png', body: 'medium' }),
        'https://multi.example/icon-256.png': response({ contentType: 'image/png', body: 'large' })
    });

    const result = await service.discoverIcons(pageUrl);

    assert.deepEqual(result.icons, [
        'https://multi.example/icon-256.png',
        'https://www.google.com/s2/favicons?domain=multi.example&sz=64',
        'https://favicon.im/multi.example',
        'https://icon.horse/icon/multi.example'
    ]);
    assert.deepEqual(
        result.candidates.filter(candidate => candidate.source === 'link').map(candidate => candidate.url),
        ['https://multi.example/icon-256.png']
    );
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
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        'https://favicon.im/example.com',
        'https://icon.horse/icon/example.com'
    ]);
    assert.deepEqual(second.icons, [
        'https://example.com/favicon.png',
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        'https://favicon.im/example.com',
        'https://icon.horse/icon/example.com'
    ]);
    assert.equal(second.cache, 'hit');
    assert.equal(calls.filter(url => url === pageUrl).length, 1);
});

test('icon discovery returns public provider fallbacks when public page fetch fails', async () => {
    const pageUrl = 'https://example.com/page';
    const service = createFakeService({
        [pageUrl]: new Error('network down')
    });

    const result = await service.discoverIcons(pageUrl);

    assert.equal(result.status, 'fallback');
    assert.deepEqual(result.icons, [
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        'https://favicon.im/example.com',
        'https://icon.horse/icon/example.com'
    ]);
    assert.equal(result.candidates.every(candidate => candidate.usable === false), true);
});

test('icon discovery keeps same-origin fallbacks for private page fetch failures', async () => {
    const pageUrl = 'http://router.local/page';
    const service = createFakeService({
        [pageUrl]: new Error('network down')
    }, [], {
        isPrivateOrLocalAddress: () => true
    });

    const result = await service.discoverIcons(pageUrl);

    assert.equal(result.status, 'fallback');
    assert.deepEqual(result.icons, getFallbackIcons('router.local', 'http:', {
        hostname: 'router.local',
        isPrivateOrLocalAddressFn: () => true
    }));
    assert.equal(result.candidates.every(candidate => candidate.usable === false), true);
});
