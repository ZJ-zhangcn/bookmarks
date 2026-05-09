function normalizeFaviconResponse(result) {
    if (!result || result.success !== true) return [];
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.icons)) return result.icons;
    return [];
}

function createFaviconRequestGuard() {
    let currentToken = 0;
    return {
        start(url) {
            currentToken += 1;
            return { token: currentToken, url: String(url || '') };
        },
        isCurrent(request, currentUrl) {
            return Boolean(request)
                && request.token === currentToken
                && request.url === String(currentUrl || '');
        }
    };
}

if (typeof module !== 'undefined') {
    module.exports = { normalizeFaviconResponse, createFaviconRequestGuard };
}
