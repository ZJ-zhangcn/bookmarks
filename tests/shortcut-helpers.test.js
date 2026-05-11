const test = require('node:test');
const assert = require('node:assert/strict');

const { getShortcutHelpItems } = require('../frontend/modules/shortcut-helpers.cjs');

test('getShortcutHelpItems documents current keyboard shortcuts', () => {
    const keys = getShortcutHelpItems().map(item => item.key);
    assert.deepEqual(keys, ['Ctrl/⌘ + K', 'Ctrl/⌘ + N', 'Ctrl/⌘ + Shift + N', 'Ctrl/⌘ + ,', 'Ctrl/⌘ + F', '/', 'Esc', '?']);
});
