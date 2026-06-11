const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

test('frontend favicon module delegates API normalization to icon-client', () => {
    const favicon = read('frontend/modules/favicon.js');
    const iconClient = read('frontend/modules/icon-client.js');

    assert.match(iconClient, /export async function discoverIcons/);
    assert.match(iconClient, /export function normalizeIconCandidates/);
    assert.match(favicon, /from '\.\/icon-client\.js'/);
    assert.doesNotMatch(favicon, /\$\{state\.API_BASE\}\/api\/favicon/);
});

test('frontend icon picker owns candidate rendering and render.js stays compatible', () => {
    const picker = read('frontend/modules/icon-picker.js');
    const render = read('frontend/modules/render.js');

    assert.match(picker, /export function renderIconSelection/);
    assert.match(picker, /export function renderLocalIconSelection/);
    assert.match(picker, /export function getSelectedIconUrl/);
    assert.match(picker, /function getVisibleIconOptions/);
    assert.match(picker, /iconPolicy\.getIconSource/);
    assert.match(render, /from '\.\/icon-picker\.js'/);
    assert.doesNotMatch(render, /function renderIconPreviewImage/);
});

test('frontend icon display owns saved-icon URL conversion and image HTML', () => {
    const display = read('frontend/modules/icon-display.js');
    const render = read('frontend/modules/render.js');
    const search = read('frontend/modules/search.js');
    const api = read('frontend/modules/api.js');

    assert.match(display, /export function toIconDisplayUrl/);
    assert.match(display, /export function iconImageHtml/);
    assert.match(display, /export function bindIconImageFallbacks/);
    assert.match(render, /from '\.\/icon-display\.js'/);
    assert.match(search, /from '\.\/icon-display\.js'/);
    assert.match(api, /from '\.\/icon-display\.js'/);
});
