const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('auto icon candidates are not removed wholesale when preview images fail', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/utils.js'), 'utf8');

    assert.equal(
        source.includes('img.parentElement?.remove()'),
        false,
        'failed candidate images must not remove the whole candidate wrapper/list'
    );
    assert.match(source, /classList\.contains\('icon-option-wrap'\)/);
    assert.match(source, /icon-option-fallback/);
});

test('auto icon renderer marks and clears candidate state explicitly', () => {
    const renderSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/render.js'), 'utf8');
    const faviconSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon.js'), 'utf8');

    assert.match(renderSource, /dataset\.hasCandidates\s*=\s*'true'/);
    assert.match(renderSource, /delete DOM\.iconPreviewAuto\.dataset\.hasCandidates/);
    assert.match(faviconSource, /dataset\.hasCandidates\s*=\s*'true'/);
    assert.match(faviconSource, /delete DOM\.iconPreviewAuto\.dataset\.hasCandidates/);
});
