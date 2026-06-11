# Bookmark Nav Icon Acquisition Refactor Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task. Keep each task small, run the targeted tests after each phase, and commit frequently. For this personal `ZJ-zhangcn/bookmarks` project, default to direct `main` commits/push/deploy only when the user explicitly asks to execute.

**Goal:** Refactor bookmark-nav's icon acquisition system so backend owns discovery/validation/ranking/cache, frontend owns presentation/selection, and duplicated icon policy is centralized without changing existing user-facing behavior.

**Architecture:** Keep current public API paths compatible (`/api/favicon`, `/api/proxy-icon`, `/api/icon/*`, `/api/icons`) while extracting shared pure policy and service modules behind them. Use a structured icon candidate contract internally, but continue exposing legacy `data.icons` during migration. Ship in phases: policy extraction first, backend service split second, frontend picker/display split third, optional persistent cache last.

**Tech Stack:** Node.js 20+, Express, Vite, vanilla ES modules frontend, CommonJS test helpers, SQLite/MySQL-compatible DB service wrappers, `node:test`, ESLint.

---

## 0. Current Baseline

### Current high-signal files

- Backend routes/controller:
  - `backend/routes/icon-unified.js`
- Backend discovery/parser/fetch:
  - `backend/services/icon-discovery-service.js`
  - `backend/utils/icon-discovery.js`
  - `backend/utils/icon-proxy.js`
  - `backend/utils/safe-fetch.js`
- Shared DB services:
  - `shared/services/icons.js`
  - `shared/services/bookmarks.js`
- Frontend acquisition/UI/display:
  - `frontend/modules/favicon.js`
  - `frontend/modules/favicon-helpers.cjs`
  - `frontend/modules/icon-library.js`
  - `frontend/modules/render.js`
  - `frontend/modules/utils.js`
- Tests currently covering the area:
  - `tests/icon-acquisition.test.js`
  - `tests/icon-discovery-service.test.js`
  - `tests/icon-preview-regression.test.js`
  - `tests/icon-proxy.test.js`
  - `tests/icon-proxy-routes.test.js`

### Current behavior to preserve

- `/api/favicon` discovers icon candidates from page HTML, manifest, apple-touch-icon, site fallbacks, and public provider fallbacks.
- Public provider fallback order remains:
  1. `https://www.google.com/s2/favicons?domain=<host>&sz=64`
  2. `https://favicon.im/<host>`
  3. `https://icon.horse/icon/<host>`
- Private/local hosts must not receive public provider fallbacks.
- Browser-side probing remains limited to private/local hosts to avoid noisy CORS failures on public sites.
- `icon.horse` remains visible as a letter fallback option.
- Weak provider candidates such as Google/favicon.im can be hidden on image error or solid-placeholder detection.
- Saved public HTTP icons on HTTPS pages are displayed through `/api/proxy-icon`; private/local HTTP icons are not proxied.
- Existing icon library upload/delete/clear flows keep working.
- Existing tests should pass throughout migration.

### Current pain points

- Icon policy is duplicated across backend and frontend:
  - provider list
  - fallback paths
  - source labels
  - source family dedupe
  - private/local handling
  - proxy preference hosts
  - placeholder/error hiding rules
- `backend/routes/icon-unified.js` is doing route mapping, fetch, convert, batch update, and library storage orchestration in one file.
- `frontend/modules/favicon.js` mixes API calls, local browser probing, DOM rendering, search engine icon flow, and bookmark icon flow.
- Frontend often infers source by `url.includes(...)` instead of consuming structured metadata.

---

## 1. Target Contract

### 1.1 Internal candidate shape

Use this shape internally in backend and gradually on frontend:

```js
{
  url: 'https://example.com/apple-touch-icon.png',
  displayUrl: '',
  source: 'apple',
  type: 'site',
  label: 'Apple',
  score: 360,
  usable: true,
  contentType: 'image/png',
  bytes: 12345,
  reason: ''
}
```

Field meaning:

- `url`: original stable icon URL to save if user selects it.
- `displayUrl`: optional rendered URL. Frontend may compute this through `/api/proxy-icon` when needed.
- `source`: one of `manifest`, `apple`, `favicon`, `og`, `site-fallback`, `google`, `faviconim`, `icon-horse`, `unknown`.
- `type`: `site`, `provider`, or `local`.
- `label`: user-facing label such as `页面图标`, `Apple`, `Google`, `字母`.
- `score`: ranking score; higher is better.
- `usable`: backend validation result when available.
- `contentType`: validated response content type when available.
- `bytes`: validated downloaded byte size when available.
- `reason`: rejection/fallback reason when unavailable.

