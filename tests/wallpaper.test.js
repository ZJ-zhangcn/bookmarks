const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function importUtilsModule(testName, protocol = 'https:') {
    global.window = { location: { origin: 'https://bookmarks.example', protocol } };
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/utils.js')).href;
    return import(`${moduleUrl}?${testName}-${Date.now()}`);
}

test('toSafeImageUrl does not proxy HTTPS wallpaper URLs when preferProxyHosts is disabled', async () => {
    const { toSafeImageUrl } = await importUtilsModule('wallpaper-direct');
    const url = 'https://raw.githubusercontent.com/ZJ-zhangcn/wallpapers/refs/heads/main/image002.jpg';

    assert.equal(toSafeImageUrl(url, { preferProxyHosts: false }), url);
});

test('toSafeImageUrl still proxies HTTP images on HTTPS pages for mixed-content safety', async () => {
    const { toSafeImageUrl } = await importUtilsModule('wallpaper-http-proxy');
    const url = 'http://example.com/wallpaper.jpg';

    assert.equal(
        toSafeImageUrl(url, { preferProxyHosts: false }),
        'https://bookmarks.example/api/proxy-icon?url=http%3A%2F%2Fexample.com%2Fwallpaper.jpg'
    );
});
