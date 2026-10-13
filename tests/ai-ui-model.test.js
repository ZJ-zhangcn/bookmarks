const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

function setupBrowserGlobals(values = {}) {
    const storage = new Map(Object.entries(values));
    global.window = { location: { origin: 'https://bookmarks.example', protocol: 'https:' } };
    global.document = {
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null
    };
    global.localStorage = {
        getItem: key => storage.get(key) || '',
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    };
}

test('bookmark AI hint shows the configured model instead of the server default', async () => {
    setupBrowserGlobals({ aiModel: 'gpt-6-luna', aiProvider: 'claude' });
    const dom = await import(pathToFileURL(path.resolve(__dirname, '../frontend/modules/dom.js')).href);
    const state = await import(pathToFileURL(path.resolve(__dirname, '../frontend/modules/state.js')).href);
    const aiUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/ai.js')).href;
    const ai = await import(`${aiUrl}?configured-model-${Date.now()}`);
    const hint = { textContent: '' };
    Object.assign(dom.DOM, { bookmarkAiActions: { style: {} }, aiStatusHint: hint });
    state.setAiStatus({
        enabled: true,
        provider: 'openai',
        model: 'gpt-5.6-luna-high-fast',
        allowClientProvider: false
    });

    ai.updateAiUiVisibility();

    assert.equal(hint.textContent, 'OPENAI · gpt-6-luna');

    state.setAiStatus({
        enabled: true,
        provider: 'openai',
        model: 'gpt-5.6-luna-high-fast',
        allowClientProvider: true
    });
    ai.updateAiUiVisibility();

    assert.equal(hint.textContent, 'CLAUDE · gpt-6-luna');
});
