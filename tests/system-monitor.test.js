const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeAgentReport,
    buildServerList,
    getServerStatus,
    sanitizeServerConfig,
    mergeServerConfigs
} = require('../shared/services/system-monitor');

test('normalizes agent server reports for dashboard display', () => {
    const report = normalizeAgentReport({
        id: 'us-vps',
        name: 'US VPS',
        role: 'edge',
        region: 'US',
        metrics: {
            cpu: { usage: 123.45, cores: 2 },
            memory: { total: 1000, used: 250 },
            disk: { total: 2000, used: 1500 },
            uptime: 3600,
            load: [0.1, 0.2, 0.3]
        }
    }, 1700000000000);

    assert.equal(report.id, 'us-vps');
    assert.equal(report.name, 'US VPS');
    assert.equal(report.status, 'online');
    assert.equal(report.cpu.usage, 100);
    assert.equal(report.memory.usagePercent, 25);
    assert.equal(report.disk.usagePercent, 75);
    assert.equal(report.uptime, 3600);
    assert.deepEqual(report.load, [0.1, 0.2, 0.3]);
});

test('buildServerList marks stale and offline agents by last seen time', () => {
    const now = 1700000000000;
    const local = normalizeAgentReport({ id: 'hk-vps', name: 'HK VPS', metrics: { cpu: { usage: 10 } } }, now);
    const agents = [
        normalizeAgentReport({ id: 'fresh', name: 'Fresh', metrics: {} }, now - 10_000),
        normalizeAgentReport({ id: 'stale', name: 'Stale', metrics: {} }, now - 120_000),
        normalizeAgentReport({ id: 'offline', name: 'Offline', metrics: {} }, now - 600_000)
    ];

    const servers = buildServerList({ local, agents, now });

    assert.deepEqual(servers.map(server => [server.id, server.status]), [
        ['hk-vps', 'online'],
        ['fresh', 'online'],
        ['stale', 'stale'],
        ['offline', 'offline']
    ]);
});

test('buildServerList keeps local server first when remote id collides', () => {
    const now = 1700000000000;
    const local = normalizeAgentReport({ id: 'hk-vps', name: 'HK VPS', metrics: { cpu: { usage: 10 } } }, now);
    const agents = [normalizeAgentReport({ id: 'hk-vps', name: 'Spoofed', metrics: { cpu: { usage: 99 } } }, now)];

    const servers = buildServerList({ local, agents, now });

    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'HK VPS');
    assert.equal(servers[0].cpu.usage, 10);
});

test('buildServerList applies configured server labels and keeps configured offline servers visible', () => {
    const now = 1700000000000;
    const local = normalizeAgentReport({ id: 'hk-vps', name: 'Local Raw', metrics: {} }, now);
    const configs = [
        { id: 'hk-vps', name: 'HK VPS', region: 'Hong Kong', role: 'bookmarks' },
        { id: 'us-vps', name: 'US VPS', region: 'US', role: 'relay' }
    ];

    const servers = buildServerList({ local, agents: [], configs, now });

    assert.deepEqual(servers.map(server => [server.id, server.name, server.status]), [
        ['hk-vps', 'HK VPS', 'online'],
        ['us-vps', 'US VPS', 'offline']
    ]);
    assert.equal(servers[1].region, 'US');
    assert.equal(servers[1].role, 'relay');
});

test('buildServerList hides disabled configured servers even when agents are reporting', () => {
    const now = 1700000000000;
    const local = normalizeAgentReport({ id: 'hk-vps', name: 'HK VPS', metrics: {} }, now);
    const agents = [normalizeAgentReport({ id: 'us-vps', name: 'US VPS', metrics: {} }, now)];
    const configs = [
        { id: 'hk-vps', name: 'HK VPS', enabled: true },
        { id: 'us-vps', name: 'US VPS', enabled: false }
    ];

    const servers = buildServerList({ local, agents, configs, now });

    assert.deepEqual(servers.map(server => server.id), ['hk-vps']);
});

test('sanitizeServerConfig includes enabled flag by default for compatibility', () => {
    const config = sanitizeServerConfig({
        id: ' us-vps ',
        name: ' US VPS ',
        region: ' United States ',
        role: ' relay ',
        enabled: false
    });

    assert.deepEqual(config, {
        id: 'us-vps',
        name: 'US VPS',
        region: 'United States',
        role: 'relay',
        enabled: false
    });
    assert.throws(() => sanitizeServerConfig({ id: 'bad id!' }), /服务器 ID/);
    assert.throws(() => sanitizeServerConfig({ id: 'a'.repeat(44) }), /服务器 ID/);
});

test('mergeServerConfigs preserves existing metadata when saving partial UI edits', () => {
    const merged = mergeServerConfigs(
        [{ id: 'us-vps', name: 'Old', region: 'US', role: 'relay' }],
        [{ id: 'us-vps', name: 'New' }, { id: 'hk-vps', name: 'HK' }]
    );

    assert.deepEqual(merged, [
        { id: 'us-vps', name: 'New', region: 'US', role: 'relay', enabled: true },
        { id: 'hk-vps', name: 'HK', region: '', role: '', enabled: true }
    ]);
});

test('server component values target a single configured server id', () => {
    const componentType = 'server:us-vps';
    assert.equal(componentType.startsWith('server:'), true);
    assert.equal(componentType.slice('server:'.length), 'us-vps');
});

test('getServerStatus uses nezha-like freshness thresholds', () => {
    const now = 1700000000000;
    assert.equal(getServerStatus(now - 59_000, now), 'online');
    assert.equal(getServerStatus(now - 60_001, now), 'stale');
    assert.equal(getServerStatus(now - 300_001, now), 'offline');
});
