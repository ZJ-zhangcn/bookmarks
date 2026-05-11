const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

async function importUxModule(testName, documentOverride = null) {
    global.window = { location: { origin: 'https://bookmarks.example', protocol: 'https:' }, confirm: () => true };
    global.document = documentOverride || {
        body: { style: {} },
        getElementById: () => null,
        createElement: () => ({})
    };
    const moduleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/ux.js')).href;
    return import(`${moduleUrl}?${testName}-${Date.now()}`);
}

function makeClassList() {
    const values = new Set();
    return {
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
        toggle(value, force) {
            if (force === undefined ? !values.has(value) : force) values.add(value);
            else values.delete(value);
        },
        contains(value) { return values.has(value); }
    };
}

function makeButton() {
    const listeners = {};
    return {
        textContent: '',
        classList: makeClassList(),
        addEventListener(type, fn) { listeners[type] = fn; },
        removeEventListener(type) { delete listeners[type]; },
        focus() {},
        click() { listeners.click?.({ target: this }); }
    };
}

test('buildCategorySheetItems includes all entry and category counts', async () => {
    const { buildCategorySheetItems } = await importUxModule('category-items');

    const items = buildCategorySheetItems({
        categories: [
            { id: 'probe', name: '探针', icon: '🖥️' },
            { id: 'dev', name: '开发社区' }
        ],
        bookmarks: [
            { id: 'a', category_id: 'probe' },
            { id: 'b', category_id: 'probe' },
            { id: 'c', category_id: 'dev' }
        ]
    });

    assert.deepEqual(items, [
        { id: 'all', name: '全部', icon: '📚', count: 3 },
        { id: 'probe', name: '探针', icon: '🖥️', count: 2 },
        { id: 'dev', name: '开发社区', icon: '📁', count: 1 }
    ]);
});

test('buildCategoryFabLabel shows current category count', async () => {
    const { buildCategorySheetItems, buildCategoryFabLabel } = await importUxModule('category-label');
    const items = buildCategorySheetItems({
        categories: [{ id: 'ai', name: 'AI与MCP', icon: '🤖' }],
        bookmarks: [{ id: 'a', category_id: 'ai' }, { id: 'b', category_id: 'ai' }]
    });

    assert.equal(buildCategoryFabLabel(items, 'ai'), '🤖 AI与MCP · 2个');
    assert.equal(buildCategoryFabLabel(items, 'missing'), '📚 全部 · 2个');
});

test('createNotifier appends toast messages and limits visible queue', async () => {
    const { createNotifier } = await importUxModule('notifier');
    const children = [];
    const container = {
        appendChild(node) { children.push(node); },
        querySelectorAll() { return children; }
    };
    const documentStub = {
        createElement() {
            return {
                className: '',
                textContent: '',
                dataset: {},
                classList: { add() {}, remove() {} },
                remove() {
                    const index = children.indexOf(this);
                    if (index !== -1) children.splice(index, 1);
                }
            };
        }
    };

    const notifier = createNotifier({ container, document: documentStub, maxToasts: 2, timeoutMs: 0 });
    notifier.showToast('第一条');
    notifier.showToast('第二条', 'success');
    notifier.showToast('第三条', 'error');

    assert.equal(children.length, 2);
    assert.equal(children[0].textContent, '第二条');
    assert.equal(children[0].dataset.type, 'success');
    assert.equal(children[1].textContent, '第三条');
    assert.equal(children[1].dataset.type, 'error');
});

test('showConfirm falls back to window.confirm when dialog DOM is unavailable', async () => {
    let prompt = '';
    const { showConfirm } = await importUxModule('confirm-fallback');
    global.window.confirm = (message) => {
        prompt = message;
        return false;
    };

    const result = await showConfirm({ title: '删除？', message: '确定删除吗？' });

    assert.equal(result, false);
    assert.equal(prompt, '确定删除吗？');
});

test('showPrompt resolves typed input from confirm dialog', async () => {
    const overlay = {
        classList: makeClassList(),
        style: {},
        setAttribute() {},
        addEventListener() {},
        removeEventListener() {}
    };
    const title = { textContent: '' };
    const message = { textContent: '' };
    const confirm = makeButton();
    const cancel = makeButton();
    const input = { value: '', placeholder: '', focus() {} };
    const inputWrap = { style: {} };
    const inputLabel = { textContent: '' };
    const doc = {
        body: { style: {} },
        activeElement: input,
        addEventListener() {},
        removeEventListener() {},
        getElementById(id) {
            return {
                confirmOverlay: overlay,
                confirmTitle: title,
                confirmMessage: message,
                confirmAccept: confirm,
                confirmCancel: cancel,
                confirmInput: input,
                confirmInputWrap: inputWrap,
                confirmInputLabel: inputLabel
            }[id] || null;
        },
        createElement: () => ({})
    };
    const { showPrompt } = await importUxModule('prompt-dialog', doc);

    const promise = showPrompt({ title: '新建分类', inputLabel: '分类名称', inputValue: '开发社区' });
    input.value = 'AI与MCP';
    confirm.click();
    const result = await promise;

    assert.equal(result, 'AI与MCP');
    assert.equal(inputWrap.style.display, '');
    assert.equal(inputLabel.textContent, '分类名称');
    assert.equal(overlay.classList.contains('open'), false);
});
