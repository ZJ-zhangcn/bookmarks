const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const helperModuleUrl = pathToFileURL(path.resolve(__dirname, '../frontend/modules/hermes-console-helpers.js')).href;
const helpersPromise = import(`${helperModuleUrl}?test=${Date.now()}`);

test('summarizeServerForHermes keeps actionable metrics and omits secrets', async () => {
    const { summarizeServerForHermes } = await helpersPromise;
    const server = summarizeServerForHermes({
        id: 'us-vps',
        name: 'US VPS',
        status: 'online',
        region: 'Los Angeles',
        role: 'reverse proxy',
        lastSeen: 1710000000000,
        uptime: 3600,
        cpu: { usage: 87, cores: 2 },
        memory: { used: 512, total: 1024, usagePercent: 50 },
        disk: { used: 90, total: 100, usagePercent: 90 },
        docker: { running: 8, total: 9, unhealthy: 1 },
        network: { rxRate: 1024, txRate: 2048 },
        apiKey: 'secret-should-not-leak'
    });

    assert.deepEqual(server, {
        id: 'us-vps',
        name: 'US VPS',
        status: 'online',
        region: 'Los Angeles',
        role: 'reverse proxy',
        lastSeen: 1710000000000,
        uptime: 3600,
        cpu: { usage: 87, cores: 2 },
        memory: { used: 512, total: 1024, usagePercent: 50 },
        disk: { used: 90, total: 100, usagePercent: 90 },
        docker: { running: 8, total: 9, unhealthy: 1 },
        network: { rxRate: 1024, txRate: 2048 }
    });
    assert.ok(!JSON.stringify(server).includes('secret'));
});

test('buildServiceDiagnoseInput combines server, card and user note context', async () => {
    const { buildServiceDiagnoseInput } = await helpersPromise;
    const input = buildServiceDiagnoseInput({
        server: { id: 'hk-vps', status: 'stale', cpu: { usage: 12 } },
        card: { id: 'bm1', name: 'NewAPI', url: 'https://newapi.example.com', description: 'model gateway' },
        note: '最近 502'
    });

    assert.equal(input.server.id, 'hk-vps');
    assert.equal(input.card.name, 'NewAPI');
    assert.equal(input.note, '最近 502');
    assert.match(input.page.href, /^https?:\/\//);
    assert.ok(!JSON.stringify(input).includes('password'));
});

test('buildBookmarkOrganizeInput limits scope and keeps only bookmark metadata', async () => {
    const { buildBookmarkOrganizeInput } = await helpersPromise;
    const input = buildBookmarkOrganizeInput({
        bookmarks: [
            { id: 'b1', name: 'NewAPI', url: 'https://newapi.example.com', apiKey: 'secret' },
            ...Array.from({ length: 220 }, (_, i) => ({ id: `b${i + 2}`, name: `站点 ${i}` }))
        ],
        categories: [{ id: 'ops', name: '运维', icon: '🧰', token: 'secret' }],
        note: '整理重复项'
    });

    assert.equal(input.kind, 'bookmark_organize');
    assert.equal(input.bookmarks.length, 200);
    assert.equal(input.categories[0].name, '运维');
    assert.ok(!JSON.stringify(input).includes('secret'));
});

test('renderHermesAnswer escapes HTML and renders status blocks', async () => {
    const { renderHermesAnswer } = await helpersPromise;
    const html = renderHermesAnswer({
        status: 'succeeded',
        result: { text: '<b>重启 nginx</b>\n检查 502' }
    });

    assert.match(html, /Hermes 建议/);
    assert.match(html, /&lt;b&gt;重启 nginx&lt;\/b&gt;/);
    assert.match(html, /检查 502/);
});
