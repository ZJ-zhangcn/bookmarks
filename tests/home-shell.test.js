const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
const events = fs.readFileSync(path.join(__dirname, '../frontend/modules/events.js'), 'utf8');

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
