const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const Database = require('better-sqlite3');

const serviceStatus = require('../shared/services/service-status');
const checker = require('../backend/services/service-checker');
const createServiceStatusRoute = require('../backend/routes/service-status');
const { errorHandler } = require('../backend/utils');

function createMemoryDb() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  raw.exec(`
    CREATE TABLE monitored_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE service_status_results (
      service_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      http_status INTEGER,
      latency_ms INTEGER,
      error_message TEXT,
      checked_at TEXT NOT NULL,
      FOREIGN KEY(service_id) REFERENCES monitored_services(id) ON DELETE CASCADE
    );
  `);
  return {
    getDatabaseType: () => 'sqlite',
    queryAll: async (sql, params = []) => raw.prepare(sql).all(...params),
    queryOne: async (sql, params = []) => raw.prepare(sql).get(...params),
    execute: async (sql, params = []) => raw.prepare(sql).run(...params),
    close: () => raw.close()
  };
}

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('service status service saves services and returns latest check result', async () => {
  const db = createMemoryDb();
  try {
    const saved = await serviceStatus.saveService(db, {
      name: '主页',
      url: 'https://example.com',
      enabled: true
    });
    await serviceStatus.saveStatusResult(db, {
      service_id: saved.id,
      status: 'ok',
      http_status: 204,
      latency_ms: 42,
      checked_at: '2026-06-11T10:00:00.000Z'
    });

    await serviceStatus.saveService(db, {
      id: saved.id,
      name: '主页状态页',
      url: 'https://example.com/status',
      enabled: false,
      sort_order: 0
    });

    const rows = await serviceStatus.getServiceStatus(db);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, saved.id);
    assert.equal(rows[0].name, '主页状态页');
    assert.equal(rows[0].url, 'https://example.com/status');
    assert.equal(rows[0].enabled, false);
    assert.equal(rows[0].status, 'ok');
    assert.equal(rows[0].http_status, 204);
    assert.equal(rows[0].latency_ms, 42);
    assert.equal(rows[0].checked_at, '2026-06-11T10:00:00.000Z');
  } finally {
    db.close();
  }
});

test('service status service rejects non-http monitored URLs', async () => {
  const db = createMemoryDb();
  try {
    await assert.rejects(
      () => serviceStatus.saveService(db, { name: '文件', url: 'file:///etc/passwd' }),
      /http\/https/
    );
  } finally {
    db.close();
  }
});

test('service checker records ok HTTP status and latency', async () => {
  await withEnv({ ALLOW_PRIVATE_NETWORK: 'true' }, async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(204, { 'Content-Type': 'text/plain' });
      res.end();
    });
    const port = await listen(upstream);
    try {
      const result = await checker.checkService({
        id: 'svc-local',
        name: 'Local OK',
        url: `http://127.0.0.1:${port}/health`
      });

      assert.equal(result.service_id, 'svc-local');
      assert.equal(result.status, 'ok');
      assert.equal(result.http_status, 204);
      assert.equal(typeof result.latency_ms, 'number');
      assert.equal(result.error_message, '');
    } finally {
      await new Promise(resolve => upstream.close(resolve));
    }
  });
});

test('service checker blocks private network URLs unless explicitly allowed', async () => {
  await withEnv({ ALLOW_PRIVATE_NETWORK: undefined, ALLOW_PRIVATE_FETCH: undefined }, async () => {
    const result = await checker.checkService({
      id: 'svc-private',
      name: 'Private',
      url: 'http://127.0.0.1:65535/health'
    });

    assert.equal(result.service_id, 'svc-private');
    assert.equal(result.status, 'down');
    assert.equal(result.http_status, null);
    assert.match(result.error_message, /内网|本地|不允许|禁止/);
  });
});

test('service status API can add, list, check, and delete monitored services', async () => {
  const db = createMemoryDb();
  await withEnv({ DISABLE_ADMIN_AUTH: 'true', ALLOW_PRIVATE_NETWORK: 'true' }, async () => {
    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    const upstreamPort = await listen(upstream);

    const app = express();
    app.use(express.json());
    app.use('/api/service-status', createServiceStatusRoute(db));
    app.use(errorHandler);
    const api = http.createServer(app);
    const apiPort = await listen(api);

    try {
      const apiBase = `http://127.0.0.1:${apiPort}`;
      const createRes = await fetch(`${apiBase}/api/service-status/services`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '健康页', url: `http://127.0.0.1:${upstreamPort}/health`, enabled: true })
      });
      assert.equal(createRes.status, 200);
      const created = await createRes.json();
      assert.equal(created.success, true);
      assert.match(created.data.id, /^svc_/);

      const checkRes = await fetch(`${apiBase}/api/service-status/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: created.data.id })
      });
      assert.equal(checkRes.status, 200);
      const checked = await checkRes.json();
      assert.equal(checked.success, true);
      assert.equal(checked.data[0].status, 'ok');

      const listRes = await fetch(`${apiBase}/api/service-status`);
      assert.equal(listRes.status, 200);
      const listed = await listRes.json();
      assert.equal(listed.success, true);
      assert.equal(listed.data[0].name, '健康页');
      assert.equal(listed.data[0].status, 'ok');

      const deleteRes = await fetch(`${apiBase}/api/service-status/services/${created.data.id}`, { method: 'DELETE' });
      assert.equal(deleteRes.status, 200);
      const afterDelete = await (await fetch(`${apiBase}/api/service-status`)).json();
      assert.equal(afterDelete.data.length, 0);
    } finally {
      await Promise.all([
        new Promise(resolve => api.close(resolve)),
        new Promise(resolve => upstream.close(resolve))
      ]);
    }
  });
  db.close();
});
