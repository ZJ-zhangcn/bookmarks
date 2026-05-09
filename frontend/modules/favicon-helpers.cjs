/* global URL */
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

function isHttpUrl(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function uniqueUrls(urls) {
    const seen = new Set();
    const out = [];
    for (const raw of urls || []) {
        const s = String(raw || '').trim();
        if (!s || seen.has(s) || !isHttpUrl(s)) continue;
        seen.add(s);
        out.push(s);
    }
    return out;
}

function buildLocalFaviconCandidates(rawUrl, fallbackSources = []) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch {
        return [];
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return [];

    const origin = parsed.origin;
    const domain = parsed.hostname;
    return uniqueUrls([
        `${origin}/favicon.ico`,
        `${origin}/favicon.png`,
        `${origin}/apple-touch-icon.png`,
        `${origin}/apple-touch-icon-precomposed.png`,
        ...fallbackSources.map(getUrl => {
            try { return getUrl(domain); } catch { return ''; }
        })
    ]);
}

function mergeIconsWithLocalFallback(siteIcons, localIcons) {
    return uniqueUrls([...(siteIcons || []), ...(localIcons || [])]);
}

if (typeof module !== 'undefined') {
    module.exports = {
        normalizeFaviconResponse,
        createFaviconRequestGuard,
        buildLocalFaviconCandidates,
        mergeIconsWithLocalFallback
    };
}
