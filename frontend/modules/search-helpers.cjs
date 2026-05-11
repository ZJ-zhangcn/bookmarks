function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildSearchEmptyState(query) {
    const safeQuery = escapeHtml(query);
    return `
        <div class="search-no-results rich">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">没有找到匹配的书签</div>
            <div class="empty-hint">可以添加“${safeQuery}”为新书签，或直接用当前搜索引擎搜索网页。</div>
            <div class="empty-actions">
                <button type="button" class="btn btn-primary btn-sm" data-action="add-bookmark">+ 添加书签</button>
                <button type="button" class="btn btn-secondary btn-sm" data-action="web-search">网页搜索</button>
            </div>
        </div>
    `;
}

module.exports = { buildSearchEmptyState };
