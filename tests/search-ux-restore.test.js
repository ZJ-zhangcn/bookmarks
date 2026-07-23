const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');

const html = read('frontend/index.html');
const events = read('frontend/modules/events.js');
const dom = read('frontend/modules/dom.js');
const settings = read('frontend/modules/settings.js');
const commandPalette = read('frontend/modules/command-palette.js');
const overlayState = read('frontend/modules/overlay-state.js');
const pwa = read('frontend/modules/pwa.js');
const serviceWorker = read('frontend/service-worker.js');

function hasId(id) {
    return html.includes(`id="${id}"`);
}

test('home restores separate web and bookmark search surfaces without global or quick-add entry points', () => {
    for (const id of [
        'webSearchForm', 'webSearchInput', 'searchSuggestions', 'searchInput', 'searchClear',
        'bookmarkSearchBtn', 'bookmarkSearchOverlay', 'bookmarkSearchInput',
        'bookmarkSearchClose', 'bookmarkSearchResults', 'searchBarShow', 'bookmarkFilterShow'
    ]) {
        assert.equal(hasId(id), true, `expected restored #${id}`);
    }

    for (const id of [
        'globalSearchTrigger', 'globalSearchOverlay', 'globalSearchInput',
        'globalSearchResults', 'globalSearchClose', 'globalSearchShow', 'quickAddBtn'
    ]) {
        assert.equal(hasId(id), false, `obsolete #${id} must be removed`);
    }
});

test('restored search wiring keeps the existing suggestion API and removes global search and Cmd/Ctrl+N', () => {
    assert.match(events, /import\s*\{\s*initSearchSuggestions\s*\}\s*from\s*'\.\/suggest\.js';/);
    assert.match(events, /initSearchSuggestions\(\)/);
    assert.match(events, /DOM\.webSearchForm\.addEventListener\('submit'/);
    assert.match(events, /DOM\.searchInput\.addEventListener\('input'/);
    assert.match(events, /DOM\.bookmarkSearchBtn\.addEventListener\('click',\s*openBookmarkSearch\)/);
    assert.match(events, /DOM\.bookmarkSearchInput\.addEventListener\('input'/);
    assert.match(events, /openBookmarkSearch\(\);/);
    assert.doesNotMatch(events, /\b(openGlobalSearch|closeGlobalSearch|handleGlobalSearch|quickAddBtn)\b/);
    assert.doesNotMatch(events, /e\.key\s*===\s*'n'/);

    for (const cache of [
        'webSearchForm', 'webSearchInput', 'searchInput', 'searchClear',
        'bookmarkSearchBtn', 'bookmarkSearchOverlay', 'bookmarkSearchInput',
        'bookmarkSearchClose', 'bookmarkSearchResults', 'searchBarShow', 'bookmarkFilterShow'
    ]) {
        assert.match(dom, new RegExp(`\\b${cache}\\s*:`), `DOM cache must include ${cache}`);
    }
    for (const removed of ['globalSearchTrigger', 'globalSearchOverlay', 'globalSearchInput', 'globalSearchResults', 'globalSearchClose', 'globalSearchShow', 'quickAddBtn']) {
        assert.doesNotMatch(dom, new RegExp(`\\b${removed}\\s*:`), `DOM cache must not retain ${removed}`);
    }

    assert.match(settings, /searchBarShow/);
    assert.match(settings, /bookmarkFilterShow/);
    assert.match(settings, /globalSearchShow/);
    assert.match(overlayState, /DOM\.bookmarkSearchOverlay/);
    assert.doesNotMatch(overlayState, /DOM\.globalSearchOverlay/);
    assert.doesNotMatch(commandPalette, /open-global-search/);
    assert.doesNotMatch(commandPalette, /openGlobalSearch/);
});

test('PWA cache and registration are bumped together for the restored shell', () => {
    assert.match(pwa, /SERVICE_WORKER_VERSION\s*=\s*'v18'/);
    assert.match(serviceWorker, /CACHE_NAME\s*=\s*'bookmark-nav-pwa-v18'/);
});

test('saving restored visibility settings updates the in-memory personalization cache', () => {
    assert.match(
        settings,
        /await fetch\([\s\S]*?state\.setPersonalizationConfig\(config\);\s*await applyPersonalization\(config\);/
    );
});
