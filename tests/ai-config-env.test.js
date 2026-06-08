const test = require('node:test');
const assert = require('node:assert/strict');

function loadAiConfigWithEnv(env = {}) {
    const configPath = require.resolve('../shared/services/ai/config');
    const paramsPath = require.resolve('../shared/services/ai/params');
    delete require.cache[configPath];
    delete require.cache[paramsPath];
    const previous = { ...process.env };
    for (const key of [
        'AI_CLIENT_OVERRIDES',
        'AI_ALLOW_CLIENT_KEY',
        'AI_ALLOW_CLIENT_BASE_URL',
        'AI_ALLOW_CLIENT_PROVIDER',
        'AI_ALLOW_CLIENT_PARAMS',
        'AI_ALLOW_PRIVATE_BASE_URL'
    ]) {
        if (!(key in env)) delete process.env[key];
    }
    Object.assign(process.env, env);
    const config = require('../shared/services/ai/config');
    return { config, restore: () => { process.env = previous; } };
}

test('AI_CLIENT_OVERRIDES=true enables all client override permissions', () => {
    const { config, restore } = loadAiConfigWithEnv({ AI_CLIENT_OVERRIDES: 'true' });

    try {
        const status = config.getAiPublicStatus();

        assert.equal(status.allowClientKey, true);
        assert.equal(status.allowClientBaseUrl, true);
        assert.equal(status.allowClientProvider, true);
        assert.equal(status.allowClientParams, true);
    } finally {
        restore();
    }
});

test('legacy AI_ALLOW_CLIENT_KEY still enables only client key override', () => {
    const { config, restore } = loadAiConfigWithEnv({ AI_ALLOW_CLIENT_KEY: 'true' });

    try {
        const status = config.getAiPublicStatus();

        assert.equal(status.allowClientKey, true);
        assert.equal(status.allowClientBaseUrl, false);
        assert.equal(status.allowClientProvider, false);
        assert.equal(status.allowClientParams, false);
    } finally {
        restore();
    }
});

test('AI_CLIENT_OVERRIDES=false can disable legacy granular override flags', () => {
    const { config, restore } = loadAiConfigWithEnv({
        AI_CLIENT_OVERRIDES: 'false',
        AI_ALLOW_CLIENT_KEY: 'true',
        AI_ALLOW_CLIENT_BASE_URL: 'true',
        AI_ALLOW_CLIENT_PROVIDER: 'true',
        AI_ALLOW_CLIENT_PARAMS: 'true'
    });

    try {
        const status = config.getAiPublicStatus();

        assert.equal(status.allowClientKey, false);
        assert.equal(status.allowClientBaseUrl, false);
        assert.equal(status.allowClientProvider, false);
        assert.equal(status.allowClientParams, false);
    } finally {
        restore();
    }
});

test('ALLOW_PRIVATE_NETWORK=true allows private AI base URLs without legacy AI flag', () => {
    const { config, restore } = loadAiConfigWithEnv({ ALLOW_PRIVATE_NETWORK: 'true' });

    try {
        assert.equal(config.normalizeBaseUrl('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1');
    } finally {
        restore();
    }
});
