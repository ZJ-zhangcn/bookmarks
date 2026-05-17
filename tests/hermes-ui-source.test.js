const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('Hermes console has a fixed entry button and modal DOM', () => {
    const html = read('frontend/index.html');

    assert.match(html, /id="hermesBtn"/);
    assert.match(html, /id="hermesModal"/);
    assert.match(html, /id="hermesQuestion"/);
    assert.match(html, /id="hermesRunBtn"/);
});

test('server monitor cards expose Hermes service diagnosis action', () => {
    const render = read('frontend/modules/render.js');
    const bookmark = read('frontend/modules/bookmark.js');

    assert.match(render, /server-diagnose-btn/);
    assert.match(render, /data-action="hermes-service-diagnose"/);
    assert.match(bookmark, /openServiceDiagnoseFromElement/);
});

test('Hermes console styles render result, status and diagnosis affordances', () => {
    const css = read('frontend/index.css');

    assert.match(css, /\.hermes-console/);
    assert.match(css, /\.server-diagnose-btn/);
    assert.match(css, /\.hermes-result\.succeeded/);
});
