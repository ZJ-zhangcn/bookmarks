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
        contains: name => values.has(name),
        toggle: (name, force) => {
            const shouldAdd = force === undefined ? !values.has(name) : Boolean(force);
            if (shouldAdd) values.add(name);
            else values.delete(name);
            return shouldAdd;
        }
    };
}

function createElement(document, id, tagName = 'DIV') {
    const attributes = new Map();
    const listeners = new Map();
    return {
        id,
        tagName,
        isConnected: true,
        classList: createClassList(),
        style: {},
        dataset: {},
        value: '',
        innerHTML: '',
        textContent: '',
        open: false,
        focus() {
            const previous = document.activeElement;
            if (previous === this) return;
            document.activeElement = this;
            previous?.dispatchEvent?.({ type: 'blur', target: previous });
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) || null;
        },
        addEventListener(type, listener) {
            const handlers = listeners.get(type) || [];
            handlers.push(listener);
            listeners.set(type, handlers);
        },
        removeEventListener(type, listener) {
            const handlers = listeners.get(type) || [];
            listeners.set(type, handlers.filter(handler => handler !== listener));
        },
        dispatchEvent(event) {
            const payload = typeof event === 'string' ? { type: event } : event;
            if (!payload?.type) return false;
            if (!payload.target) payload.target = this;
            for (const listener of listeners.get(payload.type) || []) listener.call(this, payload);
            return true;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
        contains: () => false,
        closest: () => null
    };
}

function createFixture() {
    const elements = new Map();
    const documentListeners = new Map();
    const document = {
        activeElement: null,
        body: { style: {} },
        getElementById: id => elements.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener(type, listener) {
            const handlers = documentListeners.get(type) || [];
            handlers.push(listener);
            documentListeners.set(type, handlers);
        },
        removeEventListener(type, listener) {
            const handlers = documentListeners.get(type) || [];
            documentListeners.set(type, handlers.filter(handler => handler !== listener));
        }
    };
    const make = (id, tagName) => {
        const element = createElement(document, id, tagName);
        elements.set(id, element);
        return element;
    };

    const addBookmarkTrigger = make('addBookmarkTrigger', 'BUTTON');
    const engineModal = make('engineModal');
    engineModal.style.zIndex = '1000';
    const modal = make('bookmarkModal');
    modal.style.zIndex = '1150';
    const modalClose = make('bookmarkModalClose', 'BUTTON');
    const title = make('bookmarkModalTitle', 'H3');
    const url = make('bookmarkInputUrl', 'INPUT');
    const name = make('bookmarkInputName', 'INPUT');
    const description = make('bookmarkInputDesc', 'INPUT');
    const tags = make('bookmarkInputTags', 'INPUT');
    const category = make('bookmarkInputCategory', 'SELECT');
    const advanced = make('bookmarkAdvancedFields', 'DETAILS');
    const emoji = make('bookmarkInputEmoji', 'INPUT');
    const iconUrl = make('bookmarkInputIconUrl', 'INPUT');
    const iconFile = make('bookmarkInputIconFile', 'INPUT');
    const iconPreviewAuto = make('iconPreviewAuto');
    const iconPreviewUpload = make('iconPreviewUpload');
    const save = make('saveBookmarkBtn', 'BUTTON');
    const cancel = make('cancelBookmarkBtn', 'BUTTON');
    const confirmOverlay = make('confirmOverlay');
    confirmOverlay.style.zIndex = '1300';
    const bookmarkSearchOverlay = make('bookmarkSearchOverlay');
    bookmarkSearchOverlay.style.zIndex = '1200';
    const confirmTitle = make('confirmTitle', 'H3');
    const confirmMessage = make('confirmMessage');
    const confirmAccept = make('confirmAccept', 'BUTTON');
    const confirmCancel = make('confirmCancel', 'BUTTON');
    const confirmInputWrap = make('confirmInputWrap');
    const confirmInput = make('confirmInput', 'INPUT');
    const confirmInputLabel = make('confirmInputLabel', 'LABEL');
    const autoPanel = createElement(document, 'autoPanel');
    const iconTabs = [createElement(document, 'autoTab', 'BUTTON')];
    const iconPanels = [autoPanel];
    const focusables = [modalClose, url, cancel, save];

    modal.querySelector = selector => selector.includes('data-panel') ? autoPanel : null;
    modal.querySelectorAll = () => focusables;
    modal.contains = element => focusables.includes(element);
    confirmOverlay.contains = element => [
        confirmTitle,
        confirmMessage,
        confirmAccept,
        confirmCancel,
        confirmInputWrap,
        confirmInput,
        confirmInputLabel
    ].includes(element);
    document.querySelectorAll = selector => {
        if (selector === '.icon-tab') return iconTabs;
        if (selector === '.icon-panel') return iconPanels;
        return [];
    };

    return {
        document,
        elements,
        addBookmarkTrigger,
        engineModal,
        modal,
        modalClose,
        title,
        url,
        name,
        description,
        tags,
        category,
        advanced,
        emoji,
        iconUrl,
        iconFile,
        iconPreviewAuto,
        iconPreviewUpload,
        save,
        cancel,
        confirmOverlay,
        bookmarkSearchOverlay,
        confirmTitle,
        confirmMessage,
        confirmAccept,
        confirmCancel,
        confirmInputWrap,
        confirmInput,
        confirmInputLabel
    };
}

