const SEED_BOOKMARK_PREFIX = 'bm_default_';

function getLibraryOnboardingState(bookmarks) {
    if (!Array.isArray(bookmarks)) {
        return 'ready';
    }

    if (bookmarks.length === 0) {
        return 'empty';
    }

    const containsOnlySeedBookmarks = bookmarks.every((bookmark) => {
        const id = typeof bookmark === 'string' ? bookmark : bookmark?.id;
        return typeof id === 'string' && id.startsWith(SEED_BOOKMARK_PREFIX);
    });

    return containsOnlySeedBookmarks ? 'seeded' : 'ready';
}

function shouldShowLibraryOnboarding(options) {
    const { bookmarks, dismissed = false } = options && typeof options === 'object' && !Array.isArray(options)
        ? options
        : {};
    const state = getLibraryOnboardingState(bookmarks);

    return state === 'empty' || (state === 'seeded' && !dismissed);
}

module.exports = {
    SEED_BOOKMARK_PREFIX,
    getLibraryOnboardingState,
    shouldShowLibraryOnboarding
};
