const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('fixed action buttons do not include bulk organize or shortcut help', () => {
    const html = read('frontend/index.html');
    assert.equal(html.includes('id="bulkOrganizeBtn"'), false);
    assert.equal(html.includes('id="shortcutHelpBtn"'), false);
    assert.equal(html.includes('title="批量整理"'), false);
    assert.equal(html.includes('title="快捷键帮助"'), false);
});

test('event bindings do not import or open removed bulk/shortcut features', () => {
    const events = read('frontend/modules/events.js');
    assert.equal(events.includes('./bulk-organize.js'), false);
    assert.equal(events.includes('./shortcuts.js'), false);
    assert.equal(events.includes('toggleBulkOrganizeMode'), false);
    assert.equal(events.includes('openShortcutHelp'), false);
});
