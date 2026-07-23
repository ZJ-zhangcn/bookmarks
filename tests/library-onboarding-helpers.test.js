const test = require('node:test');
const assert = require('node:assert/strict');

const onboarding = require('../frontend/modules/library-onboarding-helpers.cjs');
const {
    SEED_BOOKMARK_PREFIX,
    getLibraryOnboardingState,
    shouldShowLibraryOnboarding
} = onboarding;

test('exposes the library onboarding helper API', () => {
    assert.equal(SEED_BOOKMARK_PREFIX, 'bm_default_');
    assert.equal(typeof getLibraryOnboardingState, 'function');
    assert.equal(typeof shouldShowLibraryOnboarding, 'function');
});

test('empty library always shows onboarding even when dismissed', () => {
    assert.equal(getLibraryOnboardingState([]), 'empty');
    assert.equal(shouldShowLibraryOnboarding({ bookmarks: [], dismissed: true }), true);
});

test('seed-only library shows onboarding unless dismissed', () => {
    const bookmarks = [
        { id: 'bm_default_guide' },
        { id: 'bm_default_examples' }
    ];

    assert.equal(getLibraryOnboardingState(bookmarks), 'seeded');
    assert.equal(shouldShowLibraryOnboarding({ bookmarks, dismissed: false }), true);
    assert.equal(shouldShowLibraryOnboarding({ bookmarks, dismissed: true }), false);
});

test('mixed seed and user bookmarks leave onboarding ready and hidden', () => {
    const bookmarks = [
        { id: 'bm_default_guide' },
        { id: 'bm_user_first-bookmark' }
    ];

    assert.equal(getLibraryOnboardingState(bookmarks), 'ready');
    assert.equal(shouldShowLibraryOnboarding({ bookmarks }), false);
});

test('non-array bookmarks are ready and do not show onboarding', () => {
    for (const bookmarks of [undefined, null, {}, 'not-a-library']) {
        assert.equal(getLibraryOnboardingState(bookmarks), 'ready');
        assert.equal(shouldShowLibraryOnboarding({ bookmarks }), false);
    }
});

test('null or malformed onboarding options do not show onboarding', () => {
    for (const options of [null, undefined, 'not-options', []]) {
        assert.equal(shouldShowLibraryOnboarding(options), false);
    }
});
