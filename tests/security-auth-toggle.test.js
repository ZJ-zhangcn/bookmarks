const test = require('node:test');
const assert = require('node:assert/strict');

function loadSecurityWithEnv(env = {}) {
    const modulePath = require.resolve('../backend/middleware/security');
    delete require.cache[modulePath];
    const previous = { ...process.env };
    for (const key of ['ADMIN_TOKEN', 'AUTH_MODE', 'ALLOW_ANONYMOUS_WRITE', 'DISABLE_ADMIN_AUTH', 'ALLOW_PRIVATE_NETWORK', 'ALLOW_PRIVATE_FETCH']) {
        if (!(key in env)) delete process.env[key];
    }
    Object.assign(process.env, env);
    const mod = require('../backend/middleware/security');
    return { mod, restore: () => { process.env = previous; } };
}

function runMiddleware(middleware, headers = {}) {
    let nextCalled = false;
    const req = { headers };
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
    middleware(req, res, () => { nextCalled = true; });
    return { nextCalled, statusCode: res.statusCode, body: res.body };
}

test('DISABLE_ADMIN_AUTH=true bypasses normal and strict admin middleware even when ADMIN_TOKEN is configured', () => {
    const { mod, restore } = loadSecurityWithEnv({
        ADMIN_TOKEN: 'secret-token',
        DISABLE_ADMIN_AUTH: 'true'
    });
    const { requireAdmin, requireStrictAdmin } = mod;

    try {
        assert.equal(runMiddleware(requireAdmin).nextCalled, true);
        assert.equal(runMiddleware(requireStrictAdmin).nextCalled, true);
    } finally {
        restore();
    }
});

test('AUTH_MODE=off bypasses normal and strict admin middleware', () => {
    const { mod, restore } = loadSecurityWithEnv({
        ADMIN_TOKEN: 'secret-token',
        AUTH_MODE: 'off'
    });
    const { requireAdmin, requireStrictAdmin } = mod;

    try {
        assert.equal(runMiddleware(requireAdmin).nextCalled, true);
        assert.equal(runMiddleware(requireStrictAdmin).nextCalled, true);
    } finally {
        restore();
    }
});

test('AUTH_MODE=token rejects anonymous writes even when legacy anonymous flag is set', () => {
    const { mod, restore } = loadSecurityWithEnv({
        ADMIN_TOKEN: 'secret-token',
        AUTH_MODE: 'token',
        ALLOW_ANONYMOUS_WRITE: 'true'
    });
    const { requireAdmin } = mod;

    try {
        const result = runMiddleware(requireAdmin);

        assert.equal(result.nextCalled, false);
        assert.equal(result.statusCode, 401);
    } finally {
        restore();
    }
});

test('strict admin middleware still rejects missing Authorization when auth is enabled', () => {
    const { mod, restore } = loadSecurityWithEnv({ ADMIN_TOKEN: 'secret-token' });
    const { requireStrictAdmin } = mod;

    try {
        const result = runMiddleware(requireStrictAdmin);

        assert.equal(result.nextCalled, false);
        assert.equal(result.statusCode, 401);
    } finally {
        restore();
    }
});

test('ALLOW_PRIVATE_NETWORK=true allows private URL checks without legacy private fetch flag', () => {
    const { mod, restore } = loadSecurityWithEnv({ ALLOW_PRIVATE_NETWORK: 'true' });

    try {
        const parsed = mod.assertSafeFetchUrl('http://127.0.0.1:8080/webdav');
        assert.equal(parsed.hostname, '127.0.0.1');
    } finally {
        restore();
    }
});
