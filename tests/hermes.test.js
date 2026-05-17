const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

const { success } = require('../backend/utils/response');

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createMemoryDb() {
    const auditRows = [];
    return {
        USE_MYSQL: false,
        auditRows,
        getDatabaseType: () => 'sqlite',
        async execute(sql, params = []) {
            if (/INSERT INTO hermes_audit/i.test(sql)) {
                auditRows.push({
                    id: params[0],
                    job_id: params[1],
                    action: params[2],
                    risk: params[3],
                    status: params[4],
                    message: params[5],
                    created_at: new Date().toISOString()
                });
                return { changes: 1 };
            }
            return { changes: 0 };
        },
        async queryAll(sql) {
            if (/FROM hermes_audit/i.test(sql)) return [...auditRows].reverse();
            return [];
        }
    };
}

async function withServer(handler, fn) {
    const server = http.createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
        return await fn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

function createApp(db) {
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.use('/api/hermes', require('../backend/routes/hermes')(db));
    app.get('/ok', (req, res) => res.json(success(true)));
    app.use((err, req, res, next) => {
        res.status(err.statusCode || 500).json({ success: false, error: err.message });
    });
    return app;
}

async function pollJob(baseUrl, jobId, token, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const res = await fetch(`${baseUrl}/api/hermes/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const body = await res.json();
        if (body.data?.status === 'succeeded' || body.data?.status === 'failed') return body;
        await wait(20);
    }
    throw new Error('job did not finish in time');
}

test('Hermes status reports safe action allowlist without exposing secrets', async () => {
    const previous = { ...process.env };
    try {
        delete process.env.HERMES_API_BASE_URL;
        delete process.env.HERMES_API_KEY;
        delete process.env.HERMES_WEBHOOK_URL;
        process.env.ADMIN_TOKEN = 'admin-test-token';
        const app = createApp(createMemoryDb());
        await withServer(app, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/api/hermes/status`);
            const body = await res.json();
            assert.equal(res.status, 200);
            assert.equal(body.success, true);
            assert.equal(body.data.configured, false);
            assert.ok(body.data.actions.some(action => action.id === 'service_diagnose'));
            assert.ok(body.data.actions.every(action => !/token|key|secret/i.test(JSON.stringify(action))));
        });
    } finally {
        process.env = previous;
    }
});

test('Hermes job creation requires strict admin token', async () => {
    const previous = { ...process.env };
    try {
        process.env.ADMIN_TOKEN = 'admin-test-token';
        process.env.HERMES_API_BASE_URL = 'http://127.0.0.1:1';
        const app = createApp(createMemoryDb());
        await withServer(app, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/api/hermes/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'service_diagnose', input: { serviceName: 'nginx' } })
            });
            const body = await res.json();
            assert.equal(res.status, 401);
            assert.equal(body.success, false);
        });
    } finally {
        process.env = previous;
    }
});

test('Hermes API jobs run asynchronously, store audit rows, and return model text', async () => {
    const previous = { ...process.env };
    try {
        await withServer((req, res) => {
            assert.equal(req.url, '/v1/chat/completions');
            assert.equal(req.headers.authorization, 'Bearer api-test-token');
            let raw = '';
            req.on('data', chunk => { raw += chunk; });
            req.on('end', () => {
                const payload = JSON.parse(raw);
                assert.equal(payload.stream, false);
                assert.ok(payload.messages.some(message => /nginx/.test(message.content)));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ choices: [{ message: { content: 'nginx 看起来正常；建议检查上游健康检查。' } }] }));
            });
        }, async (apiBase) => {
            process.env.ADMIN_TOKEN = 'admin-test-token';
            process.env.HERMES_API_BASE_URL = apiBase;
            process.env.HERMES_API_KEY = 'api-test-token';
            process.env.HERMES_MODEL = 'hermes-test';
            const db = createMemoryDb();
            const app = createApp(db);
            await withServer(app, async (baseUrl) => {
                const res = await fetch(`${baseUrl}/api/hermes/jobs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer admin-test-token'
                    },
                    body: JSON.stringify({
                        action: 'service_diagnose',
                        input: { serviceName: 'nginx', server: { id: 'us-vps', status: 'online' } }
                    })
                });
                const accepted = await res.json();
                assert.equal(res.status, 202);
                assert.equal(accepted.success, true);
                assert.match(accepted.data.id, /^hj_/);

                const finished = await pollJob(baseUrl, accepted.data.id, 'admin-test-token');
                assert.equal(finished.data.status, 'succeeded');
                assert.equal(finished.data.result.text, 'nginx 看起来正常；建议检查上游健康检查。');
                assert.ok(db.auditRows.some(row => row.status === 'created'));
                assert.ok(db.auditRows.some(row => row.status === 'succeeded'));
            });
        });
    } finally {
        process.env = previous;
    }
});

test('Hermes API jobs accept base URLs with existing /v1 suffix', async () => {
    const previous = { ...process.env };
    try {
        await withServer((req, res) => {
            assert.equal(req.url, '/v1/chat/completions');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
        }, async (apiBase) => {
            process.env.ADMIN_TOKEN = 'admin-test-token';
            process.env.HERMES_API_BASE_URL = `${apiBase}/v1`;
            process.env.HERMES_API_KEY = 'api-test-token';
            const app = createApp(createMemoryDb());
            await withServer(app, async (baseUrl) => {
                const res = await fetch(`${baseUrl}/api/hermes/jobs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer admin-test-token'
                    },
                    body: JSON.stringify({ action: 'service_diagnose', input: { serviceName: 'nginx' } })
                });
                const accepted = await res.json();
                assert.equal(res.status, 202);
                const finished = await pollJob(baseUrl, accepted.data.id, 'admin-test-token');
                assert.equal(finished.data.status, 'succeeded');
                assert.equal(finished.data.result.text, 'ok');
            });
        });
    } finally {
        process.env = previous;
    }
});

test('Hermes jobs reject unknown actions before contacting upstream', async () => {
    const previous = { ...process.env };
    try {
        process.env.ADMIN_TOKEN = 'admin-test-token';
        process.env.HERMES_API_BASE_URL = 'http://127.0.0.1:1';
        const app = createApp(createMemoryDb());
        await withServer(app, async (baseUrl) => {
            const res = await fetch(`${baseUrl}/api/hermes/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer admin-test-token'
                },
                body: JSON.stringify({ action: 'shell_delete_everything', input: {} })
            });
            const body = await res.json();
            assert.equal(res.status, 400);
            assert.match(body.error, /不支持的 Hermes 动作/);
        });
    } finally {
        process.env = previous;
    }
});
