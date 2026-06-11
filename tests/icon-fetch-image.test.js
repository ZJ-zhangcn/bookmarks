const test = require('node:test');
const assert = require('node:assert/strict');

const {
    fetchPublicImage,
    fetchPublicImageAsDataUrl
} = require('../backend/services/icons/fetch-image');

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

function response({ ok = true, status = 200, contentType = 'image/png', body = 'png-bytes' } = {}) {
    const buffer = Buffer.from(body);
    return {
        ok,
        status,
        headers: headers({ 'content-type': contentType }),
        async arrayBuffer() {
            return buffer;
        }
    };
}

test('fetchPublicImage rejects non-image upstream responses', async () => {
    await assert.rejects(
        fetchPublicImage('https://example.com/not-image', {
            safeFetch: async () => response({ contentType: 'text/html', body: '<p>no</p>' })
        }),
        err => err.statusCode === 502 && /不是图片/.test(err.message)
    );
});

test('fetchPublicImage rejects oversized images', async () => {
    await assert.rejects(
        fetchPublicImage('https://example.com/large.png', {
            maxBytes: 3,
            safeFetch: async () => response({ contentType: 'image/png', body: '1234' })
        }),
        err => err.statusCode === 413 && /图片过大/.test(err.message)
    );
});

test('fetchPublicImageAsDataUrl converts image bytes to a data URL', async () => {
    const dataUrl = await fetchPublicImageAsDataUrl('https://example.com/icon.png', {
        safeFetch: async () => response({ contentType: 'image/svg+xml; charset=utf-8', body: '<svg />' })
    });

    assert.equal(dataUrl, `data:image/svg+xml;base64,${Buffer.from('<svg />').toString('base64')}`);
});
