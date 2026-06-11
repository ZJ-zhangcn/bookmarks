const test = require('node:test');
const assert = require('node:assert/strict');

const { createIconDiscoveryCache } = require('../backend/services/icons/discovery-cache');

function createFakeDb() {
    const rows = new Map();
    const calls = [];
    return {
        rows,
        calls,
        async queryOne(sql, params = []) {
            calls.push({ type: 'queryOne', sql, params });
            const row = rows.get(params[0]);
            return row ? { ...row } : null;
        },
        async execute(sql, params = []) {
            calls.push({ type: 'execute', sql, params });
            if (/DELETE FROM icon_discovery_cache WHERE origin = \?/.test(sql)) {
                rows.delete(params[0]);
                return;
            }
            if (/DELETE FROM icon_discovery_cache WHERE expires_at < \?/.test(sql)) {
                const now = new Date(params[0]).getTime();
                let deleted = 0;
                for (const [origin, row] of rows) {
                    if (new Date(row.expires_at).getTime() < now && deleted < params[1]) {
                        rows.delete(origin);
                        deleted++;
                    }
                }
                return;
            }
            rows.set(params[0], {
                origin: params[0],
                result_json: params[1],
                status: params[2],
                expires_at: params[3]
            });
        }
    };
}

test('icon discovery cache stores and returns unexpired JSON results', async () => {
    const db = createFakeDb();
    const cache = createIconDiscoveryCache(db, { now: () => new Date('2026-01-01T00:00:00Z') });

    await cache.set('https://example.com', { status: 'ok', icons: ['https://example.com/favicon.ico'] }, 60_000);
    const hit = await cache.get('https://example.com');

    assert.deepEqual(hit, { status: 'ok', icons: ['https://example.com/favicon.ico'] });
    assert.equal(db.rows.get('https://example.com').status, 'ok');
});

test('icon discovery cache deletes expired rows and returns null', async () => {
    const db = createFakeDb();
    db.rows.set('https://old.example', {
        origin: 'https://old.example',
        result_json: JSON.stringify({ status: 'fallback', icons: [] }),
        status: 'fallback',
        expires_at: '2025-12-31T23:59:00.000Z'
    });
    const cache = createIconDiscoveryCache(db, { now: () => new Date('2026-01-01T00:00:00Z') });

    assert.equal(await cache.get('https://old.example'), null);
    assert.equal(db.rows.has('https://old.example'), false);
});

test('icon discovery cache prunes expired rows with a bounded limit', async () => {
    const db = createFakeDb();
    db.rows.set('https://old-1.example', { result_json: '{}', status: 'ok', expires_at: '2025-12-31T23:59:00.000Z' });
    db.rows.set('https://old-2.example', { result_json: '{}', status: 'ok', expires_at: '2025-12-31T23:59:01.000Z' });
    db.rows.set('https://fresh.example', { result_json: '{}', status: 'ok', expires_at: '2026-01-01T00:01:00.000Z' });
    const cache = createIconDiscoveryCache(db, { now: () => new Date('2026-01-01T00:00:00Z') });

    await cache.pruneExpired(1);

    assert.equal(db.rows.size, 2);
    assert.equal(db.rows.has('https://fresh.example'), true);
});
