const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

const iconUnifiedRoutes = require('../backend/routes/icon-unified');
const { errorHandler } = require('../backend/utils');

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function withServers(fn) {
  const previousAllowPrivate = process.env.ALLOW_PRIVATE_NETWORK;
  process.env.ALLOW_PRIVATE_NETWORK = 'true';

  const upstream = http.createServer((req, res) => {
    if (req.url === '/icon.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG_BYTES);
      return;
    }
    if (req.url === '/page') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><link rel="icon" href="/icon.png"><title>Icon Test</title>');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const upstreamPort = await listen(upstream);
  const app = express();
  app.use(express.json());
  app.use('/api', iconUnifiedRoutes({}));
  app.use(errorHandler);

  const apiServer = http.createServer(app);
  const apiPort = await listen(apiServer);

  try {
    await fn({
      apiBase: `http://127.0.0.1:${apiPort}`,
      upstreamBase: `http://127.0.0.1:${upstreamPort}`
    });
  } finally {
    await Promise.all([
      new Promise(resolve => apiServer.close(resolve)),
      new Promise(resolve => upstream.close(resolve))
    ]);
    if (previousAllowPrivate === undefined) delete process.env.ALLOW_PRIVATE_NETWORK;
    else process.env.ALLOW_PRIVATE_NETWORK = previousAllowPrivate;
  }
}

test('POST /api/favicon returns JSON icon discovery payload', async () => {
  await withServers(async ({ apiBase, upstreamBase }) => {
    const res = await fetch(`${apiBase}/api/favicon`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `${upstreamBase}/page` })
    });

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'ok');
    assert.equal(json.data.icons[0], `${upstreamBase}/icon.png`);
  });
});

test('GET /api/proxy-icon returns image content instead of SPA HTML', async () => {
  await withServers(async ({ apiBase, upstreamBase }) => {
    const res = await fetch(`${apiBase}/api/proxy-icon?url=${encodeURIComponent(`${upstreamBase}/icon.png`)}`);

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^image\/png/);
    assert.doesNotMatch(res.headers.get('content-type') || '', /text\/html/);
    assert.equal((await res.arrayBuffer()).byteLength, PNG_BYTES.byteLength);
  });
});

test('GET /api/icon/proxy keeps legacy proxy path compatible', async () => {
  await withServers(async ({ apiBase, upstreamBase }) => {
    const res = await fetch(`${apiBase}/api/icon/proxy?url=${encodeURIComponent(`${upstreamBase}/icon.png`)}`);

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^image\/png/);
    assert.doesNotMatch(res.headers.get('content-type') || '', /text\/html/);
  });
});