### 1.2 `/api/favicon` response shape

Keep legacy `icons` array while adding structured fields:

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "cache": "miss",
    "target": "https://example.com/page",
    "origin": "https://example.com",
    "recommended": {
      "url": "https://example.com/apple-touch-icon.png",
      "source": "apple",
      "label": "Apple",
      "reason": "highest-score-validated"
    },
    "icons": [
      "https://example.com/apple-touch-icon.png",
      "https://www.google.com/s2/favicons?domain=example.com&sz=64",
      "https://favicon.im/example.com",
      "https://icon.horse/icon/example.com"
    ],
    "candidates": [
      {
        "url": "https://example.com/apple-touch-icon.png",
        "source": "apple",
        "type": "site",
        "label": "Apple",
        "score": 360,
        "usable": true,
        "contentType": "image/png",
        "bytes": 12345
      }
    ],
    "fallbacks": [
      {
        "url": "https://www.google.com/s2/favicons?domain=example.com&sz=64",
        "source": "google",
        "type": "provider",
        "label": "Google",
        "usable": false,
        "reason": "provider-fallback"
      }
    ],
    "rejected": []
  }
}
```

### 1.3 Non-goals

Do **not** add Playwright/headless browser discovery.
Do **not** auto-convert every discovered icon to base64.
Do **not** change existing DB schema in Phases 1-3.
Do **not** remove provider fallbacks.
Do **not** reintroduce removed monitor/service-status features.

---

## 2. Phase 1 — Centralize Shared Icon Policy

**Risk:** Low  
**Expected behavior change:** None  
**Primary benefit:** One place for provider/fallback/source/label/proxy policy.

### Task 1: Add shared icon policy module

**Objective:** Create a single pure CommonJS module used by backend, frontend CommonJS helpers, and frontend ESM modules through default interop.

**Files:**

- Create: `shared/icon-policy.cjs`
- Test: `tests/icon-policy.test.js`

**Step 1: Write failing tests**

Create `tests/icon-policy.test.js` with tests for:

- public provider fallback order
- no provider fallback for private/local hosts
- source detection for Google/favicon.im/icon.horse/apple/favicon
- label mapping
- source family dedupe for apple-touch-icon variants
- proxy preference host matching

Test skeleton:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../shared/icon-policy.cjs');

test('public provider fallbacks preserve order', () => {
  assert.deepEqual(policy.buildProviderFallbacks('example.com'), [
    'https://www.google.com/s2/favicons?domain=example.com&sz=64',
    'https://favicon.im/example.com',
    'https://icon.horse/icon/example.com'
  ]);
});

test('private hosts do not get public provider fallbacks', () => {
  assert.deepEqual(policy.buildProviderFallbacks('192.168.1.1'), []);
  assert.deepEqual(policy.buildProviderFallbacks('nas.local'), []);
});

test('source metadata is derived consistently', () => {
  assert.equal(policy.getIconSource('https://www.google.com/s2/favicons?domain=example.com&sz=64'), 'google');
  assert.equal(policy.getIconSource('https://favicon.im/example.com'), 'faviconim');
  assert.equal(policy.getIconSource('https://icon.horse/icon/example.com'), 'icon-horse');
  assert.equal(policy.getIconSource('https://example.com/apple-touch-icon.png'), 'apple');
  assert.equal(policy.getIconSource('https://example.com/favicon.ico'), 'favicon');
});
```

**Step 2: Run targeted test to confirm failure**

```bash
node --test tests/icon-policy.test.js
```

Expected: fail because `shared/icon-policy.cjs` does not exist.

**Step 3: Implement module**

Initial API:

```js
const PUBLIC_ICON_PROVIDERS = [
  {
    source: 'google',
    label: 'Google',
    type: 'provider',
    buildUrl: hostname => `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
    hideOnError: true,
    hideSolidPlaceholder: true
  },
  {
    source: 'faviconim',
    label: 'Favicon.im',
    type: 'provider',
    buildUrl: hostname => `https://favicon.im/${hostname}`,
    hideOnError: true,
    hideSolidPlaceholder: true
  },
  {
    source: 'icon-horse',
    label: '字母',
    type: 'provider',
    buildUrl: hostname => `https://icon.horse/icon/${hostname}`,
    hideOnError: false,
    hideSolidPlaceholder: false
  }
];

