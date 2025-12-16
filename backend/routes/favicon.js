/**
 * Favicon 代理路由模块
 */
const express = require('express');
const cheerio = require('cheerio');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');

const FETCH_TIMEOUT = 5000;
const CACHE_TTL = 300000; // 5分钟缓存
const faviconCache = new Map();

function isPrivateOrLocalAddress(hostname) {
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    const privatePatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^fc00:/i,
        /^fe80:/i
    ];
    return privatePatterns.some(p => p.test(hostname));
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeout);
    }
}

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
            parsedUrl = new URL(url);
        } catch {
            throw new AppError('Invalid URL format', 400);
        }

        const domain = parsedUrl.host;
        const baseUrl = `${parsedUrl.protocol}//${domain}`;
        const isPrivate = isPrivateOrLocalAddress(parsedUrl.hostname);

        const cached = getCachedResult(domain);
        if (cached) {
            return res.json(success(cached, 'ok'));
        }

        try {
            const response = await fetchWithTimeout(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const html = await response.text();
            const $ = cheerio.load(html);

            const icons = [];
            const selectors = [
                'link[rel="icon"]',
                'link[rel="shortcut icon"]',
                'link[rel="apple-touch-icon"]',
                'link[rel="apple-touch-icon-precomposed"]',
                'meta[property="og:image"]'
            ];

            selectors.forEach(selector => {
                $(selector).each((_, el) => {
                    let href = $(el).attr('href') || $(el).attr('content');
                    if (href) {
                        if (href.startsWith('//')) {
                            href = parsedUrl.protocol + href;
                        } else if (href.startsWith('/')) {
                            href = baseUrl + href;
                        } else if (!href.startsWith('http')) {
                            href = baseUrl + '/' + href;
                        }
                        if (!icons.includes(href)) {
                            icons.push(href);
                        }
                    }
                });
            });

            const defaultFavicon = `${baseUrl}/favicon.ico`;
            if (!icons.includes(defaultFavicon)) {
                icons.push(defaultFavicon);
            }

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
