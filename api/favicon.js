/**
 * Favicon 代理 API - POST /api/favicon
 */

const cheerio = require('cheerio');

// 判断是否为内网/本地地址
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

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    try {
        const parsedUrl = new URL(url);
        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
        const isPrivate = isPrivateOrLocalAddress(parsedUrl.hostname);

        // 尝试获取页面 HTML
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(5000)
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        const icons = [];

        // 解析各种 favicon 来源
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

        // 添加默认 favicon.ico
        const defaultFavicon = `${baseUrl}/favicon.ico`;
        if (!icons.includes(defaultFavicon)) {
            icons.push(defaultFavicon);
        }

        // 只有外网地址才添加 Google 备用
        if (!isPrivate) {
            icons.push(`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`);
        }

        res.json({ success: true, icons });
    } catch (e) {
        try {
            const parsedUrl = new URL(url);
            if (isPrivateOrLocalAddress(parsedUrl.hostname)) {
                res.json({
                    success: true,
                    icons: [`${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`]
                });
            } else {
                res.json({
                    success: true,
                    icons: [`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`]
                });
            }
        } catch {
            res.status(500).json({ success: false, error: e.message });
        }
    }
};
