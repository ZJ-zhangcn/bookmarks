const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
const events = fs.readFileSync(path.join(__dirname, '../frontend/modules/events.js'), 'utf8');

function extractSettingsTabs() {
    return [...html.matchAll(/<button class="settings-tab(?: active)?"[^>]*data-tab="([^"]+)"[^>]*>[\s\S]*?<span>(.*?)<\/span>/g)]
        .map(match => ({ id: match[1].trim(), label: match[2].trim() }));
}

function extractSettingsPanels() {
    return [...html.matchAll(/<div class="settings-panel(?: active)?"[^>]*data-panel="([^"]+)"/g)]
        .map(match => match[1].trim());
}

test('settings sidebar exposes focused menu entries instead of broad grouped tabs', () => {
    assert.deepEqual(extractSettingsTabs(), [
        { id: 'general', label: '常规' },
        { id: 'personalization', label: '个性化' },
        { id: 'categories', label: '分类管理' },
        { id: 'icons', label: '图标库' },
        { id: 'sync', label: '数据同步' },
        { id: 'ai', label: 'AI 设置' },
        { id: 'about', label: '关于' }
    ]);
});

test('each settings menu entry maps to exactly one settings panel', () => {
    const tabs = extractSettingsTabs().map(tab => tab.id);
    const panels = extractSettingsPanels();
    assert.deepEqual(panels, tabs);
    assert.equal(new Set(panels).size, panels.length);
});

test('settings tab click activates panels by data-panel rather than broad groups', () => {
    assert.match(events, /panel\.dataset\.panel === activePanel/);
    assert.doesNotMatch(events, /panel\.dataset\.settingGroup === activeGroup/);
});
