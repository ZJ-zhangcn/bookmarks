const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function extractFunctionSource(source, functionName) {
    const start = source.indexOf(`function ${functionName}`);
    assert.notEqual(start, -1, `${functionName} should exist`);
    let depth = 0;
    let end = start;
    let entered = false;
    for (; end < source.length; end += 1) {
        const ch = source[end];
        if (ch === '{') {
            depth += 1;
            entered = true;
        } else if (ch === '}') {
            depth -= 1;
            if (entered && depth === 0) {
                end += 1;
                break;
            }
        }
    }
    return source.slice(start, end);
}

test('monitor server save does not prompt for admin token', () => {
    const settingsSource = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/settings.js'), 'utf8');
    const persistSource = extractFunctionSource(settingsSource, 'persistMonitorServers');

    assert.equal(persistSource.includes('showPrompt'), false);
    assert.equal(persistSource.includes('Authorization'), false);
    assert.match(persistSource, /fetch\(`\$\{state\.API_BASE\}\/api\/system\/config`/);
});
