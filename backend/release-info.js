const { execFileSync } = require('node:child_process');
const packageJson = require('../package.json');

function normalize(value, fallback) {
    const text = String(value || '').trim();
    return text || fallback;
}

function gitDescribe() {
    try {
        // 无 tag 时 git describe --tags --always 会返回短 commit hash，避免版本永远是固定值
        return execFileSync('git', ['describe', '--tags', '--always', '--abbrev=7'], {
            cwd: __dirname,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 1000
        }).trim();
    } catch {
        return '';
    }
}

function getReleaseInfo(env = process.env) {
    return {
        version: normalize(env.APP_VERSION, gitDescribe() || packageJson.version),
        commit: normalize(env.GIT_COMMIT, 'development'),
        buildTime: normalize(env.BUILD_TIME, null)
    };
}

module.exports = { getReleaseInfo };