const SITE_FALLBACK_PATHS = [
  '/favicon.ico',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png'
];

const PREFER_PROXY_HOSTS = [
  'grok.com',
  'github.com',
  'githubusercontent.com',
  'google.com',
  'huggingface.co',
  'zhihu.com',
  'tool.lu',
  'leaflow.net',
  'the-x.cn'
];
```

Add exported functions:

```js
module.exports = {
  PUBLIC_ICON_PROVIDERS,
  SITE_FALLBACK_PATHS,
  PREFER_PROXY_HOSTS,
  buildProviderFallbacks,
  buildSiteFallbacks,
  getIconSource,
  getIconType,
  getIconLabel,
  getIconCandidateDefaults,
  getIconSourceFamily,
  isSameIconSourceFamily,
  shouldHideIconOnError,
  shouldHideSolidPlaceholder,
  shouldPreferProxyHost,
  uniqueUrls
};
```

**Step 4: Verify**

```bash
node --test tests/icon-policy.test.js
```

Expected: pass.

**Step 5: Commit**

```bash
git add shared/icon-policy.cjs tests/icon-policy.test.js
git commit -m "refactor: centralize icon policy"
```

---

### Task 2: Reuse policy in backend discovery service

**Objective:** Replace duplicated provider/fallback/source label logic in backend with shared policy.

**Files:**

- Modify: `backend/services/icon-discovery-service.js`
- Test: `tests/icon-discovery-service.test.js`
- Test: `tests/icon-policy.test.js`

**Step 1: Add/adjust tests**

Extend `tests/icon-discovery-service.test.js` to assert:

- result candidates include `source` and `label`
- fallback entries are separated or still represented without losing legacy `icons`
- provider order remains unchanged

Example assertion:

```js
assert.equal(result.candidates[0].source, 'apple');
assert.equal(result.candidates[0].label, 'Apple');
assert.equal(result.icons.at(-1), 'https://icon.horse/icon/example.com');
```

**Step 2: Run targeted tests before implementation**

```bash
node --test tests/icon-discovery-service.test.js tests/icon-policy.test.js
```

Expected: new metadata assertions fail until service is updated.

**Step 3: Refactor implementation**

In `backend/services/icon-discovery-service.js`:

- import `../../shared/icon-policy.cjs`
- replace local `uniqueUrls`
- replace local `fallbackSource`
- replace local `getPublicProviderFallbacks`
- replace local fallback path construction with `buildSiteFallbacks`
- when building candidate objects, enrich with `getIconCandidateDefaults(url)`

Preserve exported API:

```js
module.exports = {
  createIconDiscoveryService,
  getFallbackIcons,
  SUCCESS_TTL_MS,
  FALLBACK_TTL_MS
};
```

Do **not** remove `getFallbackIcons` yet; keep it as compatibility wrapper around shared policy.

**Step 4: Verify**

```bash
node --test tests/icon-discovery-service.test.js tests/icon-policy.test.js
npm test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add backend/services/icon-discovery-service.js tests/icon-discovery-service.test.js tests/icon-policy.test.js
git commit -m "refactor: reuse shared icon policy in discovery"
```

---

### Task 3: Reuse policy in frontend favicon helpers and render code

**Objective:** Remove frontend duplicate provider/source/dedupe/proxy policy while preserving UI output.

**Files:**

- Modify: `frontend/modules/favicon-helpers.cjs`
- Modify: `frontend/modules/render.js`
- Modify: `frontend/modules/favicon.js`
- Modify: `frontend/modules/utils.js`
- Test: `tests/icon-acquisition.test.js`
- Test: `tests/icon-preview-regression.test.js`
- Test: `tests/icon-policy.test.js`

**Step 1: Add regression assertions**

Add tests that assert frontend files import/use `shared/icon-policy.cjs` instead of hardcoding each provider in multiple files. Keep this flexible enough not to block valid code organization.

Example:

```js
const source = fs.readFileSync(path.resolve(__dirname, '../frontend/modules/favicon-helpers.cjs'), 'utf8');
assert.match(source, /icon-policy\.cjs/);
```

**Step 2: Refactor CommonJS helper first**

In `frontend/modules/favicon-helpers.cjs`:

- import `../../shared/icon-policy.cjs`
- keep existing `isPrivateOrLocalAddress` implementation here unless moved in a separate task
- replace provider fallback construction with shared policy
- replace `shouldUseProxyUrlForIcon` preferred-host check with `policy.shouldPreferProxyHost`
- keep existing exports for compatibility

**Step 3: Refactor ESM render module**

In `frontend/modules/render.js`:

- import policy default:

```js
import iconPolicy from '../../shared/icon-policy.cjs';
```

- replace local `getIconSource`, `getIconSourceFamily`, `isSameIconSourceFamily`, `shouldHideIconOnError`, `shouldHideSolidPlaceholder` with calls to policy wrappers.
- preserve label text used by current UI/tests: `页面图标`, `默认图标`, `Apple`, `Google`, `Favicon.im`, `字母`.

**Step 4: Refactor local icon rendering in `favicon.js`**

Replace `localIconSourceLabel` with shared policy metadata:

```js
const source = iconPolicy.getIconCandidateDefaults(icon);
```

Keep `renderLocalIconSelection` behavior unchanged.

**Step 5: Refactor `utils.js` proxy preference**

Replace local `PREFER_PROXY_HOSTS` constant usage with `iconPolicy.shouldPreferProxyHost(host)`.

**Step 6: Verify**

```bash
node --test tests/icon-acquisition.test.js tests/icon-preview-regression.test.js tests/icon-policy.test.js
npm test
npm run lint
npm run build:frontend
```

Expected: all pass, build succeeds.

**Step 7: Commit**

```bash
git add frontend/modules/favicon-helpers.cjs frontend/modules/render.js frontend/modules/favicon.js frontend/modules/utils.js tests/icon-acquisition.test.js tests/icon-preview-regression.test.js tests/icon-policy.test.js
git commit -m "refactor: share frontend icon policy"
```

---

## 3. Phase 2 — Split Backend Icon Service From Route Layer

**Risk:** Low to Medium  
**Expected behavior change:** None  
**Primary benefit:** `icon-unified.js` becomes thin; fetch/convert/batch operations share code.

### Task 4: Extract backend image fetch/convert helper

**Objective:** Move public image fetch and base64 conversion out of route file.

**Files:**

- Create: `backend/services/icons/fetch-image.js`
- Modify: `backend/routes/icon-unified.js`
- Test: `tests/icon-proxy-routes.test.js`
- Test: `tests/icon-proxy.test.js`

**Step 1: Write helper tests or route-level regression**

If direct helper tests are easier, create `tests/icon-fetch-image.test.js` with mocked dependencies. Otherwise keep route tests and verify behavior through `/api/icon/convert`.

Required cases:

- non-image response rejected
- oversized image rejected
- image response converts to `data:<content-type>;base64,...`

**Step 2: Create helper**

`backend/services/icons/fetch-image.js` should export:

```js
async function fetchPublicImage(url, options = {}) {}
async function fetchPublicImageAsDataUrl(url, options = {}) {}
```

Use existing `safeFetch`, `AppError`, `DEFAULT_MAX_BYTES`, and headers.

**Step 3: Replace route-local functions**

In `backend/routes/icon-unified.js`, remove route-local `fetchPublicImage` implementation and import helper.

**Step 4: Verify**

```bash
node --test tests/icon-proxy.test.js tests/icon-proxy-routes.test.js
npm test
```

**Step 5: Commit**

```bash
git add backend/services/icons/fetch-image.js backend/routes/icon-unified.js tests/icon-fetch-image.test.js tests/icon-proxy.test.js tests/icon-proxy-routes.test.js
git commit -m "refactor: extract icon image fetch service"
```

---

### Task 5: Extract backend icon library storage service

**Objective:** Keep DB operations in `shared/services/icons.js`, but move route orchestration actions into a backend service that exposes clear methods.

**Files:**

- Create: `backend/services/icons/library-service.js`
- Modify: `backend/routes/icon-unified.js`
- Existing: `shared/services/icons.js`
- Test: `tests/icon-proxy-routes.test.js`

**Step 1: Define service API**

`backend/services/icons/library-service.js`:

```js
function createIconLibraryService(db) {
  return {
    list,
    upload,
    uploadFromUrl,
    deleteById,
    batchDelete,
    clearFromBookmarks,
    batchClearFromBookmarks
  };
}
```

Internally call existing `shared/services/icons.js` functions.

**Step 2: Refactor routes**

Route branches remain equivalent, but call service methods:

```js
const iconLibrary = createIconLibraryService(db);
router.get('/icons', asyncHandler(async (req, res) => res.json(success(await iconLibrary.list()))));
```

**Step 3: Verify**

```bash
node --test tests/icon-proxy-routes.test.js
npm test
npm run lint
```

**Step 4: Commit**

```bash
git add backend/services/icons/library-service.js backend/routes/icon-unified.js
git commit -m "refactor: extract icon library backend service"
```

---

### Task 6: Extract backend bookmark icon batch service

**Objective:** Move `/api/icon/fix-all` and `/api/icon/fetch-all` business loops out of route file.

**Files:**

- Create: `backend/services/icons/bookmark-icon-service.js`
- Modify: `backend/routes/icon-unified.js`
- Test: create `tests/bookmark-icon-service.test.js` or extend existing route tests

**Step 1: Define service API**

```js
function createBookmarkIconService(db, deps = {}) {
  return {
    convertUrlIconsToBase64,
    fetchMissingBookmarkIcons
  };
}
```

Return existing response-compatible payloads:

```js
{
  message: '获取完成：N 个成功，M 个失败',
  fetched: N,
  failed: M,
  total: T,
  failures: []
}
```

**Step 2: Add unit tests with fake DB**

Fake DB should implement:

```js
queryAll(sql) {}
execute(sql, params) {}
```

Test cases:

- URL icons convert successfully
- failed conversion is recorded without aborting the batch
- missing icons use discovery result first icon
- missing icon failure increments failed count

**Step 3: Refactor route**

`icon-unified.js` calls service:

```js
const result = await bookmarkIconService.fetchMissingBookmarkIcons();
res.json(success(result));
```

**Step 4: Verify**

```bash
node --test tests/bookmark-icon-service.test.js
npm test
npm run lint
```

**Step 5: Commit**

```bash
git add backend/services/icons/bookmark-icon-service.js backend/routes/icon-unified.js tests/bookmark-icon-service.test.js
git commit -m "refactor: extract bookmark icon batch service"
```

---

### Task 7: Make `icon-unified.js` a thin controller

**Objective:** Ensure route file mainly maps HTTP endpoints to service calls.

**Files:**

- Modify: `backend/routes/icon-unified.js`
- Test: all icon-related tests

**Step 1: Inspect route file size and responsibilities**

Before:

```bash
python3 - <<'PY'
from pathlib import Path
p=Path('backend/routes/icon-unified.js')
print(len(p.read_text().splitlines()))
PY
```

Expected before refactor: around 292 lines.

**Step 2: Remove leftover local helpers**

After Tasks 4-6, route should no longer define:

- `fetchPublicImage`
- `readLimitedArrayBuffer`
- `safeFetchPublicUrl` compatibility wrappers unless strictly required by proxy adapter
- batch loops over bookmarks

**Step 3: Verify compatibility routes**

Ensure these still exist:

```text
POST /api/favicon
GET  /api/proxy-icon
GET  /api/icon/proxy
POST /api/icon/convert
POST /api/icon/fix-all
POST /api/icon/fetch-all
GET  /api/icons
POST /api/icons
DELETE /api/icons
```

**Step 4: Verify**

```bash
node --test tests/icon-proxy.test.js tests/icon-proxy-routes.test.js tests/icon-discovery-service.test.js
npm test
npm run lint
```

**Step 5: Commit**

```bash
git add backend/routes/icon-unified.js
git commit -m "refactor: thin icon route controller"
```

---

## 4. Phase 3 — Split Frontend Icon Client, Picker, and Display

**Risk:** Medium  
**Expected behavior change:** None intended; UI must be smoke-tested manually.  
**Primary benefit:** `favicon.js` stops owning API, DOM, and policy all at once.

### Task 8: Add frontend icon client module

**Objective:** Centralize API calls and response normalization.

**Files:**

- Create: `frontend/modules/icon-client.js`
- Modify: `frontend/modules/favicon.js`
- Test: `tests/icon-acquisition.test.js`

**Step 1: Define API**

`frontend/modules/icon-client.js`:

```js
import * as state from './state.js';
import { normalizeFaviconResponse } from './favicon-helpers.cjs';

