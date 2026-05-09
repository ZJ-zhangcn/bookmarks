const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const IMAGE_PROXY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site'
};

function sendTransparentPng(res, maxAge = 3600) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', `public, max-age=${maxAge}`);
    return res.send(TRANSPARENT_PNG);
}

async function proxyIconRequest(req, res, {
    safeFetchPublicUrl,
    readLimitedArrayBuffer,
    maxBytes = 1024 * 1024,
    timeoutMs = 10000,
    transparentOnFailure = true
}) {
    const { url } = req.query;
    if (!url) {
        if (transparentOnFailure) return sendTransparentPng(res, 86400);
        const err = new Error('缺少 url 参数');
        err.statusCode = 400;
        throw err;
    }

    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            if (transparentOnFailure) return sendTransparentPng(res, 86400);
            const err = new Error('仅允许 http/https 协议');
            err.statusCode = 400;
            throw err;
        }

        const headers = {
            ...IMAGE_PROXY_HEADERS,
            Referer: `${parsedUrl.origin}/`
        };
        const { response, url: finalUrl } = await safeFetchPublicUrl(parsedUrl.href, {
            timeoutMs,
            fetchOptions: { headers }
        });

        if (!response.ok) {
            if (transparentOnFailure) return sendTransparentPng(res, 3600);
            const err = new Error(`上游返回 ${response.status}`);
            err.statusCode = 502;
            throw err;
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        if (!contentType.startsWith('image/')) {
            if (transparentOnFailure) return sendTransparentPng(res, 3600);
            const err = new Error('上游不是图片内容');
            err.statusCode = 502;
            throw err;
        }

        const buffer = await readLimitedArrayBuffer(response, maxBytes);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800');
        res.setHeader('X-Proxy-Source', finalUrl.hostname);
        return res.send(buffer);
    } catch (e) {
        if (transparentOnFailure) return sendTransparentPng(res, 3600);
        throw e;
    }
}

module.exports = { proxyIconRequest, sendTransparentPng, TRANSPARENT_PNG };
