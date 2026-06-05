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

test('bookmark modal no longer exposes probe component controls', () => {
    const html = read('frontend/index.html');
    assert.equal(html.includes('id="bookmarkItemType"'), false);
    assert.equal(html.includes('id="bookmarkComponentType"'), false);
    assert.equal(html.includes('id="bookmarkServerId"'), false);
    assert.equal(html.includes('服务器探针'), false);
    assert.equal(html.includes('探针类型'), false);
});

test('settings page no longer exposes monitor agent setup', () => {
    const html = read('frontend/index.html');
    assert.equal(html.includes('data-panel="monitor"'), false);
    assert.equal(html.includes('monitorServerIdInput'), false);
    assert.equal(html.includes('monitorAgentTokenInput'), false);
    assert.equal(html.includes('monitorInstallCommand'), false);
    assert.equal(html.includes('Agent 安装命令'), false);
});

test('frontend no longer binds or renders server probe cards', () => {
    const events = read('frontend/modules/events.js');
    const render = read('frontend/modules/render.js');
    const bookmark = read('frontend/modules/bookmark.js');

    assert.equal(events.includes('registerMonitorServer'), false);
    assert.equal(events.includes('openMonitorProbeBookmark'), false);
    assert.equal(render.includes('/api/system/servers'), false);
    assert.equal(render.includes('server-monitor-slot'), false);
    assert.equal(bookmark.includes('openServerProbeBookmarkModal'), false);
    assert.equal(bookmark.includes('component_type'), false);
});

test('backend monitor agent route and script are removed', () => {
    const server = read('backend/server.js');
    const routes = read('backend/routes/index.js');

    assert.equal(fs.existsSync(path.join(root, 'backend/routes/system.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'shared/services/system-monitor.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'scripts/monitor-agent.sh')), false);
    assert.equal(server.includes('/api/system'), false);
    assert.equal(routes.includes('./system'), false);
    assert.equal(routes.includes('system:'), false);
});
