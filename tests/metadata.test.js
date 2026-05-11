const test = require('node:test');
const assert = require('node:assert/strict');

const { extractTitle, decodeHtmlEntities } = require('../backend/routes/metadata');

test('extractTitle prefers og:title and decodes whitespace/entities', () => {
    const html = `<!doctype html><html><head>
        <title>Fallback &amp; Title</title>
        <meta property="og:title" content=" Example &amp; Site ">
    </head></html>`;
    assert.equal(extractTitle(html), 'Example & Site');
});

test('extractTitle falls back to title element', () => {
    assert.equal(extractTitle('<title> Hello\nWorld &quot;Docs&quot; </title>'), 'Hello World "Docs"');
});

test('decodeHtmlEntities handles numeric entities', () => {
    assert.equal(decodeHtmlEntities('A &#38; B &#x26; C'), 'A & B & C');
});
