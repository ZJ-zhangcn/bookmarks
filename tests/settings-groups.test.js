const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');

test('settings sidebar is grouped into common, sync, and advanced tabs', () => {
    const labels = [...html.matchAll(/<button class="settings-tab(?: active)?"[^>]*>[\s\S]*?<span>(.*?)<\/span>/g)]
        .map(match => match[1].trim());
    assert.deepEqual(labels, ['常用', '数据同步', '高级']);
});

test('all settings panels are assigned to one grouped settings section', () => {
    const panels = [...html.matchAll(/<div class="settings-panel(?: active)?"([^>]*)>/g)]
        .map(match => match[1]);
    assert.ok(panels.length >= 3);
    assert.equal(panels.every(attrs => /data-setting-group="(common|sync|advanced)"/.test(attrs)), true);
});
