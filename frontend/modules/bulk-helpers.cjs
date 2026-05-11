function summarizeBulkSelection(selectedIds) {
    const count = selectedIds && typeof selectedIds.size === 'number' ? selectedIds.size : 0;
    return `已选择 ${count} 个书签`;
}

function applyBulkCategory(bookmarks, selectedIds, categoryId) {
    const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
    return (bookmarks || []).map(bookmark => {
        if (!selected.has(bookmark?.id)) return { ...bookmark };
        return { ...bookmark, category_id: categoryId };
    });
}

module.exports = { summarizeBulkSelection, applyBulkCategory };
