function visitTime(item) {
    const ts = Date.parse(item?.last_visited_at || '');
    return Number.isFinite(ts) ? ts : 0;
}

function getVisitedBookmarks(bookmarks) {
    return (Array.isArray(bookmarks) ? bookmarks : [])
        .filter(item => item && item.item_type !== 'component' && ((Number(item.visit_count) || 0) > 0 || visitTime(item) > 0));
}

function getFrequentBookmarks(bookmarks, limit = 6) {
    return getVisitedBookmarks(bookmarks)
        .sort((a, b) => (Number(b.visit_count) || 0) - (Number(a.visit_count) || 0) || visitTime(b) - visitTime(a))
        .slice(0, limit);
}

function getRecentBookmarks(bookmarks, limit = 6) {
    return getVisitedBookmarks(bookmarks)
        .filter(item => visitTime(item) > 0)
        .sort((a, b) => visitTime(b) - visitTime(a))
        .slice(0, limit);
}

module.exports = { getFrequentBookmarks, getRecentBookmarks, visitTime };