async function loadBookmarkModule(fixture, label) {
    global.window = { location: { origin: 'https://bookmarks.example', protocol: 'https:' } };
    global.document = fixture.document;
    global.CSS = { escape: value => String(value) };
    global.localStorage = { getItem: () => '', setItem: () => {}, removeItem: () => {} };

    const dom = await import(pathToFileURL(path.join(root, 'frontend/modules/dom.js')).href);
    const state = await import(pathToFileURL(path.join(root, 'frontend/modules/state.js')).href);
    Object.keys(dom.DOM).forEach(key => delete dom.DOM[key]);
    Object.assign(dom.DOM, {
        addBookmarkTrigger: fixture.addBookmarkTrigger,
        engineModal: fixture.engineModal,
        bookmarkModal: fixture.modal,
        bookmarkModalTitle: fixture.title,
        bookmarkModalClose: fixture.modalClose,
        bookmarkAdvancedFields: fixture.advanced,
        bookmarkInputUrl: fixture.url,
        bookmarkInputName: fixture.name,
        bookmarkInputDesc: fixture.description,
        bookmarkInputTags: fixture.tags,
        bookmarkInputCategory: fixture.category,
        bookmarkInputEmoji: fixture.emoji,
        bookmarkInputIconUrl: fixture.iconUrl,
        bookmarkInputIconFile: fixture.iconFile,
        iconPreviewAuto: fixture.iconPreviewAuto,
        iconPreviewUpload: fixture.iconPreviewUpload,
        saveBookmarkBtn: fixture.save,
        cancelBookmarkBtn: fixture.cancel,
        confirmOverlay: fixture.confirmOverlay,
        bookmarkSearchOverlay: fixture.bookmarkSearchOverlay,
        categoryRecommendations: { style: {} }
    });

    const moduleUrl = pathToFileURL(path.join(root, 'frontend/modules/bookmark.js')).href;
    const bookmark = await import(`${moduleUrl}?quick-capture-${label}-${Date.now()}`);
    return { bookmark, state };
}

