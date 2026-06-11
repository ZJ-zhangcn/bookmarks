const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.resolve(__dirname, '../.github/workflows/ci.yml');

test('CI workflow gates test, lint, frontend build, and high severity audit', () => {
  assert.equal(fs.existsSync(workflowPath), true, 'missing .github/workflows/ci.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');

  assert.match(workflow, /on:\s*[\s\S]*pull_request:/);
  assert.match(workflow, /on:\s*[\s\S]*push:/);
  assert.match(workflow, /node-version:\s*['"]?20/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run build:frontend/);
  assert.match(workflow, /npm run audit:high/);
});
