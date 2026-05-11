const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { assertPublicFetchUrl } = require('../middleware/security');
const { safeFetchPublicUrl, readLimitedArrayBuffer } = require('../utils/safe-fetch');

const FETCH_TIMEOUT = 6000;
const MAX_HTML_BYTES = 512 * 1024;

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/')
        .replace(/&#(\d+);/g, (_, code) => {
            const n = Number(code);
            return Number.isFinite(n) ? String.fromCharCode(n) : _;
        })
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
            const n = parseInt(code, 16);
            return Number.isFinite(n) ? String.fromCharCode(n) : _;
        });
}

function extractTitle(html) {
    const source = String(html || '');
    const ogTitle = source.match(/<meta[^>]+(?:property|name)=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)
        || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i);
    const titleMatch = source.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const raw = ogTitle?.[1] || titleMatch?.[1] || '';
    return decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim().slice(0, 120);
}

module.exports = function(_db) {
    router.post('/', asyncHandler(async (req, res) => {
        const { url } = req.body || {};
        if (!url) throw new AppError('URL is required', 400);

        let parsedUrl;
        try {
            parsedUrl = await assertPublicFetchUrl(url);
        } catch (e) {
            throw new AppError(e.message, 400);
        }

        const { response } = await safeFetchPublicUrl(parsedUrl.href, {
            timeoutMs: FETCH_TIMEOUT,
            fetchOptions: {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml'
                }
            }
        });

        if (!response.ok) throw new AppError(`HTTP ${response.status}`, 502);
        const contentType = response.headers.get('content-type') || '';
        if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
            return res.json(success({ title: '' }));
        }

        const html = (await readLimitedArrayBuffer(response, MAX_HTML_BYTES)).toString('utf8');
        res.json(success({ title: extractTitle(html) }));
    }));

    return router;
};

module.exports.extractTitle = extractTitle;
module.exports.decodeHtmlEntities = decodeHtmlEntities;
