const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

function createClassList() {
    const values = new Set();
    return {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name)
    };
}

function createFocusable(document, id) {
    const attributes = new Map();
    return {
        id,
        value: '',
        innerHTML: '',
        style: {},
        disabled: false,
        isConnected: true,
        focusCount: 0,
        focus() {
            this.focusCount += 1;
            document.activeElement = this;
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) || null;
        },
        closest: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
}

function createBookmarkSearchFixture() {
    const elements = new Map();
    const document = {
        activeElement: null,
        body: { style: {} },
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const trigger = createFocusable(document, 'bookmarkSearchBtn');
    const input = createFocusable(document, 'bookmarkSearchInput');
    const close = createFocusable(document, 'bookmarkSearchClose');
    const results = createFocusable(document, 'bookmarkSearchResults');
    const overlay = createFocusable(document, 'bookmarkSearchOverlay');
    const bookmarkModal = createFocusable(document, 'bookmarkModal');
    const confirmOverlay = createFocusable(document, 'confirmOverlay');
    overlay.classList = createClassList();
    bookmarkModal.classList = createClassList();
    confirmOverlay.classList = createClassList();
    const focusables = [input, close];
    const panel = {
        querySelectorAll: () => focusables,
        contains: element => focusables.includes(element)
    };
    overlay.querySelector = selector => selector === '.bookmark-search-panel' ? panel : null;

    for (const element of [trigger, input, close, results, overlay, bookmarkModal, confirmOverlay]) {
        elements.set(element.id, element);
    }

    return { document, trigger, input, close, results, overlay, bookmarkModal, confirmOverlay };
}

async function loadBookmarkSearch(testName, fixture) {
    global.window = {
        location: { origin: 'https://bookmarks.example', protocol: 'https:' },
        open: () => {}
    };
    global.document = fixture.document;
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    global.CSS = { escape: value => String(value) };
    global.getComputedStyle = element => ({ zIndex: element?.style?.zIndex || '0' });
    global.requestAnimationFrame = callback => callback();

    const domUrl = pathToFileURL(path.join(root, 'frontend/modules/dom.js')).href;
    const searchUrl = pathToFileURL(path.join(root, 'frontend/modules/search.js')).href;
    const stateUrl = pathToFileURL(path.join(root, 'frontend/modules/state.js')).href;
    const domModule = await import(domUrl);
    domModule.cacheDOMElements();
    const state = await import(stateUrl);
    const search = await import(`${searchUrl}?${testName}-${Date.now()}`);
    return { search, state };
}

test('opening and closing bookmark search focuses synchronously, restores focus, and clears transient state', async () => {
    const fixture = createBookmarkSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    const { search } = await loadBookmarkSearch('focus-lifecycle', fixture);

    search.openBookmarkSearch();

    assert.equal(fixture.overlay.classList.contains('open'), true);
    assert.equal(fixture.overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(fixture.document.body.style.overflow, 'hidden');
    assert.equal(fixture.document.activeElement, fixture.input);

    fixture.input.value = 'restore me';
    fixture.results.innerHTML = '<a>result</a>';
    search.closeBookmarkSearch();

    assert.equal(fixture.overlay.classList.contains('open'), false);
    assert.equal(fixture.overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(fixture.input.value, '');
    assert.equal(fixture.results.innerHTML, '');
    assert.equal(fixture.document.activeElement, fixture.trigger);
});

test('closing bookmark search preserves scroll locking for an underlying bookmark modal', async () => {
    const fixture = createBookmarkSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    fixture.bookmarkModal.classList.add('open');
    const { search } = await loadBookmarkSearch('preserve-lock', fixture);

    search.openBookmarkSearch();
    search.closeBookmarkSearch();

    assert.equal(fixture.document.body.style.overflow, 'hidden');
});

test('bookmark search matches a bookmark tag and renders the match', async () => {
    const fixture = createBookmarkSearchFixture();
    const { search, state } = await loadBookmarkSearch('tag-match', fixture);
    state.setCategories([{ id: 'work', name: '工作' }]);
    state.setBookmarks([{
        id: 'bookmark-1',
        category_id: 'work',
        name: 'Project board',
        url: 'https://example.com/project',
        description: 'Planning workspace',
        tags: ['roadmap', 'team'],
        icon: '🔖'
    }]);
    fixture.input.value = 'roadmap';

    search.handleBookmarkSearch();

    assert.match(fixture.results.innerHTML, /Project board/);
    assert.match(fixture.results.innerHTML, /标签/);
    assert.match(fixture.results.innerHTML, /roadmap/i);
});

test('bookmark search does not trap Tab when confirmation is visually above it', async () => {
    const fixture = createBookmarkSearchFixture();
    fixture.overlay.style.zIndex = '1200';
    fixture.confirmOverlay.style.zIndex = '1300';
    fixture.confirmOverlay.classList.add('open');
    const { search } = await loadBookmarkSearch('foreground-confirmation', fixture);

    search.openBookmarkSearch();
    fixture.document.activeElement = fixture.close;
    let prevented = false;
    search.handleBookmarkSearchFocusTrap({
        key: 'Tab',
        shiftKey: false,
        preventDefault() { prevented = true; }
    });

    assert.equal(prevented, false);
    assert.equal(fixture.document.activeElement, fixture.close);
});

test('bookmark search does not open behind a foreground confirmation', async () => {
    const fixture = createBookmarkSearchFixture();
    fixture.overlay.style.zIndex = '1200';
    fixture.confirmOverlay.style.zIndex = '1300';
    fixture.confirmOverlay.classList.add('open');
    const { search } = await loadBookmarkSearch('foreground-confirmation-open', fixture);

    search.openBookmarkSearch();

    assert.equal(fixture.overlay.classList.contains('open'), false);
    assert.notEqual(fixture.document.activeElement, fixture.input);
});
