const packageJson = require('../package.json');

function normalize(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
}

function getReleaseInfo(env = process.env) {
    return {
        version: normalize(env.APP_VERSION, packageJson.version),
        commit: normalize(env.GIT_COMMIT, 'development'),
        buildTime: normalize(env.BUILD_TIME, null)
    };
}

module.exports = { getReleaseInfo };
