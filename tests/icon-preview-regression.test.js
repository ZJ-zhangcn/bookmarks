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

test('auto icon renderer preserves public letter fallback in visible candidates', () => {
    const renderSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/render.js'), 'utf8');

    assert.match(renderSource, /function getVisibleIconOptions/);
    assert.match(renderSource, /icon\.horse/);
    assert.doesNotMatch(renderSource, /icons\.slice\(0,\s*6\)\.map/);
});

test('auto icon renderer uses clear labels and local letter fallback previews', () => {
    const renderSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/render.js'), 'utf8');

    assert.match(renderSource, /function getLetterFallbackText/);
    assert.match(renderSource, /function isSameIconSourceFamily/);
    assert.match(renderSource, /页面图标/);
    assert.match(renderSource, /默认图标/);
    assert.match(renderSource, /class="icon-option-fallback icon-letter-fallback"/);
    assert.doesNotMatch(renderSource, /label: '网站'/);
});

test('auto icon renderer hides failed favicon service candidates', () => {
    const renderSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/render.js'), 'utf8');
    const utilsSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/utils.js'), 'utf8');

    assert.match(renderSource, /function shouldHideIconOnError/);
    assert.match(renderSource, /data-hide-on-error="true"/);
    assert.match(utilsSource, /dataset\.hideOnError/);
    assert.match(utilsSource, /hideIconOption\(parent\)/);
});

test('auto icon renderer hides solid google favicon placeholders', () => {
    const renderSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/render.js'), 'utf8');
    const faviconSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon.js'), 'utf8');
    const utilsSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/utils.js'), 'utf8');

    assert.match(renderSource, /function shouldHideSolidPlaceholder/);
    assert.match(renderSource, /data-hide-solid-placeholder="true"/);
    assert.match(faviconSource, /function localIconPreviewImage/);
    assert.match(faviconSource, /data-hide-solid-placeholder="true"/);
    assert.match(utilsSource, /function isSolidPlaceholderImage/);
    assert.match(utilsSource, /getImageData/);
    assert.match(utilsSource, /function selectNextVisibleIconOption/);
    assert.match(utilsSource, /img\.complete/);
});

test('auto icon renderer keeps service fallbacks visible but marks weak providers for automatic hiding', () => {
    const renderSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/render.js'), 'utf8');
    const faviconSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon.js'), 'utf8');

    assert.match(renderSource, /function getVisibleIconOptions/);
    assert.match(renderSource, /包括 Google、favicon\.im、icon\.horse/);
    assert.match(renderSource, /function shouldHideIconOnError/);
    assert.match(renderSource, /data-hide-on-error="true"/);
    assert.match(renderSource, /data-hide-solid-placeholder="true"/);
    assert.doesNotMatch(renderSource, /filter\(icon => !isGoogleFaviconService\(icon\)\)/);

    assert.match(faviconSource, /function getVisibleLocalIconOptions/);
    assert.match(faviconSource, /return icons\.slice\(0, limit\)/);
    assert.match(faviconSource, /data-hide-on-error="true"/);
    assert.match(faviconSource, /data-hide-solid-placeholder="true"/);
});
