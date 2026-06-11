const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const { attachBookmarkAi } = require('../shared/services/bookmarks');
const { saveBookmarkAi } = require('../shared/services/ai');

function createMemoryDb() {
    const bookmarkAi = new Map();
    return {
        USE_MYSQL: false,
        async execute(sql, params = []) {
            if (/INSERT INTO bookmark_ai/i.test(sql)) {
                const [bookmarkId, tags, summary, provider, model] = params;
                bookmarkAi.set(bookmarkId, {
                    bookmark_id: bookmarkId,
                    tags,
                    summary,
                    provider,
                    model,
                    updated_at: new Date().toISOString()
                });
            }
            return { changes: 1 };
        },
        async queryAll(sql, params = []) {
            if (/SELECT bookmark_id, tags, summary FROM bookmark_ai WHERE bookmark_id IN/i.test(sql)) {
                return params.map(id => bookmarkAi.get(id)).filter(Boolean);
            }
            return [];
        },
        async queryOne(sql, params = []) {
            if (/SELECT \* FROM bookmark_ai WHERE bookmark_id = \?/i.test(sql)) {
                return bookmarkAi.get(params[0]) || null;
            }
            return null;
        }
    };
}

async function setupBrowserGlobals() {
    global.window = { location: { origin: 'https://bookmarks.example', protocol: 'https:' } };
    global.document = {
        body: { style: {} },
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null
    };
    global.CSS = { escape: value => String(value) };
    global.localStorage = {
        getItem: () => '',
        setItem: () => {},
        removeItem: () => {}
    };
}

async function importBookmarkModule(testName) {
    setupBrowserGlobals();
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/bookmark.js')).href;
    return import(`${moduleUrl}?${testName}-${Date.now()}`);
}

test('saving empty manual tags removes stale tags from bookmark list data', async () => {
    const db = createMemoryDb();
    const bookmarkId = 'bm-tags-clear';

    await saveBookmarkAi(db, { bookmarkId, tags: 'AI工具,开发', summary: '' });
    await saveBookmarkAi(db, { bookmarkId, tags: '', summary: '' });

    const bookmarks = [{ id: bookmarkId, name: 'Example' }];
    await attachBookmarkAi(db, bookmarks);

    assert.deepEqual(bookmarks[0].tags, []);
    assert.equal(bookmarks[0].ai_summary, '');
});

test('editing bookmark modal pre-fills tags from loaded bookmark data', async () => {
    setupBrowserGlobals();
    const state = await import(pathToFileURL(path.resolve(__dirname, '../frontend/modules/state.js')).href);
    const domModule = await import(pathToFileURL(path.resolve(__dirname, '../frontend/modules/dom.js')).href);
    const { openBookmarkModal } = await importBookmarkModule('prefill-tags');

    state.setCategories([{ id: 'cat-1', name: '默认' }]);
    state.setBookmarks([{
        id: 'bm-prefill-tags',
        category_id: 'cat-1',
        name: '工具站',
        url: 'https://example.com',
        description: 'Example',
        icon_type: 'emoji',
        icon_data: '🌐',
        tags: ['开发', '效率']
    }]);

    const tagInput = { value: '' };
    const modal = {
        querySelector: () => ({ classList: { add: () => {}, remove: () => {} } }),
        classList: { add: () => {}, remove: () => {} }
    };
    Object.assign(domModule.DOM, {
        bookmarkInputCategory: { innerHTML: '', value: '', onchange: null },
        bookmarkModalTitle: { textContent: '' },
        bookmarkInputName: { value: '' },
        bookmarkInputUrl: { value: '' },
        bookmarkInputDesc: { value: '' },
        bookmarkInputTags: tagInput,
        bookmarkInputEmoji: { value: '' },
        bookmarkInputIconUrl: { value: '' },
        iconPreviewAuto: { innerHTML: '' },
        iconPreviewUpload: { innerHTML: '' },
        bookmarkModal: modal,
        bookmarkAiActions: { style: {} },
        aiStatusHint: { textContent: '' }
    });

    const originalFetch = global.fetch;
    global.fetch = async () => ({ json: async () => ({ success: true, data: null }) });
    try {
        openBookmarkModal('bm-prefill-tags');
        assert.equal(tagInput.value, '开发,效率');
    } finally {
        global.fetch = originalFetch;
    }
});

test('empty async AI lookup does not clear tags pre-filled from bootstrap data', async () => {
    setupBrowserGlobals();
    const domModule = await import(pathToFileURL(path.resolve(__dirname, '../frontend/modules/dom.js')).href);
    const { loadBookmarkAi } = await importBookmarkModule('load-ai-empty');

    const tagInput = { value: '开发,效率' };
    Object.assign(domModule.DOM, {
        bookmarkInputTags: tagInput,
        bookmarkInputDesc: { value: '' }
    });

    const originalFetch = global.fetch;
    global.fetch = async () => ({ json: async () => ({ success: true, data: { tags: [], summary: '' } }) });
    try {
        await loadBookmarkAi('bm-prefill-tags');
        assert.equal(tagInput.value, '开发,效率');
    } finally {
        global.fetch = originalFetch;
    }
});