test('quick bookmark opens collapsed, focuses URL, and exposes exactly one inbox sentinel', async () => {
    const fixture = createFixture();
    fixture.document.activeElement = fixture.addBookmarkTrigger;
    const { bookmark, state } = await loadBookmarkModule(fixture, 'quick-open');
    state.setCategories([
        { id: 'cat-inbox', name: '收件箱' },
        { id: 'cat-work', name: '工作' }
    ]);
    state.setBookmarks([]);

    bookmark.openBookmarkModal();

    assert.equal(fixture.modal.dataset.mode, 'quick');
    assert.equal(fixture.modal.getAttribute('aria-hidden'), 'false');
    assert.equal(fixture.advanced.open, false);
    assert.equal(fixture.document.activeElement, fixture.url);
    assert.equal(fixture.category.value, '__inbox__');
    assert.equal((fixture.category.innerHTML.match(/value="__inbox__"/g) || []).length, 1);
    assert.doesNotMatch(fixture.category.innerHTML, /value="cat-inbox"/);
    assert.equal(fixture.save.textContent, '保存书签');

    bookmark.closeBookmarkModal();
    assert.equal(fixture.modal.getAttribute('aria-hidden'), 'true');
    assert.equal(fixture.document.activeElement, fixture.addBookmarkTrigger);
});

test('closing a quick capture ignores the focus-restoring URL blur', async () => {
    const fixture = createFixture();
    fixture.document.activeElement = fixture.addBookmarkTrigger;
    const { bookmark, state } = await loadBookmarkModule(fixture, 'close-url-blur');
    state.setCategories([]);
    state.setBookmarks([]);

    const faviconUrl = pathToFileURL(path.join(root, 'frontend/modules/favicon.js')).href;
    const favicon = await import(`${faviconUrl}?close-url-blur-${Date.now()}`);
    const originalFetch = global.fetch;
    const requests = [];
    global.fetch = async (url, options = {}) => {
        requests.push({ url: String(url), method: options.method || 'GET' });
        return {
            ok: true,
            json: async () => ({ success: true, data: { icons: [] } })
        };
    };

    try {
        fixture.url.addEventListener('blur', favicon.flushBookmarkUrlEnrichment);
        bookmark.openBookmarkModal();
        fixture.url.value = 'https://example.com/close-blur';
        fixture.iconPreviewAuto.innerHTML = '<span>keep-existing-preview</span>';

        bookmark.closeBookmarkModal();

        assert.deepEqual(
            requests,
            [],
            'the URL blur caused by restoring focus after close must not restart hidden-form enrichment'
        );
        assert.equal(
            fixture.iconPreviewAuto.innerHTML,
            '<span>keep-existing-preview</span>',
            'the close-triggered blur must not mutate hidden icon controls'
        );
    } finally {
        favicon.cancelBookmarkUrlEnrichment();
        global.fetch = originalFetch;
    }
});

test('edit bookmark opens expanded and preserves its actual category, form data, and icon state', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'edit-open');
    state.setCategories([{ id: 'cat-work', name: '工作' }]);
    state.setBookmarks([{
        id: 'bookmark-1',
        category_id: 'cat-work',
        name: 'Existing title',
        url: 'https://example.com/existing',
        description: 'Existing description',
        tags: ['work'],
        icon_type: 'emoji',
        icon_data: '🧰'
    }]);

    bookmark.openBookmarkModal('bookmark-1');

    assert.equal(fixture.modal.dataset.mode, 'edit');
    assert.equal(fixture.advanced.open, true);
    assert.equal(fixture.category.value, 'cat-work');
    assert.equal(fixture.name.value, 'Existing title');
    assert.equal(fixture.url.value, 'https://example.com/existing');
    assert.equal(fixture.description.value, 'Existing description');
    assert.equal(fixture.tags.value, 'work');
    assert.equal(fixture.emoji.value, '🧰');
});

test('quick save derives hostname and inbox payload, while an invalid URL posts nothing', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'quick-save');
    state.setCategories([{ id: 'cat-work', name: '工作' }]);
    state.setBookmarks([]);
    const posts = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, options = {}) => {
        if (options.method === 'POST' && String(url).endsWith('/api/bookmarks')) {
            posts.push(JSON.parse(options.body));
        }
        return {
            ok: false,
            status: 422,
            json: async () => ({ success: false, error: 'test response' })
        };
    };

    try {
        bookmark.openBookmarkModal();
        fixture.url.value = ' https://www.example.com/docs ';
        fixture.name.value = '';
        await bookmark.saveBookmark();

        assert.equal(posts.length, 1);
        assert.deepEqual(posts[0], {
            id: null,
            category_id: '__inbox__',
            name: 'example.com',
            url: 'https://www.example.com/docs',
            description: '',
            icon: '🌐',
            icon_type: 'auto',
            icon_data: ''
        });

        fixture.url.value = 'ftp://example.com/file';
        fixture.name.value = '';
        await bookmark.saveBookmark();
        assert.equal(posts.length, 1, 'invalid quick URLs must not issue a bookmark POST');
    } finally {
        global.fetch = originalFetch;
    }
});

