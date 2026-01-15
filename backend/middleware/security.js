/**
 * 安全中间件
 */

function requireAdmin(req, res, next) {
    const token = String(process.env.ADMIN_TOKEN || '').trim();
    const allowAnonymous = String(process.env.ALLOW_ANONYMOUS_WRITE || '').toLowerCase() === 'true';
    if (!token) {
        if (allowAnonymous) return next();
        return res.status(401).json({ success: false, error: '未配置 ADMIN_TOKEN 且未允许匿名写入（设置 ALLOW_ANONYMOUS_WRITE=true 可放开）' });
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth === `Bearer ${token}`) return next();
    res.status(401).json({ success: false, error: '未授权：请提供 Authorization: Bearer <ADMIN_TOKEN>' });
}

function isPrivateOrLocalAddress(hostname) {
    if (!hostname) return true;
    const lower = String(hostname).toLowerCase();
    if (lower === 'localhost' || lower === '::1' || lower === '0.0.0.0') return true;
    const privatePatterns = [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\./,
        /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
        /^fc00:/i,
        /^fe80:/i,
        /^fd[0-9a-f]{2}:/i
    ];
    return privatePatterns.some(p => p.test(lower));
}

function assertSafeFetchUrl(raw) {
    const s = String(raw || '').trim();
    if (!s) throw new Error('缺少 URL');
    let u;
    try { u = new URL(s); } catch { throw new Error('URL 格式不合法'); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('仅允许 http/https 协议');
    }
    const allowPrivate = String(process.env.ALLOW_PRIVATE_FETCH || '').toLowerCase() === 'true';
    if (!allowPrivate && isPrivateOrLocalAddress(u.hostname)) {
        throw new Error('禁止访问内网/本地地址（可设置 ALLOW_PRIVATE_FETCH=true 放开）');
    }
    return u;
}

module.exports = { requireAdmin, assertSafeFetchUrl, isPrivateOrLocalAddress };
