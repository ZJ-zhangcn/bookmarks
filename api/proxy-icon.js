/**
 * Vercel Serverless Function: 图标代理
 * 解决被墙图标无法显示的问题
 */

module.exports = async (req, res) => {
    // 只允许 GET 请求
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ success: false, error: '缺少 url 参数' });
    }

    // 安全检查
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            return res.status(400).json({ success: false, error: '仅支持 http/https 协议' });
        }
    } catch (e) {
        return res.status(400).json({ success: false, error: '无效的 URL' });
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(10000) // 10秒超时
        });

        if (!response.ok) {
            return res.status(502).json({ success: false, error: `上游返回 ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        const buffer = Buffer.from(await response.arrayBuffer());

        // 设置响应头
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800'); // 7天缓存
        res.setHeader('X-Proxy-Source', parsedUrl.hostname);

        return res.send(buffer);
    } catch (e) {
        return res.status(502).json({ success: false, error: `代理请求失败: ${e.message}` });
    }
};
