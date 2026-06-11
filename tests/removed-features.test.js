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

test('service status monitoring feature is not present', () => {
    const html = read('frontend/index.html');
    const server = read('backend/server.js');
    const routes = read('backend/routes/index.js');
    const db = read('backend/db.js');
    const main = read('frontend/main.js');
    const events = read('frontend/modules/events.js');
    const state = read('frontend/modules/state.js');
    const dom = read('frontend/modules/dom.js');

    assert.equal(fs.existsSync(path.join(root, 'backend/routes/service-status.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'backend/services/service-checker.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'shared/services/service-status.js')), false);
    assert.equal(fs.existsSync(path.join(root, 'frontend/modules/service-status.js')), false);

    assert.equal(server.includes('/api/service-status'), false);
    assert.equal(server.includes('service-checker'), false);
    assert.equal(server.includes('startServiceStatusScheduler'), false);
    assert.equal(routes.includes('serviceStatus'), false);
    assert.equal(routes.includes('./service-status'), false);
    assert.equal(db.includes('monitored_services'), false);
    assert.equal(db.includes('service_status_results'), false);

    assert.equal(html.includes('serviceStatus'), false);
    assert.equal(html.includes('data-panel="service-status"'), false);
    assert.equal(html.includes('添加监控服务'), false);
    assert.equal(html.includes('服务状态'), false);
    assert.equal(main.includes('service-status'), false);
    assert.equal(events.includes('ServiceStatus'), false);
    assert.equal(events.includes('serviceStatus'), false);
    assert.equal(state.includes('serviceStatus'), false);
    assert.equal(dom.includes('serviceStatus'), false);
});

test('unknown API paths return JSON 404 before SPA fallback', () => {
    const server = read('backend/server.js');
    const apiFallbackIndex = server.indexOf("app.use('/api', (req, res) =>");
    const spaFallbackIndex = server.indexOf("app.get('*', (req, res) =>");

    assert.notEqual(apiFallbackIndex, -1);
    assert.notEqual(spaFallbackIndex, -1);
    assert.equal(apiFallbackIndex < spaFallbackIndex, true);
    assert.match(server, /res\.status\(404\)\.json\(\{/);
});

