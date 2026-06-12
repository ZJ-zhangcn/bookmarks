/* global URL */
const iconPolicy = require('../../shared/icon-policy.cjs');

function toSafeExternalUrl(url) {
    const src = String(url || '').trim();
    try {
        const parsed = new URL(src);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch {
        return '#';
    }
}

function isPrivateOrLocalAddress(hostname) {
    return iconPolicy.isPrivateOrLocalAddress(hostname);
}

function shouldUseProxyUrlForIcon(url, pageProtocol = 'https:') {
    const safeUrl = toSafeExternalUrl(url);
    if (safeUrl === '#') return false;
    try {
        const parsed = new URL(safeUrl);
        if (isPrivateOrLocalAddress(parsed.hostname)) return false;
        if (pageProtocol === 'https:' && parsed.protocol === 'http:') return true;
        return iconPolicy.shouldPreferProxyHost(parsed.hostname);
    } catch {
        return false;
    }
}

function normalizeFaviconResponse(result) {
    if (!result || result.success !== true) return [];
    if (Array.isArray(result.data)) return result.data;

    const data = result.data || {};
    const urls = [];
    const addUrl = item => {
        const url = typeof item === 'string' ? item : item?.url;
        if (url) urls.push(url);
    };

    // 用户需要看到后端返回的所有候选：真实图标、公共 provider、未验证/验证失败的候选都保留展示。
    (data.icons || []).forEach(addUrl);
    addUrl(data.recommended);
    (data.candidates || []).forEach(addUrl);
    (data.fallbacks || []).forEach(addUrl);
    (data.rejected || []).forEach(addUrl);
    (result.icons || []).forEach(addUrl);

    return uniqueHttpUrls(urls);
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

function isHttpUrl(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function uniqueHttpUrls(urls) {
    return iconPolicy.uniqueUrls(urls).filter(isHttpUrl);
}

function buildLocalFaviconCandidates(rawUrl, fallbackSources = []) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        return [];
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];

    const domain = parsed.hostname;
    const publicProviderFallbacks = iconPolicy.buildProviderFallbacks(domain, {
        isPrivateOrLocalAddress
    });
    return uniqueHttpUrls([
        ...iconPolicy.buildSiteFallbacks(parsed.origin),
        ...publicProviderFallbacks,
        ...fallbackSources.map(getUrl => {
            try { return getUrl(domain); } catch { return ''; }
        })
    ]);
}

function shouldProbeBrowserFallbacks(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return isPrivateOrLocalAddress(parsed.hostname);
}

function mergeIconsWithLocalFallback(siteIcons, localIcons) {
    return uniqueHttpUrls([...(siteIcons || []), ...(localIcons || [])]);
}

if (typeof module !== 'undefined') {
    module.exports = {
        normalizeFaviconResponse,
        createFaviconRequestGuard,
        buildLocalFaviconCandidates,
        shouldProbeBrowserFallbacks,
        mergeIconsWithLocalFallback,
        isPrivateOrLocalAddress,
        shouldUseProxyUrlForIcon
    };
}
