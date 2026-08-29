const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { getReleaseInfo } = require('../backend/release-info');

test('release info exposes image version, commit and build time with local fallbacks', () => {
    assert.deepEqual(getReleaseInfo({
        APP_VERSION: 'v1.2.3',
        GIT_COMMIT: 'abc123',
        BUILD_TIME: '2026-08-29T00:00:00Z'
    }), {
        version: 'v1.2.3',
        commit: 'abc123',
        buildTime: '2026-08-29T00:00:00Z'
    });
    assert.equal(getReleaseInfo({}).version, require('../package.json').version);
    assert.equal(getReleaseInfo({}).commit, 'development');
    assert.equal(getReleaseInfo({}).buildTime, null);
});

test('Docker and CI inject release metadata into the published image', () => {
    const root = path.resolve(__dirname, '..');
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
    assert.match(dockerfile, /ARG APP_VERSION/);
    assert.match(dockerfile, /ARG GIT_COMMIT/);
    assert.match(dockerfile, /ARG BUILD_TIME/);
    assert.match(workflow, /Prepare release metadata/);
    assert.match(workflow, /build-args:[\s\S]*GIT_COMMIT=\$\{\{ github\.sha \}\}/);
    assert.match(workflow, /BUILD_TIME=\$\{\{ steps\.release\.outputs\.build_time \}\}/);
});
