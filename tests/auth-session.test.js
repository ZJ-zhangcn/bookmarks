const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function loadAuth(env) {
    const path = require.resolve('../backend/middleware/auth');
    delete require.cache[path];
    const previous = { ...process.env };
    process.env = { ...previous, ...env };
    const auth = require('../backend/middleware/auth');
    return { auth, restore: () => { process.env = previous; delete require.cache[path]; } };
}

test('session token verifies with configured username and secret', () => {
    const { auth, restore } = loadAuth({ AUTH_MODE: 'session', AUTH_USERNAME: 'owner', AUTH_PASSWORD: 'pw', AUTH_SESSION_SECRET: crypto.randomBytes(32).toString('hex') });
    try {
        const token = auth.createSession('owner', 1000);
        assert.equal(auth.verifySession(token, 1001).u, 'owner');
        assert.equal(auth.verifySession(`${token}x`, 1001), null);
        assert.equal(auth.verifySession(token, 31 * 24 * 60 * 60 * 1000), null);
    } finally { restore(); }
});

test('requireSession accepts a valid cookie and rejects anonymous requests', () => {
    const { auth, restore } = loadAuth({ AUTH_MODE: 'session', AUTH_USERNAME: 'owner', AUTH_PASSWORD: 'pw', AUTH_SESSION_SECRET: 'secret' });
    try {
        const token = auth.createSession('owner');
        const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        let nextCalled = false;
        auth.requireSession({ headers: { cookie: `bookmark_nav_session=${encodeURIComponent(token)}` } }, response, () => { nextCalled = true; });
        assert.equal(nextCalled, true);

        const anonymousResponse = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
        auth.requireSession({ headers: {} }, anonymousResponse, () => {});
        assert.equal(anonymousResponse.statusCode, 401);
        assert.equal(anonymousResponse.body.code, 'AUTH_REQUIRED');
    } finally { restore(); }
});
