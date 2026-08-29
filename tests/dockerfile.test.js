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

test('runtime Docker stage reuses compiled production dependencies and has a fast health check', () => {
  const dockerfile = fs.readFileSync(path.resolve(__dirname, '../Dockerfile'), 'utf8');
  const stages = dockerfile.split(/^FROM /m).filter(Boolean);
  const runtimeStage = stages.at(-1);

  assert.match(dockerfile, /AS production-deps/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /COPY --from=production-deps \/app\/node_modules \.\/node_modules/);
  assert.doesNotMatch(runtimeStage, /\b(?:python3|make|g\+\+)\b/);
  assert.match(runtimeStage, /apk add --no-cache ca-certificates libstdc\+\+/);
  assert.match(runtimeStage, /HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3/);
});
