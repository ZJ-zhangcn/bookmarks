const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

test('todo quick add guards IME composition and duplicate submissions', () => {
    const source = read('frontend/modules/todo.js');

    assert.match(source, /e\.isComposing/);
    assert.match(source, /e\.repeat/);
    assert.match(source, /quickAddPending/);
    assert.match(source, /input\.disabled\s*=\s*true/);
    assert.match(source, /input\.disabled\s*=\s*false/);
});

test('todo layout keeps the empty state compact and rows aligned', () => {
    const css = read('frontend/index.css');

    assert.match(css, /\.todo-card\s*\{[\s\S]*align-items:\s*center/);
    assert.match(css, /\.todo-card\s*\{[\s\S]*min-height:\s*40px/);
    assert.match(css, /\.todos-empty\s*\{[\s\S]*padding:\s*0\.5rem\s+0\.75rem/);
});
