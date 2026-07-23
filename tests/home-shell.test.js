const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
const events = fs.readFileSync(path.join(__dirname, '../frontend/modules/events.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../frontend/index.css'), 'utf8');
const dom = fs.readFileSync(path.join(__dirname, '../frontend/modules/dom.js'), 'utf8');
const search = fs.readFileSync(path.join(__dirname, '../frontend/modules/search.js'), 'utf8');
const commandPalette = fs.readFileSync(path.join(__dirname, '../frontend/modules/command-palette.js'), 'utf8');
const settings = fs.readFileSync(path.join(__dirname, '../frontend/modules/settings.js'), 'utf8');

function indexOfId(id) {
    return html.indexOf(`id="${id}"`);
}

test('home shell presents the import-first library onboarding contract', () => {
    assert.match(
        html,
        /<section\s+id="libraryOnboarding"\s+class="library-onboarding"\s+aria-live="polite"\s+hidden[^>]*>/
    );

    for (const id of [
        'libraryOnboardingTitle',
        'libraryOnboardingHint',
        'onboardingBrowserImportBtn',
        'onboardingAddBookmarkBtn',
        'onboardingDismissBtn'
    ]) {
        assert.notEqual(indexOfId(id), -1, `expected #${id} in the home shell`);
    }

    assert.match(html, /id="onboardingBrowserImportBtn"[^>]*>导入浏览器书签<\/button>/);
    assert.match(html, /id="onboardingAddBookmarkBtn"[^>]*>添加第一个书签<\/button>/);
    assert.match(html, /id="onboardingDismissBtn"[^>]*>稍后再说<\/button>/);
    assert.ok(indexOfId('libraryOnboarding') < indexOfId('categoryNav'), 'onboarding precedes category navigation');

    for (const obsoleteId of ['emptyState', 'emptyAddBookmark', 'emptyAddCategory']) {
        assert.equal(indexOfId(obsoleteId), -1, `obsolete #${obsoleteId} must be removed`);
    }

    assert.equal((html.match(/id="browserImportFile"/g) || []).length, 1, 'reuse exactly one browser import file input');
});

test('onboarding dismissal is bound through its storage-resilient action', () => {
    assert.match(events, /import\s*\{[^}]*dismissSeedOnboarding[^}]*\}\s*from\s*'\.\/render\.js';/s);
    assert.match(events, /onboardingDismissBtn\?\.addEventListener\('click',\s*\(\)\s*=>\s*\{\s*dismissSeedOnboarding\(\);\s*renderAll\(\);\s*}\)/s);
});

