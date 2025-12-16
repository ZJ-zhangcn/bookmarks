/**
 * Favicon 代理路由模块
 */
const express = require('express');
const cheerio = require('cheerio');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');

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

module.exports = function(_db) {
    // POST /api/favicon
    router.post('/', asyncHandler(async (req, res) => {
        const { url } = req.body;
        if (!url) {
            throw new AppError('URL is required', 400);
        }

        try {
            const parsedUrl = new URL(url);
            const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
            const isPrivate = isPrivateOrLocalAddress(parsedUrl.hostname);

            const response = await fetch(url, {
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

            if (!isPrivate) {
                icons.push(`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`);
            }

            res.json(success(icons, 'ok'));
        } catch (e) {
            try {
                const parsedUrl = new URL(url);
                if (isPrivateOrLocalAddress(parsedUrl.hostname)) {
                    res.json(success([`${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`]));
                } else {
                    res.json(success([`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`]));
                }
            } catch {
                throw new AppError(e.message, 500);
            }
        }
    }));

    return router;
};
