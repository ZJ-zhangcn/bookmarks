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

test('normalizeFaviconResponse reads structured discovery result icons', () => {
    assert.deepEqual(
        normalizeFaviconResponse({
            success: true,
            data: {
                status: 'ok',
                icons: ['https://example.com/icon.png'],
                candidates: [{ url: 'https://example.com/icon.png', usable: true }]
            }
        }),
        ['https://example.com/icon.png']
    );
});

test('normalizeFaviconResponse keeps all returned icons when only provider fallbacks remain', () => {
    assert.deepEqual(
        normalizeFaviconResponse({
            success: true,
            data: {
                status: 'fallback',
                icons: [
                    'https://www.google.com/s2/favicons?domain=placeholder.example&sz=64',
                    'https://favicon.im/placeholder.example',
                    'https://icon.horse/icon/placeholder.example'
                ],
                candidates: [
                    { url: 'https://www.google.com/s2/favicons?domain=placeholder.example&sz=64', usable: false, type: 'provider', source: 'google' },
                    { url: 'https://favicon.im/placeholder.example', usable: false, type: 'provider', source: 'faviconim' },
                    { url: 'https://icon.horse/icon/placeholder.example', usable: false, type: 'provider', source: 'icon-horse' }
                ]
            }
        }),
        [
            'https://www.google.com/s2/favicons?domain=placeholder.example&sz=64',
            'https://favicon.im/placeholder.example',
            'https://icon.horse/icon/placeholder.example'
        ]
    );
});

test('icon picker keeps returned provider options visible instead of hiding failed candidates', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/icon-picker.js'), 'utf8');

    assert.doesNotMatch(source, /data-hide-on-error/);
    assert.doesNotMatch(source, /data-hide-solid-placeholder/);
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

test('favicon acquisition source includes ordered public provider fallbacks', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const frontendFavicon = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon.js'), 'utf8');
    const iconUnified = fs.readFileSync(path.resolve(__dirname, '../backend/routes/icon-unified.js'), 'utf8');
    const discoveryService = fs.readFileSync(path.resolve(__dirname, '../backend/services/icon-discovery-service.js'), 'utf8');
    const sharedPolicy = fs.readFileSync(path.resolve(__dirname, '../shared/icon-policy.cjs'), 'utf8');
    const source = `${frontendFavicon}\n${iconUnified}\n${discoveryService}\n${sharedPolicy}`;
    assert.equal(source.includes('google.com/s2/favicons'), true);
    assert.equal(source.includes('favicon.im'), true);
    assert.equal(source.includes('icon.horse'), true);
});

test('frontend favicon helpers reuse shared icon policy', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const helpersSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon-helpers.cjs'), 'utf8');
    const utilsSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/utils.js'), 'utf8');

    assert.match(helpersSource, /shared\/icon-policy\.cjs/);
    assert.match(utilsSource, /shared\/icon-policy\.cjs/);
});

test('browser fallback candidates include public providers in quality fallback order', () => {
    const candidates = buildLocalFaviconCandidates('https://example.com/docs/page.html');
    assert.deepEqual(candidates, [
        'https://example.com/favicon.ico',
        'https://example.com/favicon.png',
        'https://example.com/apple-touch-icon.png',
        'https://example.com/apple-touch-icon-precomposed.png',
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        'https://favicon.im/example.com',
        'https://icon.horse/icon/example.com'
    ]);
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

test('engine auto icon fetch uses backend favicon discovery for public URLs', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon.js'), 'utf8');

    const start = source.indexOf('export async function fetchEngineIcon()');
    const end = source.indexOf('export function updateEngineIconPreviewUrl()');
    const fetchEngineIconSource = source.slice(start, end);

    assert.match(source, /from '\.\/icon-client\.js'/);
    assert.match(fetchEngineIconSource, /discoverIcons\(url\)/);
    assert.match(fetchEngineIconSource, /if \(isPrivateOrLocalAddress\(domain\)\)/);
    assert.doesNotMatch(fetchEngineIconSource, /fetch\(`\$\{state\.API_BASE\}\/api\/favicon`/);
});
