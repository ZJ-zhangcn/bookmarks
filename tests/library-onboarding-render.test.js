const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

function createElement(tagName) {
    const attributes = new Map();
    return {
        tagName,
        className: '',
        textContent: '',
        hidden: false,
        style: {},
        dataset: {},
        parentNode: null,
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name) || null;
        },
        querySelectorAll() {
            return [];
        },
        remove() {
            this.parentNode?.removeChild(this);
        }
    };
}

function createBookmarksContainer() {
    const children = [];
    const grid = {
        dataset: {},
        childElementCount: 0,
        innerHTML: '',
        style: {},
        querySelectorAll: () => []
    };
    const section = {
        style: {},
        classList: { add: () => {}, remove: () => {} },
        querySelector(selector) {
            if (selector === '.collapse-btn') return { title: '' };
            if (selector === '.bookmarks-grid') return grid;
            if (selector === '.category-count') return { textContent: '' };
            return null;
        }
    };

    return {
        children,
        grid,
        section,
        style: {},
        appendChild(child) {
            children.push(child);
            child.parentNode = this;
            return child;
        },
        removeChild(child) {
            const index = children.indexOf(child);
            if (index !== -1) children.splice(index, 1);
            child.parentNode = null;
        },
        querySelector(selector) {
            if (selector.startsWith('.category-section')) return section;
            if (selector === '.filtered-empty') return children.find(child => child.className === 'filtered-empty') || null;
            return null;
        }
    };
}

async function loadRenderer(testName, localStorage) {
    global.window = { location: { origin: 'https://bookmarks.example' } };
    global.document = {
        createElement,
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null,
        body: { style: {} }
    };
    global.CSS = { escape: value => String(value) };
    global.localStorage = localStorage;
    global.requestAnimationFrame = () => {};

    const stateUrl = pathToFileURL(path.join(root, 'frontend/modules/state.js')).href;
    const domUrl = pathToFileURL(path.join(root, 'frontend/modules/dom.js')).href;
    const renderUrl = pathToFileURL(path.join(root, 'frontend/modules/render.js')).href;
    const [state, domModule, render] = await Promise.all([
        import(stateUrl),
        import(domUrl),
        import(`${renderUrl}?${testName}-${Date.now()}`)
    ]);

    Object.keys(domModule.DOM).forEach(key => delete domModule.DOM[key]);
    return { state, domModule, render };
}

function assignOnboardingDom(domModule) {
    const onboarding = { hidden: true };
    const title = { textContent: '' };
    const hint = { textContent: '' };
    const dismiss = { hidden: false };
    Object.assign(domModule.DOM, {
        libraryOnboarding: onboarding,
        libraryOnboardingTitle: title,
        libraryOnboardingHint: hint,
        onboardingDismissBtn: dismiss
    });
    return { onboarding, title, hint, dismiss };
}

const activeStorage = {
    getItem: () => '1',
    setItem: () => {}
};

test('empty library renders its import onboarding despite a stored dismissal', async () => {
    const { state, domModule, render } = await loadRenderer('empty-library', activeStorage);
    const view = assignOnboardingDom(domModule);
    state.setBookmarks([]);

    render.renderLibraryOnboarding();

    assert.equal(view.onboarding.hidden, false);
    assert.equal(view.title.textContent, '从浏览器书签开始');
    assert.equal(view.dismiss.hidden, true);
});

test('seed-only library renders its dismissible replacement onboarding', async () => {
    const { state, domModule, render } = await loadRenderer('seed-only-library', { getItem: () => null, setItem: () => {} });
    const view = assignOnboardingDom(domModule);
    state.setBookmarks([{ id: 'bm_default_example' }]);

    render.renderLibraryOnboarding();

    assert.equal(view.onboarding.hidden, false);
    assert.equal(view.title.textContent, '这些是示例书签，导入你的常用入口吧');
    assert.equal(view.dismiss.hidden, false);
});

test('a real bookmark hides library onboarding', async () => {
    const { state, domModule, render } = await loadRenderer('real-bookmark', { getItem: () => null, setItem: () => {} });
    const view = assignOnboardingDom(domModule);
    state.setBookmarks([{ id: 'bookmark-real' }]);

    render.renderLibraryOnboarding();

    assert.equal(view.onboarding.hidden, true);
});

test('throwing localStorage reads leave seed onboarding available', async () => {
    const { state, domModule, render } = await loadRenderer('storage-read-failure', {
        getItem: () => { throw new Error('storage unavailable'); },
        setItem: () => {}
    });
    const view = assignOnboardingDom(domModule);
    state.setBookmarks([{ id: 'bm_default_example' }]);

    assert.doesNotThrow(() => render.renderLibraryOnboarding());
    assert.equal(view.onboarding.hidden, false);
    assert.equal(view.dismiss.hidden, false);
});

test('throwing localStorage writes leave seed onboarding visible on the next render', async () => {
    const { state, domModule, render } = await loadRenderer('storage-write-failure', {
        getItem: () => null,
        setItem: () => { throw new Error('storage unavailable'); }
    });
    const view = assignOnboardingDom(domModule);
    state.setBookmarks([{ id: 'bm_default_example' }]);

    assert.doesNotThrow(() => render.dismissSeedOnboarding());
    render.renderLibraryOnboarding();

    assert.equal(view.onboarding.hidden, false);
    assert.equal(view.dismiss.hidden, false);
});

test('a zero-match local filter shows a status and removes it when results return', async () => {
    const { state, domModule, render } = await loadRenderer('filtered-empty', { getItem: () => null, setItem: () => {} });
    const container = createBookmarksContainer();
    Object.assign(domModule.DOM, { bookmarksContainer: container });
    state.setCategories([{ id: 'cat-1', name: '默认' }]);
    state.setBookmarks([{ id: 'bookmark-real', category_id: 'cat-1', name: '匹配项', url: 'https://example.com', description: '' }]);
    state.setCurrentCategory('all');
    state.setCurrentSearch('missing');

    render.renderBookmarks();

    const status = container.children.find(child => child.getAttribute('role') === 'status');
    assert.ok(status, 'a zero-match filter should provide a status message');
    assert.equal(container.style.display, 'flex');

    state.setCurrentSearch('匹配');
    render.renderBookmarks();

    assert.equal(container.children.some(child => child.getAttribute('role') === 'status'), false);
    assert.equal(container.style.display, 'flex');
});
