const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../shared/icon-policy.cjs');

test('public provider fallbacks preserve Google, favicon.im, icon.horse order', () => {
    assert.deepEqual(policy.buildProviderFallbacks('example.com'), [
        'https://www.google.com/s2/favicons?domain=example.com&sz=64',
        'https://favicon.im/example.com',
        'https://icon.horse/icon/example.com'
    ]);
});

test('private and local hosts do not get public provider fallbacks', () => {
    assert.equal(policy.isPrivateOrLocalAddress('192.168.1.1'), true);
    assert.equal(policy.isPrivateOrLocalAddress('nas.local'), true);
    assert.deepEqual(policy.buildProviderFallbacks('192.168.1.1'), []);
    assert.deepEqual(policy.buildProviderFallbacks('nas.local'), []);
});

test('icon source is derived from provider and site fallback URLs', () => {
    assert.equal(policy.getIconSource('https://www.google.com/s2/favicons?domain=example.com&sz=64'), 'google');
    assert.equal(policy.getIconSource('https://favicon.im/example.com'), 'faviconim');
    assert.equal(policy.getIconSource('https://icon.horse/icon/example.com'), 'icon-horse');
    assert.equal(policy.getIconSource('https://example.com/apple-touch-icon.png'), 'apple');
    assert.equal(policy.getIconSource('https://example.com/favicon.ico'), 'favicon');
});

test('icon labels map to existing UI labels', () => {
    assert.equal(policy.getIconLabel('google'), 'Google');
    assert.equal(policy.getIconLabel('faviconim'), 'Favicon.im');
    assert.equal(policy.getIconLabel('icon-horse'), '字母');
    assert.equal(policy.getIconLabel('apple'), 'Apple');
    assert.equal(policy.getIconLabel('favicon'), '默认图标');
    assert.equal(policy.getIconLabel('manifest'), '页面图标');
});

test('apple touch icon variants share one source family', () => {
    const apple = 'https://example.com/apple-touch-icon.png';
    const precomposed = 'https://example.com/apple-touch-icon-precomposed.png';

    assert.equal(policy.getIconSourceFamily(apple), 'apple');
    assert.equal(policy.getIconSourceFamily(precomposed), 'apple');
    assert.equal(policy.isSameIconSourceFamily(apple, precomposed), true);
    assert.equal(policy.isSameIconSourceFamily(apple, 'https://example.com/favicon.ico'), false);
});

test('proxy preference hosts include existing domains and subdomains', () => {
    assert.equal(policy.shouldPreferProxyHost('github.com'), true);
    assert.equal(policy.shouldPreferProxyHost('docs.github.com'), true);
    assert.equal(policy.shouldPreferProxyHost('google.com'), true);
    assert.equal(policy.shouldPreferProxyHost('www.google.com'), true);
    assert.equal(policy.shouldPreferProxyHost('raw.githubusercontent.com'), true);
    assert.equal(policy.shouldPreferProxyHost('evilgithub.com'), false);
    assert.equal(policy.shouldPreferProxyHost('example.com'), false);
});

test('site fallbacks preserve favicon and apple touch icon order', () => {
    assert.deepEqual(policy.buildSiteFallbacks('https://example.com'), [
        'https://example.com/favicon.ico',
        'https://example.com/favicon.png',
        'https://example.com/apple-touch-icon.png',
        'https://example.com/apple-touch-icon-precomposed.png'
    ]);
});
