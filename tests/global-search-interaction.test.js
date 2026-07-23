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

function createGlobalSearchFixture() {
    const elements = new Map();
    const document = {
        activeElement: null,
        body: { style: {} },
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    const trigger = createFocusable(document, 'globalSearchTrigger');
    const input = createFocusable(document, 'globalSearchInput');
    const close = createFocusable(document, 'globalSearchClose');
    const results = createFocusable(document, 'globalSearchResults');
    const overlay = createFocusable(document, 'globalSearchOverlay');
    const bookmarkModal = createFocusable(document, 'bookmarkModal');
    overlay.classList = createClassList();
    bookmarkModal.classList = createClassList();
    const focusables = [input, close];
    const panel = {
        querySelectorAll: () => focusables,
        contains: element => focusables.includes(element)
    };
    overlay.querySelector = selector => selector === '.global-search-panel' ? panel : null;

    for (const element of [trigger, input, close, results, overlay, bookmarkModal]) {
        elements.set(element.id, element);
    }

    return {
        document,
        trigger,
        input,
        close,
        results,
        overlay,
        bookmarkModal,
        addResultButton(id = 'dynamicResult') {
            const button = createFocusable(document, id);
            focusables.push(button);
            return button;
        }
    };
}

async function loadGlobalSearch(testName, fixture) {
    global.window = {
        location: { origin: 'https://bookmarks.example', protocol: 'https:' },
        open: () => {}
    };
    global.document = fixture.document;
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    global.CSS = { escape: value => String(value) };
    global.requestAnimationFrame = callback => callback();

    const domUrl = pathToFileURL(path.join(root, 'frontend/modules/dom.js')).href;
    const searchUrl = pathToFileURL(path.join(root, 'frontend/modules/search.js')).href;
    const domModule = await import(domUrl);
    domModule.cacheDOMElements();
    return import(`${searchUrl}?${testName}-${Date.now()}`);
}

function tabEvent({ shiftKey = false } = {}) {
    return {
        key: 'Tab',
        shiftKey,
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true;
        }
    };
}

test('opening global search focuses its input', async () => {
    const fixture = createGlobalSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    const { openGlobalSearch } = await loadGlobalSearch('open-focus', fixture);

    openGlobalSearch();

    assert.equal(fixture.overlay.classList.contains('open'), true);
    assert.equal(fixture.overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(fixture.document.body.style.overflow, 'hidden');
    assert.equal(fixture.document.activeElement, fixture.input);
});

test('reopening global search preserves its query and results while retaining the original restore target', async () => {
    const fixture = createGlobalSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    const { openGlobalSearch, closeGlobalSearch } = await loadGlobalSearch('reopen-preserves-state', fixture);

    openGlobalSearch();
    fixture.input.value = 'open source bookmarks';
    fixture.results.innerHTML = '<button>Saved result</button>';
    fixture.close.focus();
    openGlobalSearch();

    assert.equal(fixture.input.value, 'open source bookmarks');
    assert.equal(fixture.results.innerHTML, '<button>Saved result</button>');
    assert.equal(fixture.document.activeElement, fixture.input);

    closeGlobalSearch();
    assert.equal(fixture.document.activeElement, fixture.trigger);
});

test('global search focus trap wraps Tab and Shift+Tab through dynamic result buttons', async () => {
    const fixture = createGlobalSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    const { openGlobalSearch, handleGlobalSearchFocusTrap } = await loadGlobalSearch('focus-trap', fixture);
    const resultButton = fixture.addResultButton();

    openGlobalSearch();
    resultButton.focus();
    const forward = tabEvent();
    handleGlobalSearchFocusTrap(forward);

    assert.equal(forward.defaultPrevented, true);
    assert.equal(fixture.document.activeElement, fixture.input);

    fixture.input.focus();
    const backward = tabEvent({ shiftKey: true });
    handleGlobalSearchFocusTrap(backward);

    assert.equal(backward.defaultPrevented, true);
    assert.equal(fixture.document.activeElement, resultButton);
});

test('closing global search restores focus to its prior trigger', async () => {
    const fixture = createGlobalSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    const { openGlobalSearch, closeGlobalSearch } = await loadGlobalSearch('close-focus', fixture);

    openGlobalSearch();
    closeGlobalSearch();

    assert.equal(fixture.overlay.classList.contains('open'), false);
    assert.equal(fixture.overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(fixture.document.body.style.overflow, '');
    assert.equal(fixture.document.activeElement, fixture.trigger);
});

test('closing global search restores focus to a visible control in an active modal', async () => {
    const fixture = createGlobalSearchFixture();
    const modalTitleInput = createFocusable(fixture.document, 'bookmarkTitleInput');
    modalTitleInput.tagName = 'INPUT';
    modalTitleInput.closest = selector => selector === '#bookmarkModal' ? fixture.bookmarkModal : null;
    fixture.bookmarkModal.classList.add('open');
    fixture.document.activeElement = modalTitleInput;
    const { openGlobalSearch, closeGlobalSearch } = await loadGlobalSearch('modal-control-restore-target', fixture);

    assert.equal(modalTitleInput.isConnected, true);
    assert.equal(modalTitleInput.closest('[aria-hidden="true"]'), null);

    openGlobalSearch();
    closeGlobalSearch();

    assert.equal(fixture.document.activeElement, modalTitleInput);
    assert.equal(modalTitleInput.focusCount, 1);
    assert.equal(fixture.trigger.focusCount, 0);
});

test('closing global search falls back to its trigger when the prior focus is inside an aria-hidden overlay', async () => {
    const fixture = createGlobalSearchFixture();
    const hiddenPaletteInput = createFocusable(fixture.document, 'commandPaletteInput');
    hiddenPaletteInput.closest = selector => selector === '[aria-hidden="true"]' ? { id: 'commandPaletteOverlay' } : null;
    fixture.document.activeElement = hiddenPaletteInput;
    const { openGlobalSearch, closeGlobalSearch } = await loadGlobalSearch('hidden-restore-target', fixture);

    openGlobalSearch();
    closeGlobalSearch();

    assert.equal(fixture.document.activeElement, fixture.trigger);
    assert.equal(hiddenPaletteInput.focusCount, 0);
});

test('closing global search keeps body scroll locked while a cached bookmark modal remains open', async () => {
    const fixture = createGlobalSearchFixture();
    fixture.document.activeElement = fixture.trigger;
    fixture.bookmarkModal.classList.add('open');
    const { openGlobalSearch, closeGlobalSearch } = await loadGlobalSearch('close-preserves-modal-lock', fixture);

    openGlobalSearch();
    closeGlobalSearch();

    assert.equal(fixture.overlay.classList.contains('open'), false);
    assert.equal(fixture.overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(fixture.document.body.style.overflow, 'hidden');
});
