/* global URL */
function toSafeExternalUrl(url) {
    const src = String(url || '').trim();
    try {
        const parsed = new URL(src);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch {
        return '#';
    }
}

function parseIpv6Hextets(ip) {
    if (!String(ip || '').includes(':')) return null;
    let normalized = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    const zoneIndex = normalized.indexOf('%');
    if (zoneIndex !== -1) normalized = normalized.slice(0, zoneIndex);
    if (normalized.includes('.')) {
        const lastColon = normalized.lastIndexOf(':');
        const dotted = normalized.slice(lastColon + 1);
        const octets = dotted.split('.').map(Number);
        if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
        normalized = `${normalized.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    }
    const parts = normalized.split('::');
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
    const missing = parts.length === 2 ? 8 - left.length - right.length : 0;
    const hextets = [...left, ...Array(missing).fill('0'), ...right];
    if (hextets.length !== 8) return null;
    const parsed = hextets.map(part => /^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : NaN);
    return parsed.some(Number.isNaN) ? null : parsed;
}

function ipv4FromMappedIpv6(host) {
    const hextets = parseIpv6Hextets(host);
    if (!hextets) return null;
    const isMapped = hextets.slice(0, 5).every(part => part === 0) && hextets[5] === 0xffff;
    if (!isMapped) return null;
    return `${(hextets[6] >> 8) & 255}.${hextets[6] & 255}.${(hextets[7] >> 8) & 255}.${hextets[7] & 255}`;
}

function isPrivateIpv4(ip) {
    return [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\./,
        /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./
    ].some(p => p.test(ip));
}

function isPrivateOrLocalAddress(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '::') return true;
    const mappedIpv4 = ipv4FromMappedIpv6(host);
    if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return isPrivateIpv4(host);
    const hextets = parseIpv6Hextets(host);
    if (!hextets) return false;
    const first = hextets[0];
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

const PREFER_PROXY_HOSTS = [
    'grok.com',
    'github.com',
    'githubusercontent.com',
    'google.com',
    'huggingface.co',
    'zhihu.com',
    'tool.lu',
    'leaflow.net',
    'the-x.cn'
];

function shouldPreferProxyHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return PREFER_PROXY_HOSTS.some(domain => host === domain || host.endsWith('.' + domain));
}

function shouldUseProxyUrlForIcon(url, pageProtocol = 'https:') {
    const safeUrl = toSafeExternalUrl(url);
    if (safeUrl === '#') return false;
    try {
        const parsed = new URL(safeUrl);
        if (isPrivateOrLocalAddress(parsed.hostname)) return false;
        if (pageProtocol === 'https:' && parsed.protocol === 'http:') return true;
        return shouldPreferProxyHost(parsed.hostname);
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
    const publicProviderFallbacks = isPrivateOrLocalAddress(domain)
        ? []
        : [
            `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
            `https://favicon.im/${domain}`,
            `https://icon.horse/icon/${domain}`
        ];
    return uniqueUrls([
        `${origin}/favicon.ico`,
        `${origin}/favicon.png`,
        `${origin}/apple-touch-icon.png`,
        `${origin}/apple-touch-icon-precomposed.png`,
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
    return uniqueUrls([...(siteIcons || []), ...(localIcons || [])]);
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