test('home shell exposes one global-search entry and removes every legacy search entry', () => {
    const legacyIds = [
        'webSearchInput',
        'webSearchForm',
        'searchInput',
        'searchClear',
        'bookmarkSearchBtn',
        'bookmarkSearchOverlay',
        'bookmarkSearchInput',
        'bookmarkSearchClose',
        'bookmarkSearchResults'
    ];

    for (const id of legacyIds) {
        assert.equal(indexOfId(id), -1, `legacy #${id} must be removed from the home shell`);
    }

    const triggerTag = html.match(/<button\b[^>]*id="globalSearchTrigger"[^>]*>/)?.[0] || '';
    assert.match(triggerTag, /class="global-search-trigger"/);
    assert.match(triggerTag, /type="button"/);
    assert.match(triggerTag, /aria-haspopup="dialog"/);
    assert.match(html, /id="globalSearchTrigger"[\s\S]{0,500}?搜索书签或网页…/);
    assert.match(html, /<kbd>⌘ F<\/kbd>/);

    for (const id of ['engineBtn', 'engineIcon', 'engineName', 'engineDropdown', 'engineManageBtn', 'quickAddBtn', 'settingsBtn']) {
        assert.notEqual(indexOfId(id), -1, `expected #${id} in the unified search shell`);
    }
    assert.match(html, /id="quickAddBtn"[^>]*>\s*快速添加\s*<\/button>/);

    assert.match(html, /<div\b[^>]*id="globalSearchOverlay"[^>]*aria-hidden="true"[^>]*>/);
    assert.match(html, /class="global-search-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
    for (const id of ['globalSearchInput', 'globalSearchResults', 'globalSearchClose']) {
        assert.notEqual(indexOfId(id), -1, `expected #${id} in the global-search dialog`);
    }
    assert.match(html, /id="globalSearchResults"[^>]*role="region"[^>]*aria-label="搜索结果"[^>]*aria-live="polite"/);
    assert.doesNotMatch(html, /id="globalSearchResults"[^>]*role="listbox"/);
    assert.match(css, /\.global-search-overlay/);
    assert.match(css, /\.global-search-panel/);
});

test('global search visibility becomes focusable immediately on open and hides after its fade on close', () => {
    assert.match(
        css,
        /\.global-search-overlay\s*\{[\s\S]*?visibility:\s*hidden;[\s\S]*?transition:\s*opacity\s+var\(--transition-normal\),\s*visibility\s+0s\s+linear\s+var\(--transition-normal\);[\s\S]*?\}/,
        'closed overlay delays visibility:hidden until its opacity transition finishes'
    );
    assert.match(
        css,
        /\.global-search-overlay\.open\s*\{[\s\S]*?visibility:\s*visible;[\s\S]*?transition-delay:\s*0s;[\s\S]*?\}/,
        'opening overlay makes visibility:visible immediate for synchronous input focus'
    );
});

test('global search source contract uses the pure model and safe local and web actions', () => {
    for (const name of ['openGlobalSearch', 'closeGlobalSearch', 'handleGlobalSearch']) {
        assert.match(search, new RegExp(`export\\s+function\\s+${name}\\b`));
    }
    assert.doesNotMatch(search, /export\s+function\s+(openBookmarkSearch|closeBookmarkSearch|handleBookmarkSearch)\b/);
    assert.match(search, /buildGlobalSearchModel/);
    assert.match(search, /limit:\s*12/);
    assert.match(search, /recordBookmarkVisit/);
    assert.match(search, /toSafeExternalUrl/);
    assert.match(search, /escapeHtml/);
    assert.match(search, /escapeHtmlAttribute/);
    assert.match(search, /data-action="add-bookmark"/);
    assert.match(search, /window\.open\(toSafeExternalUrl/);
    assert.match(
        search,
        /DOM\.globalSearchResults\.innerHTML\s*=\s*`\$\{localResults\}\$\{webSearchAction\}\$\{addBookmarkAction\}`/,
        'local matches must be followed by web search before the no-result add-bookmark affordance'
    );
    assert.doesNotMatch(settings, /\.web-search-form/, 'settings must not target the deleted legacy web-search form');
    assert.doesNotMatch(settings, /DOM\.searchContainer\b/, 'settings must not target the deleted legacy bookmark-search container');

    for (const legacyCache of [
        'searchInput', 'searchClear', 'webSearchForm', 'webSearchInput',
        'bookmarkSearchBtn', 'bookmarkSearchOverlay', 'bookmarkSearchInput',
        'bookmarkSearchClose', 'bookmarkSearchResults'
    ]) {
        assert.doesNotMatch(dom, new RegExp(`\\b${legacyCache}\\s*:`), `DOM cache must not retain ${legacyCache}`);
    }
    for (const cache of ['globalSearchTrigger', 'globalSearchOverlay', 'globalSearchInput', 'globalSearchResults', 'globalSearchClose', 'quickAddBtn', 'globalSearchShow']) {
        assert.match(dom, new RegExp(`\\b${cache}\\s*:`), `DOM cache must include ${cache}`);
    }
    for (const staleControl of ['searchBarShow', 'bookmarkFilterShow']) {
        assert.doesNotMatch(dom, new RegExp(`\\b${staleControl}\\s*:`), `DOM cache must not retain ${staleControl}`);
    }
    assert.match(settings, /function\s+resolveGlobalSearchVisibility\b/);
    assert.match(settings, /Object\.prototype\.hasOwnProperty\.call\(config,\s*'globalSearchShow'\)/);
    assert.match(settings, /config\.searchBarShow\s*!==\s*false\s*\|\|\s*config\.bookmarkFilterShow\s*!==\s*false/);
    assert.match(settings, /DOM\.globalSearchShow\.checked\s*=\s*resolveGlobalSearchVisibility\(config\)/);
    assert.match(settings, /globalSearchShow:\s*DOM\.globalSearchShow\s*\?\s*DOM\.globalSearchShow\.checked\s*:\s*true/);
    assert.match(settings, /document\.querySelector\('\.global-search-bar'\)/);
    assert.match(settings, /import\s*\{\s*closeGlobalSearch\s*\}\s*from\s*'\.\/search\.js';/);
    assert.match(settings, /export\s+function\s+closeAllModals\s*\(\)\s*\{\s*closeGlobalSearch\(\);/s);
    assert.doesNotMatch(settings, /DOM\.(searchBarShow|bookmarkFilterShow)\b/);
});

test('personalization migrates legacy search settings to one global-search visibility control', () => {
    const globalSearchControl = html.match(/<input\s+type="checkbox"\s+id="globalSearchShow"\s+checked[^>]*>/)?.[0] || '';
    assert.match(globalSearchControl, /id="globalSearchShow"/);
    assert.match(html, /<h5 class="card-subtitle">全局搜索<\/h5>/);
    assert.match(html, /隐藏后仍可使用\s*⌘\s*F/);
    for (const staleControl of ['searchBarShow', 'bookmarkFilterShow']) {
        assert.equal(indexOfId(staleControl), -1, `stale #${staleControl} must be removed from personalization`);
    }
});

test('events, shortcuts, and command palette all route to global search', () => {
    assert.match(events, /import\s*\{[^}]*openGlobalSearch[^}]*closeGlobalSearch[^}]*handleGlobalSearch[^}]*handleGlobalSearchFocusTrap[^}]*\}\s*from\s*'\.\/search\.js';/s);
    assert.match(events, /document\.addEventListener\('keydown',\s*handleGlobalSearchFocusTrap\)/);
    assert.match(events, /debounce\(\(\)\s*=>\s*\{\s*handleGlobalSearch\(\);\s*}\s*,\s*150\s*\)/s);
    assert.match(events, /DOM\.globalSearchTrigger\.addEventListener\('click',\s*openGlobalSearch\)/);
    assert.match(events, /DOM\.globalSearchClose\.addEventListener\('click',\s*closeGlobalSearch\)/);
    assert.match(events, /DOM\.globalSearchInput\.addEventListener\('input',\s*debouncedGlobalSearch\)/);
    assert.match(events, /DOM\.quickAddBtn\.addEventListener\('click',\s*\(\)\s*=>\s*openBookmarkModal\(\)\)/);
    assert.match(events, /initCommandPalette\(\{\s*openBookmarkModal,\s*openSettingsModal,\s*openGlobalSearch\s*}\)/s);
    assert.match(events, /\(e\.ctrlKey\s*\|\|\s*e\.metaKey\)\s*&&\s*e\.key\s*===\s*'f'/);
    assert.match(events, /openGlobalSearch\(\);/);
    assert.match(events, /globalSearchOverlay[^\n]*classList\.contains\('open'\)[\s\S]{0,160}globalSearchInput[^\n]*focus/);
    for (const legacyReference of ['initSearchSuggestions', 'searchInput', 'searchClear', 'webSearchForm', 'webSearchInput', 'bookmarkSearchBtn', 'bookmarkSearchOverlay', 'bookmarkSearchInput']) {
        assert.doesNotMatch(events, new RegExp(`\\b${legacyReference}\\b`), `events must not reference ${legacyReference}`);
    }

    assert.match(commandPalette, /command:\s*'open-global-search'/);
    assert.match(commandPalette, /title:\s*'打开全局搜索'/);
    assert.match(commandPalette, /commandActions\.openGlobalSearch\?\.\(\)/);
    assert.match(commandPalette, /state\.setCurrentEngine[\s\S]{0,320}commandActions\.openGlobalSearch\?\.\(\)/);
    assert.doesNotMatch(commandPalette, /#searchInput|#webSearchInput/);
    assert.match(settings, /closeGlobalSearch\(\);/);
    assert.doesNotMatch(settings, /DOM\.bookmarkSearchOverlay/);
});
