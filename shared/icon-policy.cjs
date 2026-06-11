const PUBLIC_ICON_PROVIDERS = [
    {
        source: 'google',
        label: 'Google',
        type: 'provider',
        buildUrl: hostname => `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        hideOnError: true,
        hideSolidPlaceholder: true
    },
    {
        source: 'faviconim',
        label: 'Favicon.im',
        type: 'provider',
        buildUrl: hostname => `https://favicon.im/${hostname}`,
        hideOnError: true,
        hideSolidPlaceholder: true
    },
    {
        source: 'icon-horse',
        label: '字母',
        type: 'provider',
        buildUrl: hostname => `https://icon.horse/icon/${hostname}`,
        hideOnError: false,
        hideSolidPlaceholder: false
    }
];

const SITE_FALLBACK_PATHS = [
    '/favicon.ico',
    '/favicon.png',
    '/apple-touch-icon.png',
    '/apple-touch-icon-precomposed.png'
];

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

function normalizeHostname(hostname) {
    return String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function parseIpv6Hextets(ip) {
    if (!String(ip || '').includes(':')) return null;
    let normalized = normalizeHostname(ip);
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
    ].some(pattern => pattern.test(ip));
}

function isPrivateOrLocalAddress(hostname) {
    const host = normalizeHostname(hostname);
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

function uniqueUrls(urls) {
    const seen = new Set();
    const out = [];
    for (const raw of urls || []) {
        const value = String(raw || '').trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        out.push(value);
    }
    return out;
}

function getPrivateAddressChecker(options = {}) {
    return options.isPrivateOrLocalAddress
        || options.isPrivateOrLocalAddressFn
        || isPrivateOrLocalAddress;
}

function buildProviderFallbacks(hostname, options = {}) {
    const host = normalizeHostname(hostname);
    if (!host || getPrivateAddressChecker(options)(host)) return [];
    return PUBLIC_ICON_PROVIDERS.map(provider => provider.buildUrl(host));
}

function buildSiteFallbacks(origin) {
    let base = '';
    try {
        const parsed = origin instanceof URL ? origin : new URL(String(origin || '').trim());
        base = parsed.origin;
    } catch {
        base = String(origin || '').trim().replace(/\/+$/, '');
    }
    if (!base) return [];
    return SITE_FALLBACK_PATHS.map(path => `${base}${path}`);
}

function getProviderBySource(source) {
    return PUBLIC_ICON_PROVIDERS.find(provider => provider.source === source) || null;
}

function getIconSource(raw) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value) return 'unknown';
    if (['google', 'faviconim', 'icon-horse', 'apple', 'favicon', 'manifest', 'og', 'site-fallback', 'unknown'].includes(value)) {
        return value;
    }
    if (value.includes('google.com/s2/favicons')) return 'google';
    if (value.includes('favicon.im')) return 'faviconim';
    if (value.includes('icon.horse')) return 'icon-horse';
    if (value.includes('apple-touch-icon')) return 'apple';
    if (value.endsWith('/favicon.ico') || value.endsWith('/favicon.png')) return 'favicon';
    return 'manifest';
}

function getIconType(raw) {
    const source = getIconSource(raw);
    return getProviderBySource(source) ? 'provider' : 'site';
}

function getIconLabel(raw) {
    const source = getIconSource(raw);
    const provider = getProviderBySource(source);
    if (provider) return provider.label;
    if (source === 'apple') return 'Apple';
    if (source === 'favicon') return '默认图标';
    if (source === 'icon-horse') return '字母';
    return '页面图标';
}

function getIconCandidateDefaults(url, overrides = {}) {
    const source = overrides.source || getIconSource(url);
    const provider = getProviderBySource(source);
    return {
        url: String(url || '').trim(),
        source,
        type: overrides.type || provider?.type || getIconType(source),
        label: overrides.label || getIconLabel(source),
        hideOnError: overrides.hideOnError ?? provider?.hideOnError ?? false,
        hideSolidPlaceholder: overrides.hideSolidPlaceholder ?? provider?.hideSolidPlaceholder ?? false
    };
}

function getIconSourceFamily(icon) {
    const source = getIconSource(icon);
    if (source === 'apple') return 'apple';
    return String(icon || '').trim();
}

function isSameIconSourceFamily(a, b) {
    return getIconSourceFamily(a) === getIconSourceFamily(b);
}

function shouldHideIconOnError(raw) {
    const source = getIconSource(raw);
    return Boolean(getProviderBySource(source)?.hideOnError);
}

function shouldHideSolidPlaceholder(raw) {
    const source = getIconSource(raw);
    return Boolean(getProviderBySource(source)?.hideSolidPlaceholder);
}

function shouldPreferProxyHost(hostname) {
    const host = normalizeHostname(hostname);
    return PREFER_PROXY_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

module.exports = {
    PUBLIC_ICON_PROVIDERS,
    SITE_FALLBACK_PATHS,
    PREFER_PROXY_HOSTS,
    buildProviderFallbacks,
    buildSiteFallbacks,
    getIconSource,
    getIconType,
    getIconLabel,
    getIconCandidateDefaults,
    getIconSourceFamily,
    isSameIconSourceFamily,
    shouldHideIconOnError,
    shouldHideSolidPlaceholder,
    shouldPreferProxyHost,
    uniqueUrls,
    isPrivateOrLocalAddress
};
