const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const loadStickyModule = () => import(`data:text/javascript;base64,${Buffer.from(read('frontend/modules/web-search.js')).toString('base64')}`);

test('homepage keeps a single web search form outside the scrolling header', () => {
    const html = read('frontend/index.html');
    assert.equal((html.match(/id="webSearchForm"/g) || []).length, 1);
    assert.equal((html.match(/id="webSearchInput"/g) || []).length, 1);
    assert.match(html, /<\/header>\s*<!--[^>]+-->\s*<div class="web-search-container" id="webSearchContainer">/);
    assert.match(html, /id="webSearchForm" role="search" aria-label="网页搜索或网址直达"/);
    assert.doesNotMatch(html, /id="(?:searchInput|searchClear|bookmarkSearch\w*|bookmarkFilterShow)"|书签过滤输入框/);
});

test('bookmark search is removed from event wiring, state and personalization', () => {
    for (const file of ['events', 'dom', 'settings', 'state', 'render', 'batch']) {
        const source = read(`frontend/modules/${file}.js`);
        assert.doesNotMatch(source, /bookmarkSearch|bookmarkFilterShow|currentSearch|setCurrentSearch|DOM\.searchInput|DOM\.searchClear|DOM\.searchContainer/);
    }
    assert.equal(fs.existsSync(path.join(root, 'frontend/modules/search.js')), false);
    assert.doesNotMatch(read('frontend/modules/events.js'), /\.key\s*===\s*'f'/);
    assert.match(read('frontend/modules/events.js'), /initWebSearchSticky\(DOM\.webSearchContainer\)/);
    assert.match(read('frontend/modules/personalization.js'), /DOM\.webSearchContainer\.style\.display = config\.searchBarShow !== false \? '' : 'none'/);
});

test('sticky styles reserve space for categories and fixed actions without legacy search CSS', () => {
    const css = read('frontend/index.css');
    assert.match(css, /\.web-search-container\s*\{[^}]*position:\s*sticky;[^}]*top:\s*calc\(12px \+ env\(safe-area-inset-top\)\);[^}]*z-index:\s*200;/);
    assert.match(css, /\.category-header\s*\{[^}]*top:\s*var\(--web-search-offset, 0px\)/);
    assert.match(css, /\.category-section\s*\{[^}]*scroll-margin-top:\s*var\(--web-search-offset, 0px\)/);
    assert.match(css, /@media \(max-width: 960px\)\s*\{(?:\s*\/\*[\s\S]*?\*\/)?\s*\.web-search-container\.is-stuck\s*\{[^}]*128px/);
    assert.match(css, /\.web-search-input\s*\{[^}]*min-width:\s*0;/);
    assert.match(css, /\.web-search-container\s*\{[^}]*transition:[^}]*width/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.web-search-container\s*\{[^}]*transition:\s*none/);
    assert.doesNotMatch(css, /\.bookmark-search-|\.search-result-|\.search-container\b|\.search-input\b|\.search-clear\b/);
});

async function withStickyLayout(hasObserver, run) {
    const names = ['window', 'getComputedStyle', 'ResizeObserver'];
    const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const properties = new Map();
    const classes = new Set();
    let height = 56;
    let top = '12px';
    let marginBottom = '16px';
    let rectTop = 200;
    let notify;
    let resize;
    let scroll;
    let observed;
    const page = { style: { setProperty(name, value) { properties.set(name, value); } } };
    const container = {
        closest(selector) { assert.equal(selector, '.container'); return page; },
        getBoundingClientRect() { return { height, top: rectTop }; },
        classList: {
            toggle(name, force) {
                if (force) classes.add(name);
                else classes.delete(name);
            }
        }
    };

    try {
        globalThis.getComputedStyle = node => {
            assert.equal(node, container);
            return { top, marginBottom };
        };
        globalThis.window = {
            addEventListener(event, callback) {
                if (event === 'resize') resize = callback;
                else if (event === 'scroll') scroll = callback;
                else assert.fail(`unexpected event ${event}`);
            }
        };
        if (hasObserver) {
            globalThis.ResizeObserver = class {
                constructor(callback) { notify = callback; }
                observe(node) { observed = node; }
            };
            window.ResizeObserver = globalThis.ResizeObserver;
        }
        const { initWebSearchSticky } = await loadStickyModule();
        initWebSearchSticky(container);
        await run({
            properties,
            classes,
            get observed() { return observed; },
            container,
            notify: () => notify(),
            resize: () => resize(),
            scroll: () => scroll(),
            setLayout(nextHeight, nextTop = top, nextMargin = marginBottom, nextRectTop = rectTop) {
                height = nextHeight;
                top = nextTop;
                marginBottom = nextMargin;
                rectTop = nextRectTop;
            }
        });
    } finally {
        for (const name of names) {
            const descriptor = originals.get(name);
            if (descriptor) Object.defineProperty(globalThis, name, descriptor);
            else delete globalThis[name];
        }
    }
}

test('sticky offsets follow actual height, hidden state and responsive spacing', async () => {
    await withStickyLayout(true, layout => {
        assert.equal(layout.observed, layout.container);
        assert.equal(layout.properties.get('--web-search-offset'), '84px');
        assert.equal(layout.classes.has('is-stuck'), false);
        layout.setLayout(0);
        layout.notify();
        assert.equal(layout.properties.get('--web-search-offset'), '0px');
        assert.equal(layout.classes.has('is-stuck'), false);
        layout.setLayout(64, '20px', '8px');
        layout.resize();
        assert.equal(layout.properties.get('--web-search-offset'), '92px');
    });
});

test('is-stuck toggles only while the bar is pinned to its sticky top', async () => {
    await withStickyLayout(true, layout => {
        assert.equal(layout.classes.has('is-stuck'), false);
        layout.setLayout(56, '12px', '16px', 200);
        layout.scroll();
        assert.equal(layout.classes.has('is-stuck'), false);
        layout.setLayout(56, '12px', '16px', 12);
        layout.scroll();
        assert.equal(layout.classes.has('is-stuck'), true);
        layout.setLayout(56, '12px', '16px', -40);
        layout.scroll();
        assert.equal(layout.classes.has('is-stuck'), true);
        layout.setLayout(0);
        layout.scroll();
        assert.equal(layout.classes.has('is-stuck'), false);
    });
});

test('sticky layout falls back to window resize when ResizeObserver is unavailable', async () => {
    await withStickyLayout(false, layout => {
        assert.equal(layout.observed, undefined);
        assert.equal(layout.properties.get('--web-search-offset'), '84px');
        layout.setLayout(0);
        layout.resize();
        assert.equal(layout.properties.get('--web-search-offset'), '0px');
    });
});

test('sticky initialization tolerates a missing search container', async () => {
    const { initWebSearchSticky } = await loadStickyModule();
    assert.doesNotThrow(() => initWebSearchSticky(null));
});