test('bookmark focus trap defers to a new-category prompt above it', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'category-prompt-focus');
    state.setCategories([{ id: 'cat-work', name: '工作' }]);
    state.setBookmarks([]);
    bookmark.openBookmarkModal();

    fixture.category.value = '__new__';
    const prompt = fixture.category.onchange.call(fixture.category);
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.equal(fixture.confirmOverlay.classList.contains('open'), true);
    assert.equal(fixture.document.activeElement, fixture.confirmInput);

    let prevented = false;
    bookmark.handleBookmarkModalFocusTrap({
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; }
    });
    assert.equal(prevented, false, 'a prompt above the bookmark modal owns Tab');
    assert.equal(fixture.document.activeElement, fixture.confirmInput);

    fixture.confirmAccept.dispatchEvent({ type: 'click' });
    await prompt;
    assert.equal(
        fixture.document.body.style.overflow,
        'hidden',
        'settling a foreground prompt must preserve the lower bookmark dialog scroll lock'
    );
});

test('bookmark focus trap defers to bookmark search above it', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'bookmark-search-focus');
    state.setCategories([]);
    state.setBookmarks([]);
    bookmark.openBookmarkModal();
    fixture.bookmarkSearchOverlay.classList.add('open');
    fixture.save.focus();

    let prevented = false;
    bookmark.handleBookmarkModalFocusTrap({
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; }
    });

    assert.equal(prevented, false, 'a higher bookmark-search overlay must own Tab');
    assert.equal(fixture.document.activeElement, fixture.save);
});

test('quick bookmark canonicalizes an explicit inbox category and restores it after prompt cancellation', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'canonical-inbox');
    state.setCategories([
        { id: 'cat-inbox', name: '收件箱' },
        { id: 'cat-work', name: '工作' }
    ]);
    state.setBookmarks([]);

    bookmark.openBookmarkModal(null, 'cat-inbox');
    assert.equal(fixture.category.value, '__inbox__');

    fixture.category.value = '__new__';
    const prompt = fixture.category.onchange.call(fixture.category);
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.confirmCancel.dispatchEvent({ type: 'click' });
    await prompt;

    assert.equal(fixture.category.value, '__inbox__');
});

test('bookmark focus trap owns Tab above a lower engine dialog', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'focus-trap-lower-engine');
    state.setCategories([]);
    state.setBookmarks([]);
    fixture.engineModal.classList.add('open');
    bookmark.openBookmarkModal();

    fixture.save.focus();
    let prevented = false;
    bookmark.handleBookmarkModalFocusTrap({
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; }
    });

    assert.equal(prevented, true, 'a lower dialog must not disable the foreground bookmark trap');
    assert.equal(fixture.document.activeElement, fixture.modalClose);
});

test('bookmark modal traps Tab within visible controls', async () => {
    const fixture = createFixture();
    const { bookmark, state } = await loadBookmarkModule(fixture, 'focus-trap');
    state.setCategories([]);
    state.setBookmarks([]);
    bookmark.openBookmarkModal();

    fixture.save.focus();
    let prevented = false;
    bookmark.handleBookmarkModalFocusTrap({
        key: 'Tab',
        shiftKey: false,
        preventDefault: () => { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.equal(fixture.document.activeElement, fixture.modalClose);

    fixture.modalClose.focus();
    prevented = false;
    bookmark.handleBookmarkModalFocusTrap({
        key: 'Tab',
        shiftKey: true,
        preventDefault: () => { prevented = true; }
    });
    assert.equal(prevented, true);
    assert.equal(fixture.document.activeElement, fixture.save);
});
