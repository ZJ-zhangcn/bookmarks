const { assertPublicFetchUrl, isPrivateOrLocalAddress } = require('../middleware/security');
const { safeFetchPublicUrl, readLimitedArrayBuffer } = require('../utils/safe-fetch');
const { discoverIconCandidates } = require('../utils/icon-discovery');

const PAGE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

const IMAGE_HEADERS = {
    'User-Agent': PAGE_HEADERS['User-Agent'],
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

const PAGE_MAX_BYTES = 512 * 1024;
const MANIFEST_MAX_BYTES = 128 * 1024;
const ICON_MAX_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 5000;
const SUCCESS_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_TTL_MS = 15 * 60 * 1000;
const MAX_VALIDATION_CANDIDATES = 8;

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

function uniqueCandidates(candidates) {
    const seen = new Set();
    const out = [];
    for (const candidate of candidates || []) {
        const url = String(candidate?.url || '').trim();
        if (!url || seen.has(url)) continue;
        seen.add(url);
        out.push({ ...candidate, url });
    }
    return out;
}

function getFallbackIcons(host, protocol = 'https:', {
    includePublicLetterFallback = true,
    hostname = host,
    isPrivateOrLocalAddressFn = isPrivateOrLocalAddress
} = {}) {
    const origin = `${protocol}//${host}`;
    const publicProviderFallbacks = getPublicProviderFallbacks(hostname, {
        isPrivateOrLocalAddress: isPrivateOrLocalAddressFn
    });
    const fallbacks = [
        `${origin}/favicon.ico`,
        `${origin}/favicon.png`,
        `${origin}/apple-touch-icon.png`,
        `${origin}/apple-touch-icon-precomposed.png`,
        ...publicProviderFallbacks.filter(url => includePublicLetterFallback || !url.includes('icon.horse'))
    ];
    return uniqueUrls(fallbacks);
}

function makeCacheKey(parsedUrl) {
    return `${parsedUrl.protocol}//${parsedUrl.host}`;
}

function cloneResult(result, cacheState = result.cache) {
    return {
        ...result,
        cache: cacheState,
        icons: [...(result.icons || [])],
        candidates: (result.candidates || []).map(candidate => ({ ...candidate })),
        rejected: (result.rejected || []).map(candidate => ({ ...candidate }))
    };
}

function fallbackSource(url) {
    const value = String(url || '').toLowerCase();
    if (value.includes('google.com/s2/favicons')) return 'google-fallback';
    if (value.includes('favicon.im')) return 'faviconim-fallback';
    if (value.includes('icon.horse')) return 'public-fallback';
    if (value.includes('apple-touch-icon')) return 'apple-fallback';
    if (value.endsWith('/favicon.ico') || value.endsWith('/favicon.png')) return 'site-fallback';
    return 'discovered';
}

function getPublicProviderFallbacks(hostname, deps) {
    if (deps.isPrivateOrLocalAddress(hostname)) return [];
    return [
        `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        `https://favicon.im/${hostname}`,
        `https://icon.horse/icon/${hostname}`
    ];
}

function getResultFallbackIcons(parsedUrl, deps) {
    if (!deps.isPrivateOrLocalAddress(parsedUrl.hostname)) {
        return getPublicProviderFallbacks(parsedUrl.hostname, deps);
    }
    return getFallbackIcons(parsedUrl.host, parsedUrl.protocol, {
        hostname: parsedUrl.hostname,
        isPrivateOrLocalAddressFn: deps.isPrivateOrLocalAddress
    });
}

function fallbackResult(parsedUrl, reason, rejected, deps) {
    const fallbackIcons = getResultFallbackIcons(parsedUrl, deps);
    return {
        status: 'fallback',
        cache: 'miss',
        target: parsedUrl.href,
        origin: makeCacheKey(parsedUrl),
        icons: fallbackIcons,
        candidates: fallbackIcons.map(url => ({
            url,
            source: fallbackSource(url),
            score: 0,
            usable: false,
            reason
        })),
        rejected: rejected || []
    };
}

async function validateIconCandidate(candidate, parsedPageUrl, deps) {
    const url = String(candidate?.url || '');
    const base = {
        url,
        source: candidate?.source || fallbackSource(url),
        score: Number(candidate?.score) || 0,
        usable: false
    };

    try {
        const iconUrl = await deps.assertPublicFetchUrl(url);
        const { response, url: finalUrl } = await deps.safeFetchPublicUrl(iconUrl.href, {
            allowPrivate: deps.isPrivateOrLocalAddress(parsedPageUrl.hostname),
            timeoutMs: FETCH_TIMEOUT_MS,
            fetchOptions: {
                headers: {
                    ...IMAGE_HEADERS,
                    Referer: `${parsedPageUrl.protocol}//${parsedPageUrl.host}/`
                }
            }
        });

        if (!response.ok) {
            return { ...base, reason: `http-${response.status}` };
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.toLowerCase().startsWith('image/')) {
            return { ...base, contentType, reason: 'not-image' };
        }

        const buffer = await deps.readLimitedArrayBuffer(response, ICON_MAX_BYTES);
        return {
            ...base,
            url: finalUrl.href,
            contentType: contentType.split(';')[0],
            bytes: buffer.byteLength,
            usable: true
        };
    } catch (e) {
        return { ...base, reason: e.message || 'unavailable' };
    }
}

function createIconDiscoveryService(overrides = {}) {
    const deps = {
        assertPublicFetchUrl,
        isPrivateOrLocalAddress,
        safeFetchPublicUrl,
        readLimitedArrayBuffer,
        cache: new Map(),
        ...overrides
    };

    function getCached(cacheKey) {
        const entry = deps.cache.get(cacheKey);
        if (!entry || Date.now() > entry.expiresAt) {
            if (entry) deps.cache.delete(cacheKey);
            return null;
        }
        return cloneResult(entry.result, 'hit');
    }

    function setCached(cacheKey, result, ttlMs) {
        deps.cache.set(cacheKey, {
            expiresAt: Date.now() + ttlMs,
            result: cloneResult(result, 'miss')
        });
        if (deps.cache.size > 500) {
            const oldest = deps.cache.keys().next().value;
            deps.cache.delete(oldest);
        }
    }

    async function fetchManifestJson(manifestUrl, parsedPageUrl) {
        const { response } = await deps.safeFetchPublicUrl(manifestUrl, {
            allowPrivate: deps.isPrivateOrLocalAddress(parsedPageUrl.hostname),
            timeoutMs: FETCH_TIMEOUT_MS,
            fetchOptions: { headers: PAGE_HEADERS }
        });
        if (!response.ok) return null;
        const manifestText = (await deps.readLimitedArrayBuffer(response, MANIFEST_MAX_BYTES)).toString('utf8');
        return JSON.parse(manifestText);
    }

    async function discoverIcons(rawUrl) {
        const parsedUrl = await deps.assertPublicFetchUrl(rawUrl);
        const cacheKey = makeCacheKey(parsedUrl);
        const cached = getCached(cacheKey);
        if (cached) return cached;

        let rejected = [];
        try {
            const { response } = await deps.safeFetchPublicUrl(parsedUrl.href, {
                allowPrivate: deps.isPrivateOrLocalAddress(parsedUrl.hostname),
                timeoutMs: FETCH_TIMEOUT_MS,
                fetchOptions: { headers: PAGE_HEADERS }
            });
            if (!response.ok) {
                throw new Error(`page-http-${response.status}`);
            }

            const html = (await deps.readLimitedArrayBuffer(response, PAGE_MAX_BYTES)).toString('utf8');
            const discoveredIcons = await discoverIconCandidates(html, parsedUrl.href, manifestUrl => fetchManifestJson(manifestUrl, parsedUrl));
            const fallbackIcons = getFallbackIcons(parsedUrl.host, parsedUrl.protocol, {
                hostname: parsedUrl.hostname,
                isPrivateOrLocalAddressFn: deps.isPrivateOrLocalAddress
            });
            const publicProviderFallbacks = getPublicProviderFallbacks(parsedUrl.hostname, deps);
            const candidateUrls = uniqueCandidates([
                ...discoveredIcons,
                ...fallbackIcons
                    .filter(url => !publicProviderFallbacks.includes(url))
                    .map((url, index) => ({ url, source: fallbackSource(url), score: Math.max(1, 20 - index) }))
            ]);
            const validationResults = await Promise.all(
                candidateUrls.slice(0, MAX_VALIDATION_CANDIDATES).map(iconCandidate => validateIconCandidate(iconCandidate, parsedUrl, deps))
            );
            const candidates = validationResults.filter(candidate => candidate.usable);
            rejected = validationResults.filter(candidate => !candidate.usable);

            if (candidates.length === 0) {
                const result = fallbackResult(parsedUrl, 'no-validated-icons', rejected, deps);
                setCached(cacheKey, result, FALLBACK_TTL_MS);
                return result;
            }

            const bestSiteIcon = candidates[0];
            const result = {
                status: 'ok',
                cache: 'miss',
                target: parsedUrl.href,
                origin: cacheKey,
                icons: uniqueUrls([bestSiteIcon.url, ...publicProviderFallbacks].filter(Boolean)),
                candidates: [bestSiteIcon],
                rejected
            };
            setCached(cacheKey, result, SUCCESS_TTL_MS);
            return result;
        } catch (e) {
            const result = fallbackResult(parsedUrl, e.message || 'page-fetch-failed', rejected, deps);
            setCached(cacheKey, result, FALLBACK_TTL_MS);
            return result;
        }
    }

    return { discoverIcons };
}

module.exports = {
    createIconDiscoveryService,
    getFallbackIcons,
    SUCCESS_TTL_MS,
    FALLBACK_TTL_MS
};