export async function discoverIcons(url) {
  const res = await fetch(`${state.API_BASE}/api/favicon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  const data = await res.json().catch(() => null);
  return {
    ok: res.ok && data?.success === true,
    raw: data,
    icons: normalizeFaviconResponse(data),
    candidates: normalizeIconCandidates(data)
  };
}
```

Keep `normalizeIconCandidates` tolerant of current and future response shapes.

**Step 2: Replace repeated fetch blocks**

In `frontend/modules/favicon.js`, replace repeated `/api/favicon` fetch code in:

- `fetchFavicon`
- `fetchMoreIcons`
- `fetchProxyFavicon`
- `fetchEngineIcon`

with `discoverIcons(url)`.

**Step 3: Verify**

```bash
node --test tests/icon-acquisition.test.js
npm test
npm run build:frontend
```

**Step 4: Commit**

```bash
git add frontend/modules/icon-client.js frontend/modules/favicon.js tests/icon-acquisition.test.js
git commit -m "refactor: add frontend icon client"
```

---

### Task 9: Add frontend icon picker module

**Objective:** Move bookmark modal icon candidate rendering and selection into a dedicated module.

**Files:**

- Create: `frontend/modules/icon-picker.js`
- Modify: `frontend/modules/render.js`
- Modify: `frontend/modules/favicon.js`
- Test: `tests/icon-preview-regression.test.js`

**Step 1: Move picker functions**

Move these from `render.js` and `favicon.js` into `icon-picker.js`:

- `renderIconSelection`
- local icon selection renderer
- `renderIconPreviewImage`
- visible option filtering
- click binding for `.icon-option-wrap`

Expose:

```js
export function renderIconCandidates(container, icons, options = {}) {}
export function clearIconCandidates(container, fallback = '🌐') {}
export function getSelectedIconUrl(container) {}
```

**Step 2: Keep compatibility export**

For minimal churn, `render.js` can re-export:

```js
export { renderIconSelection } from './icon-picker.js';
```

or call the new module internally until all imports are migrated.

**Step 3: Update tests**

Keep existing regression expectations but point structural checks to `icon-picker.js` where appropriate.

**Step 4: Verify**

```bash
node --test tests/icon-preview-regression.test.js tests/icon-acquisition.test.js
npm test
npm run lint
npm run build:frontend
```

**Step 5: Commit**

```bash
git add frontend/modules/icon-picker.js frontend/modules/render.js frontend/modules/favicon.js tests/icon-preview-regression.test.js
git commit -m "refactor: extract frontend icon picker"
```

---

### Task 10: Add frontend icon display module

**Objective:** Centralize safe image URL/proxy/fallback rendering for saved icons.

**Files:**

- Create: `frontend/modules/icon-display.js`
- Modify: `frontend/modules/utils.js`
- Modify: `frontend/modules/search.js`
- Modify: `frontend/modules/api.js`
- Modify: `frontend/modules/render.js`
- Test: `tests/icon-acquisition.test.js`
- Test: `tests/icon-preview-regression.test.js`

**Step 1: Define API**

`frontend/modules/icon-display.js`:

```js
export function toIconDisplayUrl(iconData, iconType = 'url') {}
export function iconImageHtml({ iconData, iconType, fallbackIcon = '🌐', alt = '' }) {}
export function bindIconImageFallbacks(root = document) {}
```

Internally reuse existing safe helpers and `bindImageFallbacks` to avoid behavior changes.

**Step 2: Replace repeated render snippets**

Refactor repeated code patterns like:

```js
const iconUrl = toPreferredIconImageUrl(item.icon_data);
iconHtml = `<img src="${escapeHtmlAttribute(iconUrl)}" ...>`;
```

Use `iconImageHtml` instead.

**Step 3: Verify**

```bash
node --test tests/icon-acquisition.test.js tests/icon-preview-regression.test.js
npm test
npm run build:frontend
```

**Step 4: Commit**

```bash
git add frontend/modules/icon-display.js frontend/modules/utils.js frontend/modules/search.js frontend/modules/api.js frontend/modules/render.js tests/icon-acquisition.test.js tests/icon-preview-regression.test.js
git commit -m "refactor: centralize frontend icon display"
```

---

### Task 11: Slim `frontend/modules/favicon.js`

**Objective:** Turn `favicon.js` into orchestration only, or split bookmark and search engine flows if still too large.

**Files:**

- Modify: `frontend/modules/favicon.js`
- Optional create: `frontend/modules/bookmark-icon-flow.js`
- Optional create: `frontend/modules/engine-icon-flow.js`
- Test: icon frontend tests

**Step 1: Measure current file size**

```bash
python3 - <<'PY'
from pathlib import Path
for f in ['frontend/modules/favicon.js', 'frontend/modules/icon-client.js', 'frontend/modules/icon-picker.js', 'frontend/modules/icon-display.js']:
    p=Path(f)
    if p.exists(): print(f, len(p.read_text().splitlines()))
PY
```

**Step 2: Remove dead duplicate helpers**

After Tasks 8-10, delete from `favicon.js` if unused:

- direct API fetch boilerplate
- local label/source helpers
- DOM picker renderer
- repeated no-candidate rendering

**Step 3: Keep exports stable**

Existing imports likely expect:

```js
fetchFavicon
fetchBookmarkMetadata
fetchMoreIcons
fetchProxyFavicon
fetchEngineIcon
updateEngineIconPreviewUrl
```

Do not rename these in this task.

**Step 4: Verify**

```bash
npm test
npm run lint
npm run build:frontend
```

**Step 5: Commit**

```bash
git add frontend/modules/favicon.js frontend/modules/bookmark-icon-flow.js frontend/modules/engine-icon-flow.js
git commit -m "refactor: slim frontend favicon orchestration"
```

---

## 5. Phase 4 — Optional Persistent Discovery Cache

**Risk:** Medium  
**Expected behavior change:** Faster repeat discovery across app restarts; possible stale icon results until TTL expiry.  
**Recommendation:** Only implement after Phases 1-3 are stable.

### Task 12: Add DB-backed icon discovery cache service

**Objective:** Persist discovery JSON per origin with success/fallback TTL.

**Files:**

- Modify: `backend/db.js`
- Create: `backend/services/icons/discovery-cache.js`
- Modify: `backend/services/icon-discovery-service.js` or new split discovery service
- Test: create `tests/icon-discovery-cache.test.js`

**Step 1: Add table**

SQLite-compatible DDL:

```sql
CREATE TABLE IF NOT EXISTS icon_discovery_cache (
  origin TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  status TEXT,
  expires_at DATETIME NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_icon_discovery_cache_expires ON icon_discovery_cache(expires_at);
```

For MySQL compatibility, ensure existing DB abstraction can execute compatible DDL separately if needed.

**Step 2: Implement service**

`backend/services/icons/discovery-cache.js` exports:

```js
function createIconDiscoveryCache(db) {
  return {
    get(origin),
    set(origin, result, ttlMs),
    delete(origin),
    pruneExpired(limit = 100)
  };
}
```

**Step 3: Integrate behind feature flag or safe default**

Options:

- Default on with TTL and graceful fallback to memory cache if DB fails.
- Or env flag: `ICON_DISCOVERY_PERSISTENT_CACHE=true`.

Recommended: default off initially unless user wants persistent cache.

**Step 4: Verify**

```bash
node --test tests/icon-discovery-cache.test.js tests/icon-discovery-service.test.js
npm test
```

**Step 5: Commit**

```bash
git add backend/db.js backend/services/icons/discovery-cache.js backend/services/icon-discovery-service.js tests/icon-discovery-cache.test.js
git commit -m "feat: add optional persistent icon discovery cache"
```

---

## 6. End-to-End Manual Smoke Test

Run after each phase, especially Phases 2 and 3.

### Local commands

```bash
npm test
npm run lint
npm run build:frontend
npm run dev
```

### Browser checks

Open local app and verify:

1. Add/edit bookmark with public URL `https://github.com/`
   - icon candidates show site/provider fallbacks
   - Google/favicon.im failures hide cleanly if they fail
   - icon.horse letter fallback remains visible
   - saving selected icon persists correct `icon_type`/`icon_data`

2. Add/edit bookmark with private URL, for example `http://192.168.1.1/`
   - no Google/favicon.im/icon.horse provider fallback
   - browser-side local fallback candidates are attempted
   - private HTTP icon is not proxied through backend

3. Search engine icon fetch
   - public search URL uses backend discovery
   - private/local search URL uses local fallback only

4. Icon library settings
   - list icons
   - upload local icon
   - upload from URL
   - delete uploaded icon
   - clear bookmark-sourced icon

5. Existing saved bookmarks
   - public URL icons still display
   - base64 icons still display
   - emoji icons still display
   - missing/failed image falls back without breaking layout

### API checks

```bash
curl -fsS -X POST http://127.0.0.1:3000/api/favicon \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://github.com/"}' | python3 -m json.tool

curl -fsS 'http://127.0.0.1:3000/api/proxy-icon?url=https%3A%2F%2Fgithub.com%2Ffavicon.ico' \
  -o /tmp/github-favicon.ico
file /tmp/github-favicon.ico
```

Expected:

- `/api/favicon` returns `success: true`
- response includes legacy `data.icons`
- response includes structured `data.candidates` after contract migration
- proxy endpoint returns image bytes, not SPA HTML

---

## 7. CI / Deploy Plan

Only after implementation is requested and all local checks pass.

### Local gate

```bash
npm test
npm run lint
npm run build:frontend
npm run audit:high
```

### GitHub gate

Because this is the user's personal `bookmarks` project, use direct push to `main` unless user explicitly asks for PR/review.

```bash
git status -sb
git push origin main
gh run list --branch main --limit 5
gh run watch <CI_RUN_ID> --exit-status
gh run watch <DOCKER_RUN_ID> --exit-status
```

Expected workflows:

- `CI`: success
- `构建并推送 Docker 镜像`: success

### Production refresh

Use bookmark-nav deployment reference:

```bash
ssh -p 42645 -i ~/.ssh/id_ed25519 -o IdentitiesOnly=yes root@192.129.152.33 '
set -e
cd /root/bookmarks
docker compose ps bookmark-nav
curl -fsS --max-time 8 http://127.0.0.1:3004/api/health
docker compose pull bookmark-nav
docker compose up -d bookmark-nav
for i in $(seq 1 10); do
  curl -fsS --max-time 8 http://127.0.0.1:3004/api/health && break
  sleep 2
done
docker ps --filter name=bookmark-nav --format "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"
docker image inspect ghcr.io/zj-zhangcn/bookmarks:latest -f "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}"
'
```

Public verification:

```bash
curl -fsS --max-time 15 https://bookmarks.942645.xyz/api/health
```

---

## 8. Rollback Plan

### Code rollback

If a phase causes regressions before push:

```bash
git status -sb
git restore <changed-files>
```

If a committed phase causes regressions locally:

```bash
git revert <commit-sha>
npm test
npm run lint
npm run build:frontend
```

### Production rollback

If already deployed and production breaks:

1. Revert commit on `main`.
2. Push `main`.
3. Wait for Docker workflow success.
4. Pull and recreate only `bookmark-nav` on us-vps.
5. Verify `/api/health` and icon flows.

Do not restart unrelated containers.

---

## 9. Acceptance Criteria

### Functional

- [ ] Public bookmark icon discovery works for common sites such as GitHub.
- [ ] Private/local bookmark icon flow does not call public fallback providers.
- [ ] Provider fallback order remains Google → favicon.im → icon.horse.
- [ ] `icon.horse` letter fallback stays visible as a selectable option.
- [ ] Failed provider images hide or degrade without removing the whole option list.
- [ ] Search engine auto icon fetch still works.
- [ ] Icon library upload/delete/clear flows still work.
- [ ] Existing saved `url`, `base64`, and `emoji` icons still render.
- [ ] Legacy API routes still exist.

### Technical

- [ ] Shared provider/fallback/source policy lives in `shared/icon-policy.cjs`.
- [ ] Backend discovery service no longer hardcodes provider fallbacks separately.
- [ ] Frontend render/fallback logic no longer hardcodes provider labels in multiple files.
- [ ] `backend/routes/icon-unified.js` becomes route/controller only after Phase 2.
- [ ] `frontend/modules/favicon.js` is reduced to orchestration after Phase 3.
- [ ] No new heavy dependencies are introduced.
- [ ] No DB schema migration is required before optional Phase 4.

### Verification

- [ ] `npm test` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build:frontend` passes.
- [ ] `npm run audit:high` passes before deploy.
- [ ] Production container revision matches pushed commit after deploy.
- [ ] Public health endpoint returns healthy after deploy.

---

## 10. Recommended Execution Strategy

Recommended sequence:

1. Implement Phase 1 first and stop.
2. Deploy Phase 1 if tests pass.
3. Use the app normally for a short period.
4. Implement Phase 2.
5. Deploy Phase 2.
6. Implement Phase 3 only after Phase 2 is stable.
7. Defer Phase 4 unless repeated discovery latency becomes annoying.

Reasoning:

- Phase 1 gives the largest maintainability gain with the lowest risk.
- Phase 2 reduces backend coupling without touching much UI.
- Phase 3 touches DOM and user interaction, so it should not be mixed with backend splitting in one large commit.
- Phase 4 changes persistence/cache semantics and should be optional.
