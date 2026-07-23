const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relPath => fs.readFileSync(path.join(root, relPath), 'utf8');
const search = read('frontend/modules/search.js');
const events = read('frontend/modules/events.js');
const overlayState = read('frontend/modules/overlay-state.js');

test('bookmark search interaction is wired to the restored overlay lifecycle', () => {
    assert.match(events, /document\.addEventListener\('keydown',\s*handleBookmarkSearchFocusTrap\)/);
    assert.match(events, /DOM\.bookmarkSearchBtn\.addEventListener\('click',\s*openBookmarkSearch\)/);
    assert.match(events, /DOM\.bookmarkSearchClose\.addEventListener\('click',\s*closeBookmarkSearch\)/);
    assert.match(events, /DOM\.bookmarkSearchOverlay\.addEventListener\('click'/);
    assert.match(events, /DOM\.bookmarkSearchInput\.addEventListener\('input',\s*debouncedBookmarkSearch\)/);
    assert.match(events, /openBookmarkSearch\(\);/);
});

test('bookmark search restores focus and cooperates with overlay scroll locking without timers', () => {
    assert.match(search, /bookmarkSearchPreviousFocus/);
    assert.match(search, /setAttribute\?\.\('aria-hidden', 'false'\)/);
    assert.match(search, /setAttribute\?\.\('aria-hidden', 'true'\)/);
    assert.match(search, /syncDocumentScrollLock\(\)/);
    assert.match(search, /if\s*\(isBookmarkSearchOpen\(\)\)\s*\{\s*syncDocumentScrollLock\(\);/);
    assert.match(search, /focusTarget\?\.focus\?\.\(\)/);
    assert.doesNotMatch(search, /setTimeout|requestAnimationFrame/);
    assert.match(overlayState, /bookmarkSearchOverlay/);
});

test('Escape closes bookmark search before an underlying URL-first modal', () => {
    assert.match(
        events,
        /if\s*\(DOM\.bookmarkSearchOverlay\?\.classList\?\.contains\?\.\('open'\)\)\s*\{\s*closeBookmarkSearch\(\);\s*return;/
    );
});

test('bookmark search keeps safe result links and tag matching', () => {
    assert.match(search, /toSafeExternalUrl\(item\.url\)/);
    assert.match(search, /matchedTags/);
    assert.match(search, /bindImageFallbacks\(DOM\.bookmarkSearchResults\)/);
});
