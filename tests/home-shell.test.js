const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');
const html = read('frontend/index.html');
const css = read('frontend/index.css');
const dom = read('frontend/modules/dom.js');
const events = read('frontend/modules/events.js');
const search = read('frontend/modules/search.js');
const settings = read('frontend/modules/settings.js');
const commandPalette = read('frontend/modules/command-palette.js');

function indexOfId(id) {
    return html.indexOf(`id="${id}"`);
}

test('home shell presents the import-first library onboarding contract', () => {
    assert.match(html, /<section\s+id="libraryOnboarding"\s+class="library-onboarding"\s+aria-live="polite"\s+hidden[^>]*>/);
    for (const id of ['libraryOnboardingTitle', 'libraryOnboardingHint', 'onboardingBrowserImportBtn', 'onboardingAddBookmarkBtn', 'onboardingDismissBtn']) {
        assert.notEqual(indexOfId(id), -1, `expected #${id} in the home shell`);
    }
    assert.ok(indexOfId('libraryOnboarding') < indexOfId('categoryNav'), 'onboarding precedes category navigation');
});

test('home shell restores distinct web search, bookmark filtering, and bookmark-search overlay', () => {
    for (const id of [
        'webSearchForm', 'webSearchInput', 'searchSuggestions', 'searchInput', 'searchClear',
        'bookmarkSearchBtn', 'bookmarkSearchOverlay', 'bookmarkSearchInput', 'bookmarkSearchClose',
        'bookmarkSearchResults', 'engineBtn', 'engineIcon', 'engineName', 'engineDropdown',
        'engineManageBtn', 'settingsBtn'
    ]) {
        assert.notEqual(indexOfId(id), -1, `expected #${id}`);
    }

    for (const removed of [
        'globalSearchTrigger', 'globalSearchOverlay', 'globalSearchInput', 'globalSearchResults',
        'globalSearchClose', 'globalSearchShow', 'quickAddBtn'
    ]) {
        assert.equal(indexOfId(removed), -1, `obsolete #${removed} must be absent`);
    }

    assert.match(html, /<div\b[^>]*id="bookmarkSearchOverlay"[^>]*aria-hidden="true"[^>]*>/);
    assert.match(html, /class="bookmark-search-panel"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /id="bookmarkSearchResults"[^>]*role="region"[^>]*aria-live="polite"/);
    assert.match(css, /\.bookmark-search-overlay\.open\s*\{[\s\S]*?visibility:\s*visible;[\s\S]*?transition-delay:\s*0s;[\s\S]*?\}/);
    assert.doesNotMatch(css, /\.global-search-/);
    assert.doesNotMatch(css, /\.quick-add-btn/);
});

test('restored search source uses safe bookmark URLs and keeps current URL-first capture paths', () => {
    for (const name of ['openBookmarkSearch', 'closeBookmarkSearch', 'handleBookmarkSearch']) {
        assert.match(search, new RegExp(`export\\s+function\\s+${name}\\b`));
    }
    assert.match(search, /toSafeExternalUrl/);
    assert.match(search, /syncDocumentScrollLock\(\)/);
    assert.match(search, /标签：/);
    assert.doesNotMatch(search, /\b(openGlobalSearch|closeGlobalSearch|handleGlobalSearch)\b/);
    assert.doesNotMatch(search, /setTimeout|requestAnimationFrame/);
    assert.doesNotMatch(read('frontend/modules/bookmark.js'), /quickAddBtn/);
});

test('settings migrate the legacy global visibility flag into independent restored controls', () => {
    for (const id of ['searchBarShow', 'bookmarkFilterShow']) {
        assert.notEqual(indexOfId(id), -1, `expected #${id}`);
    }
    assert.equal(indexOfId('globalSearchShow'), -1);
    assert.match(settings, /globalSearchShow/);
    assert.match(settings, /searchBarShow:\s*DOM\.searchBarShow/);
    assert.match(settings, /bookmarkFilterShow:\s*DOM\.bookmarkFilterShow/);
    assert.match(settings, /document\.querySelector\('\.web-search-form'\)/);
    assert.match(settings, /DOM\.searchContainer/);
});

test('events and command palette use restored search surfaces without global-search actions', () => {
    assert.match(events, /initSearchSuggestions\(\)/);
    assert.match(events, /DOM\.webSearchForm\.addEventListener\('submit'/);
    assert.match(events, /DOM\.searchInput\.addEventListener\('input'/);
    assert.match(events, /DOM\.bookmarkSearchBtn\.addEventListener\('click',\s*openBookmarkSearch\)/);
    assert.match(events, /DOM\.bookmarkSearchInput\.addEventListener\('input'/);
    assert.match(events, /openBookmarkSearch\(\);/);
    assert.doesNotMatch(events, /\b(globalSearch|quickAddBtn)\b/);
    assert.doesNotMatch(events, /e\.key\s*===\s*'n'/);

    for (const name of ['searchInput', 'searchClear', 'webSearchForm', 'webSearchInput', 'bookmarkSearchBtn', 'bookmarkSearchOverlay', 'bookmarkSearchInput', 'bookmarkSearchClose', 'bookmarkSearchResults', 'searchBarShow', 'bookmarkFilterShow']) {
        assert.match(dom, new RegExp(`\\b${name}\\s*:`), `DOM cache must include ${name}`);
    }
    assert.doesNotMatch(dom, /\b(globalSearch|quickAddBtn)\b/);
    assert.match(commandPalette, /command:\s*'focus-filter'/);
    assert.match(commandPalette, /#webSearchInput/);
    assert.doesNotMatch(commandPalette, /open-global-search|openGlobalSearch/);
});
