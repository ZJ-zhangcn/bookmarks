const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveWebsiteUrl, buildWebSearchUrl } = require('../frontend/modules/search-helpers.cjs');

test('resolveWebsiteUrl recognizes HTTP and HTTPS links with paths, queries and fragments', () => {
    const cases = [
        ['https://example.com', 'https://example.com/'],
        [' http://example.com:8080/docs?q=test#section ', 'http://example.com:8080/docs?q=test#section'],
        ['HTTPS://EXAMPLE.COM/docs', 'https://example.com/docs'],
        ['http://localhost:3000', 'http://localhost:3000/'],
        ['http://intranet/dashboard', 'http://intranet/dashboard']
    ];
    for (const [input, expected] of cases) {
        assert.equal(resolveWebsiteUrl(input), expected, input);
    }
});

test('resolveWebsiteUrl defaults bare domains and local addresses to HTTPS', () => {
    const cases = [
        ['example.com', 'https://example.com/'],
        ['www.example.com/docs?q=test#section', 'https://www.example.com/docs?q=test#section'],
        ['example.com:8443/docs', 'https://example.com:8443/docs'],
        ['//example.com/docs', 'https://example.com/docs'],
        ['例子.中国/路径', 'https://xn--fsqu00a.xn--fiqs8s/%E8%B7%AF%E5%BE%84'],
        ['localhost:3000', 'https://localhost:3000/'],
        ['192.168.1.1:8080/settings', 'https://192.168.1.1:8080/settings'],
        ['[::1]:3000', 'https://[::1]:3000/']
    ];
    for (const [input, expected] of cases) {
        assert.equal(resolveWebsiteUrl(input), expected, input);
    }
});

test('resolveWebsiteUrl rejects keywords, malformed addresses and non-web protocols', () => {
    const inputs = [
        '', '  ', '书签导航', 'hello world', 'example.com 教程', 'user@example.com',
        '123', '1.2', 'https://', 'https://example.com:99999', '256.1.1.1',
        'javascript:alert(1)', 'javascript://example.com', 'data:text/html,<h1>test</h1>',
        'file:///tmp/test.html', 'ftp://example.com', 'mailto:user@example.com',
        'https://user:password@example.com', 'example.com\\docs'
    ];
    for (const input of inputs) {
        assert.equal(resolveWebsiteUrl(input), null, input);
    }
});

test('buildWebSearchUrl opens website links directly and encodes ordinary search terms', () => {
    const engineUrl = 'https://www.google.com/search?q=';
    assert.equal(buildWebSearchUrl('example.com/docs?q=test#section', engineUrl), 'https://example.com/docs?q=test#section');
    assert.equal(buildWebSearchUrl('http://example.com', engineUrl), 'http://example.com/');
    for (const query of ['  书签导航 & 教程  ', 'example.com 教程', 'user@example.com', 'javascript:alert(1)']) {
        assert.equal(buildWebSearchUrl(query, engineUrl), engineUrl + encodeURIComponent(query.trim()));
    }
    assert.equal(buildWebSearchUrl('  ', engineUrl), null);
});
