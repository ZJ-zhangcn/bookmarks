const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeFaviconResponse,
    createFaviconRequestGuard,
    buildLocalFaviconCandidates,
    shouldProbeBrowserFallbacks,
    mergeIconsWithLocalFallback,
    isPrivateOrLocalAddress,
    shouldUseProxyUrlForIcon
} = require('../frontend/modules/favicon-helpers.cjs');
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

test('favicon acquisition source only uses icon.horse as a public letter fallback', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const frontendFavicon = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon.js'), 'utf8');
    const backendFavicon = fs.readFileSync(path.resolve(__dirname, '../backend/routes/favicon.js'), 'utf8');
    const source = `${frontendFavicon}\n${backendFavicon}`;
    assert.equal(source.includes('google.com/s2/favicons'), false);
    assert.equal(source.includes('favicon.im'), false);
    assert.equal(source.includes('icon.horse'), true);
});

test('browser fallback candidates include icon.horse for public domain letter fallback', () => {
    const candidates = buildLocalFaviconCandidates('https://example.com/docs/page.html');
    assert.deepEqual(candidates, [
        'https://example.com/favicon.ico',
        'https://example.com/favicon.png',
        'https://example.com/apple-touch-icon.png',
        'https://example.com/apple-touch-icon-precomposed.png',
        'https://icon.horse/icon/example.com'
    ]);
    assert.equal(candidates.some(url => url.includes('google.com') || url.includes('favicon.im')), false);
});

test('browser fallback probing is limited to private/local hosts to avoid public-site console noise', () => {
    assert.equal(shouldProbeBrowserFallbacks('https://www.douyu.com/'), false);
    assert.equal(shouldProbeBrowserFallbacks('https://github.com/'), false);
    assert.equal(shouldProbeBrowserFallbacks('http://10.52.200.26:7905/'), true);
    assert.equal(shouldProbeBrowserFallbacks('http://nas.local/admin'), true);
});

test('browser fallback candidates do not include third-party services for private hosts', () => {
    const candidates = buildLocalFaviconCandidates('http://192.168.1.1/admin', []);
    assert.deepEqual(candidates, [
        'http://192.168.1.1/favicon.ico',
        'http://192.168.1.1/favicon.png',
        'http://192.168.1.1/apple-touch-icon.png',
        'http://192.168.1.1/apple-touch-icon-precomposed.png'
    ]);
    assert.equal(candidates.some(url => url.includes('google.com') || url.includes('favicon.im') || url.includes('icon.horse')), false);
});

test('mergeIconsWithLocalFallback keeps server-discovered icons before current-device fallbacks', () => {
    assert.deepEqual(
        mergeIconsWithLocalFallback(
            ['https://example.com/apple.png', 'https://example.com/favicon.ico'],
            ['https://example.com/favicon.ico', 'https://example.com/favicon.png']
        ),
        ['https://example.com/apple.png', 'https://example.com/favicon.ico', 'https://example.com/favicon.png']
    );
});

test('saved icon display prefers direct URL and only proxies public HTTP mixed-content URLs', () => {
    assert.equal(isPrivateOrLocalAddress('nas.local'), true);
    assert.equal(isPrivateOrLocalAddress('127.0.0.2'), true);
    assert.equal(isPrivateOrLocalAddress('0.0.0.0'), true);
    assert.equal(isPrivateOrLocalAddress('100.64.0.1'), true);
    assert.equal(isPrivateOrLocalAddress('100.127.255.255'), true);
    assert.equal(isPrivateOrLocalAddress('100.128.0.1'), false);
    assert.equal(isPrivateOrLocalAddress('192.168.1.10'), true);
    assert.equal(isPrivateOrLocalAddress('::'), true);
    assert.equal(isPrivateOrLocalAddress('::ffff:192.168.1.1'), true);
    assert.equal(shouldUseProxyUrlForIcon('https://github.com/favicon.ico', 'https:'), true);
    assert.equal(shouldUseProxyUrlForIcon('https://qn11.tool.lu/201711/08/002819v0Gaydtvy2P4y03G_144x144.png', 'https:'), true);
    assert.equal(shouldUseProxyUrlForIcon('http://192.168.1.10/favicon.ico', 'https:'), false);
    assert.equal(shouldUseProxyUrlForIcon('http://127.0.0.2/favicon.ico', 'https:'), false);
    assert.equal(shouldUseProxyUrlForIcon('http://example.com/favicon.ico', 'https:'), true);
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
