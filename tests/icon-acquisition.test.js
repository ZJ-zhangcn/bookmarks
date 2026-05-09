const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeFaviconResponse, createFaviconRequestGuard } = require('../frontend/modules/favicon-helpers.cjs');
const { resolveIconHref, selectBestIcons } = require('../backend/utils/icon-discovery');

test('normalizeFaviconResponse reads standard success(data) envelope', () => {
    assert.deepEqual(normalizeFaviconResponse({ success: true, data: ['https://example.com/icon.png'] }), ['https://example.com/icon.png']);
});

test('favicon request guard ignores stale requests', () => {
    const guard = createFaviconRequestGuard();
    const first = guard.start('https://a.example');
    const second = guard.start('https://b.example');
    assert.equal(guard.isCurrent(first, 'https://a.example'), false);
    assert.equal(guard.isCurrent(second, 'https://b.example'), true);
});

test('resolveIconHref resolves relative icon URLs against page URL', () => {
    assert.equal(
        resolveIconHref('assets/icon.png', 'https://example.com/docs/page.html'),
        'https://example.com/docs/assets/icon.png'
    );
    assert.equal(
        resolveIconHref('../favicon.ico', 'https://example.com/docs/page.html'),
        'https://example.com/favicon.ico'
    );
});

test('selectBestIcons prefers larger apple/icon candidates and includes manifest icons', async () => {
    const html = `<!doctype html>
      <link rel="icon" sizes="16x16" href="/favicon-16.png">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
      <link rel="manifest" href="/site.webmanifest">
      <meta property="og:image" content="/og.png">`;
    const manifest = {
        icons: [
            { src: '/manifest-48.png', sizes: '48x48', type: 'image/png' },
            { src: '/manifest-192.png', sizes: '192x192', type: 'image/png' }
        ]
    };
    const icons = await selectBestIcons(html, 'https://example.com/docs/page.html', async url => {
        assert.equal(url, 'https://example.com/site.webmanifest');
        return manifest;
    });
    assert.deepEqual(icons.slice(0, 4), [
        'https://example.com/manifest-192.png',
        'https://example.com/apple.png',
        'https://example.com/manifest-48.png',
        'https://example.com/favicon-16.png'
    ]);
    assert.ok(icons.includes('https://example.com/og.png'));
});
