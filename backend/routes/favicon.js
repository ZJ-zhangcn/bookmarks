/**
 * Favicon 代理路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { assertPublicFetchUrl, isPrivateOrLocalAddress } = require('../middleware/security');
const { safeFetchPublicUrl, readLimitedArrayBuffer } = require('../utils/safe-fetch');
const { selectBestIcons } = require('../utils/icon-discovery');

const FETCH_TIMEOUT = 5000;
const CACHE_TTL = 300000; // 5分钟缓存
const faviconCache = new Map();

function getFallbackIcons(host, isPrivate, protocol = 'https:') {
    if (isPrivate) {
        return [`${protocol}//${host}/favicon.ico`];
    }
    return [
        `https://www.google.com/s2/favicons?domain=${host}&sz=64`,
        `https://favicon.im/${host}`,
        `https://icon.horse/icon/${host}`
    ];
}

function getCachedResult(domain) {
    const cached = faviconCache.get(domain);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.icons;
    }
    return null;
}

function setCachedResult(domain, icons) {
    faviconCache.set(domain, { icons, timestamp: Date.now() });
    if (faviconCache.size > 500) {
        const oldest = faviconCache.keys().next().value;
        faviconCache.delete(oldest);
    }
}

module.exports = function(_db) {
    // POST /api/favicon
    router.post('/', asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('URL is required', 400);
        }

        let parsedUrl;
        try {
            parsedUrl = await assertPublicFetchUrl(url);
        } catch (e) {
            throw new AppError(e.message, 400);
        }

        const domain = parsedUrl.host;
        const baseUrl = `${parsedUrl.protocol}//${domain}`;
        const isPrivate = isPrivateOrLocalAddress(parsedUrl.hostname);

        const cached = getCachedResult(domain);
        if (cached) {
            return res.json(success(cached, 'ok'));
        }

        try {
            const { response } = await safeFetchPublicUrl(parsedUrl.href, {
                allowPrivate: isPrivate,
                timeoutMs: FETCH_TIMEOUT,
                fetchOptions: {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                }
            });

            const html = (await readLimitedArrayBuffer(response, 512 * 1024)).toString('utf8');
            const icons = [];
            const addIcon = async iconUrl => {
                try {
                    const finalIconUrl = isPrivate
                        ? new URL(iconUrl)
                        : await assertPublicFetchUrl(iconUrl);
                    if (!icons.includes(finalIconUrl.href)) {
                        icons.push(finalIconUrl.href);
                    }
                } catch { /* skip invalid or blocked icon URL */ }
            };

            const discoveredIcons = await selectBestIcons(html, parsedUrl.href, async manifestUrl => {
                const { response: manifestResponse } = await safeFetchPublicUrl(manifestUrl, {
                    allowPrivate: isPrivate,
                    timeoutMs: FETCH_TIMEOUT,
                    fetchOptions: {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    }
                });
                if (!manifestResponse.ok) return null;
                const manifestText = (await readLimitedArrayBuffer(manifestResponse, 128 * 1024)).toString('utf8');
                return JSON.parse(manifestText);
            });

            for (const icon of discoveredIcons) {
                await addIcon(icon);
            }

            await addIcon(`${baseUrl}/favicon.ico`);

            const fallbacks = getFallbackIcons(domain, isPrivate, parsedUrl.protocol);
            fallbacks.forEach(fb => {
                if (!icons.includes(fb)) icons.push(fb);
            });

            setCachedResult(domain, icons);
            res.json(success(icons, 'ok'));
        } catch (e) {
            const fallbacks = getFallbackIcons(domain, isPrivate, parsedUrl.protocol);
            setCachedResult(domain, fallbacks);
            res.json(success(fallbacks, 'ok'));
        }
    }));

    return router;
};
