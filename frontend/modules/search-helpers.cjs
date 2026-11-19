function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveWebsiteUrl(query) {
    const value = String(query || '').trim();
    if (!value || /[\s\\]/.test(value)) return null;

    const hasProtocol = /^https?:\/\//i.test(value);
    const address = value.replace(/^\/\//, '');
    try {
        const url = new URL(hasProtocol ? value : `https://${address}`);
        if (url.username || url.password) return null;

        if (!hasProtocol) {
            const authority = address.split(/[/?#]/, 1)[0];
            const isDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i.test(url.hostname);
            const isIpv4 = /^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(authority);
            const isLocalAddress = url.hostname === 'localhost' || url.hostname.startsWith('[');
            if (!isDomain && !isIpv4 && !isLocalAddress) return null;
        }

        return url.href;
    } catch {
        return null;
    }
}

function buildWebSearchUrl(query, engineUrl) {
    const value = String(query || '').trim();
    if (!value) return null;
    return resolveWebsiteUrl(value) || engineUrl + encodeURIComponent(value);
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

module.exports = { buildSearchEmptyState, resolveWebsiteUrl, buildWebSearchUrl };
