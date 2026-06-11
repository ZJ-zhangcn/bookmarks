const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('frontend Docker build stage includes shared policy before Vite build', () => {
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
  const sharedCopyIndex = dockerfile.indexOf('COPY shared/ ./shared/');
  const frontendBuildIndex = dockerfile.indexOf('RUN npm run build:frontend');

  assert.notEqual(sharedCopyIndex, -1, 'frontend build stage must copy shared/ into /app/shared');
  assert.notEqual(frontendBuildIndex, -1, 'Dockerfile must run the frontend build');
  assert.equal(
    sharedCopyIndex < frontendBuildIndex,
    true,
    'shared/ must be copied before npm run build:frontend so ../../shared/icon-policy.cjs resolves in Docker'
  );
});
