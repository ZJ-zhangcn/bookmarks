const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

test('auto icon candidates are not removed wholesale when preview images fail', () => {
    const source = read('frontend/modules/utils.js');

    assert.equal(
        source.includes('img.parentElement?.remove()'),
        false,
        'failed candidate images must not remove the whole candidate wrapper/list'
    );
    assert.match(source, /classList\.contains\('icon-option-wrap'\)/);
    assert.match(source, /icon-option-fallback/);
});

test('auto icon renderer marks and clears candidate state explicitly', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const faviconSource = read('frontend/modules/favicon.js');

    assert.match(pickerSource, /dataset\.hasCandidates\s*=\s*'true'/);
    assert.match(pickerSource, /delete container\.dataset\.hasCandidates/);
    assert.match(faviconSource, /clearIconCandidates/);
});

test('auto icon renderer preserves public letter fallback in visible candidates', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');

    assert.match(pickerSource, /function getVisibleIconOptions/);
    assert.match(pickerSource, /iconPolicy\.getIconSource/);
    assert.match(pickerSource, /icon-horse/);
    assert.doesNotMatch(pickerSource, /icons\.slice\(0,\s*6\)\.map/);
});

test('auto icon renderer and local favicon previews reuse shared icon policy', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const helpersSource = read('frontend/modules/favicon-helpers.cjs');
    const faviconSource = read('frontend/modules/favicon.js');

    assert.match(pickerSource, /shared\/icon-policy\.cjs/);
    assert.match(helpersSource, /shared\/icon-policy\.cjs/);
    assert.match(faviconSource, /from '\.\/icon-client\.js'/);
});

test('auto icon renderer uses clear labels and local letter fallback previews', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const policySource = read('shared/icon-policy.cjs');
    const source = `${pickerSource}\n${policySource}`;

    assert.match(pickerSource, /function getLetterFallbackText/);
    assert.match(pickerSource, /function isSameIconSourceFamily/);
    assert.match(source, /页面图标/);
    assert.match(source, /默认图标/);
    assert.match(pickerSource, /class="icon-option-fallback icon-letter-fallback"/);
    assert.doesNotMatch(pickerSource, /label: '网站'/);
});

test('auto icon renderer keeps failed favicon service candidates visible', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const utilsSource = read('frontend/modules/utils.js');

    assert.match(pickerSource, /function renderIconPreviewImage/);
    assert.match(pickerSource, /data-remove-on-error="true"/);
    assert.doesNotMatch(pickerSource, /data-hide-on-error="true"/);
    assert.match(utilsSource, /icon-option-error/);
    assert.match(utilsSource, /icon-option-fallback/);
});

test('auto icon renderer does not hide solid provider placeholders', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const utilsSource = read('frontend/modules/utils.js');

    assert.match(pickerSource, /function renderIconPreviewImage/);
    assert.doesNotMatch(pickerSource, /data-hide-solid-placeholder="true"/);
    assert.match(utilsSource, /function isSolidPlaceholderImage/);
    assert.match(utilsSource, /getImageData/);
    assert.match(utilsSource, /img\.complete/);
});

test('auto icon renderer keeps service fallbacks visible without automatic hiding markers', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');

    assert.match(pickerSource, /function getVisibleIconOptions/);
    assert.doesNotMatch(pickerSource, /iconPolicy\.shouldHideIconOnError/);
    assert.doesNotMatch(pickerSource, /function shouldHideIconOnError/);
    assert.doesNotMatch(pickerSource, /data-hide-on-error="true"/);
    assert.doesNotMatch(pickerSource, /data-hide-solid-placeholder="true"/);
    assert.doesNotMatch(pickerSource, /filter\(icon => !isGoogleFaviconService\(icon\)\)/);

    assert.match(pickerSource, /function getVisibleLocalIconOptions/);
    assert.match(pickerSource, /return icons\.slice\(0, limit\)/);
});

test('auto icon letter fallback remains selectable and saveable', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const bookmarkSource = read('frontend/modules/bookmark.js');

    assert.match(pickerSource, /icon-single[\s\S]*data-url/);
    assert.match(pickerSource, /'\.icon-single\[data-url\]'/);
    assert.match(bookmarkSource, /getSelectedIconUrl/);
    assert.match(bookmarkSource, /getSelectedIconUrl\(DOM\.iconPreviewAuto\)/);
});

test('auto icon selected candidate is visibly and accessibly marked', () => {
    const pickerSource = read('frontend/modules/icon-picker.js');
    const css = read('frontend/index.css');

    assert.match(pickerSource, /aria-pressed="\$\{idx === 0 \? 'true' : 'false'\}"/);
    assert.match(pickerSource, /setAttribute\('aria-pressed', 'true'\)/);
    assert.match(css, /\.icon-option-wrap\.selected::after\s*{[\s\S]*content:\s*'✓'/);
    assert.match(css, /\.icon-option-wrap\.selected\s*{[\s\S]*box-shadow:[\s\S]*0 0 0 2px/);
    assert.match(css, /#bookmarkModal \.icon-option-wrap\.selected,[\s\S]*background-image:[\s\S]*!important;[\s\S]*border-color:\s*var\(--primary\) !important;[\s\S]*box-shadow:[\s\S]*!important/);
});
