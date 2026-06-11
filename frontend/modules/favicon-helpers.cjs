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

    // 优先使用 candidates 中验证通过的图标
    if (Array.isArray(result.data?.candidates)) {
        const usableIcons = result.data.candidates
            .filter(candidate => candidate?.usable === true)
            .map(candidate => candidate?.url)
            .filter(Boolean);
        // 如果有验证通过的图标，返回它们
        if (usableIcons.length > 0) {
            return usableIcons;
        }
    }

    // 否则使用 icons 列表（后端验证可能因网络问题失败，所以不能完全依赖验证结果）
    // 让前端的 isSolidPlaceholderImage 和 bindImageFallbacks 来处理占位图
    if (Array.isArray(result.data?.icons)) return result.data.icons;
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
