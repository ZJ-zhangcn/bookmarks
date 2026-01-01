/**
 * 鉴权与 CORS 工具模块
 * 用于 Vercel Serverless Functions
 */

/**
 * 检查管理员令牌
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @returns {boolean} - 是否通过鉴权
 */
function requireAdmin(req, res) {
    const token = String(process.env.ADMIN_TOKEN || '').trim();
    const allowAnonymous = String(process.env.ALLOW_ANONYMOUS_WRITE || '').toLowerCase() === 'true';
    if (!token) {
        if (allowAnonymous) return true;
        res.status(401).json({ success: false, error: '未配置 ADMIN_TOKEN 且未允许匿名写入（设置 ALLOW_ANONYMOUS_WRITE=true 可放开）' });
        return false;
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth === `Bearer ${token}`) return true;
    res.status(401).json({ success: false, error: '未授权：请提供 Authorization: Bearer <ADMIN_TOKEN>' });
    return false;
}

/**
 * 设置 CORS 头（收紧版本）
 * 通过 CORS_ORIGIN 环境变量配置允许的源
 * @param {Object} res - 响应对象
 * @param {Object} req - 请求对象（可选，用于动态 Origin 匹配）
 */
function setCors(res, req = null) {
    const allowedOrigins = String(process.env.CORS_ORIGIN || '').trim();

    if (allowedOrigins) {
        // 支持多个 origin，逗号分隔
        const origins = allowedOrigins.split(',').map(o => o.trim()).filter(Boolean);
        const requestOrigin = req?.headers?.origin;

        if (requestOrigin && origins.includes(requestOrigin)) {
            res.setHeader('Access-Control-Allow-Origin', requestOrigin);
        } else if (origins.length === 1) {
            res.setHeader('Access-Control-Allow-Origin', origins[0]);
        } else {
            res.setHeader('Access-Control-Allow-Origin', 'null');
        }
    } else {
        // 未配置时默认允许所有（兼容模式）
        // 生产环境强烈建议设置 CORS_ORIGIN
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * 检查是否为私网/本地地址
 * @param {string} hostname - 主机名
 * @returns {boolean}
 */
function isPrivateOrLocalAddress(hostname) {
    if (!hostname) return true;
    const lower = String(hostname).toLowerCase();

    // localhost 和回环地址
    if (lower === 'localhost' || lower === '::1' || lower === '0.0.0.0') {
        return true;
    }

    // 私网地址段
    const privatePatterns = [
        /^127\./,                         // 127.0.0.0/8 回环地址
        /^10\./,                          // 10.0.0.0/8
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
        /^192\.168\./,                    // 192.168.0.0/16
        /^169\.254\./,                    // 链路本地
        /^0\./,                           // 0.0.0.0/8
        /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./, // 100.64.0.0/10 CGNAT
        /^fc00:/i,                        // IPv6 私网
        /^fe80:/i,                        // IPv6 链路本地
        /^fd[0-9a-f]{2}:/i               // IPv6 ULA
    ];

    return privatePatterns.some(p => p.test(lower));
}

/**
 * 验证 URL 是否安全（防 SSRF）
 * @param {string} raw - 原始 URL
 * @returns {URL} - 解析后的 URL 对象
 * @throws {Error} - URL 不合法或指向私网地址
 */
function assertSafeFetchUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) throw new Error('缺少 URL');

    let u;
    try {
        u = new URL(s);
    } catch {
        throw new Error('URL 格式不合法');
    }

    // 仅允许 http/https
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('仅允许 http/https 协议');
    }

    // 检查私网地址
    const allowPrivate = String(process.env.ALLOW_PRIVATE_FETCH || '').toLowerCase() === 'true';
    if (!allowPrivate && isPrivateOrLocalAddress(u.hostname)) {
        throw new Error('禁止访问内网/本地地址（可设置 ALLOW_PRIVATE_FETCH=true 放开）');
    }

    return u;
}

module.exports = {
    requireAdmin,
    setCors,
    isPrivateOrLocalAddress,
    assertSafeFetchUrl
};
