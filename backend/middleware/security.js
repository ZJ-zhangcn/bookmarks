/**
 * 安全中间件
 */


const dns = require('dns').promises;
const net = require('net');

function requireAdmin(req, res, next) {
    const token = String(process.env.ADMIN_TOKEN || '').trim();
    const allowAnonymous = String(process.env.ALLOW_ANONYMOUS_WRITE || '').toLowerCase() === 'true';
    if (!token) {
        if (allowAnonymous) return next();
        return res.status(401).json({ success: false, error: '未配置 ADMIN_TOKEN 且未允许匿名写入（设置 ALLOW_ANONYMOUS_WRITE=true 可放开）' });
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth === `Bearer ${token}`) return next();
    res.status(401).json({ success: false, error: '未授权：请提供 Authorization: Bearer ***' });
}

function requireStrictAdmin(req, res, next) {
    const token = String(process.env.ADMIN_TOKEN || '').trim();
    if (!token) {
        return res.status(401).json({ success: false, error: '未配置 ADMIN_TOKEN，拒绝执行高风险批量操作' });
    }
    const auth = String(req.headers.authorization || '').trim();
    if (auth === `Bearer ${token}`) return next();
    res.status(401).json({ success: false, error: '未授权：请提供 Authorization: Bearer ***' });
}

function normalizeHostForIpCheck(hostname) {
    let lower = String(hostname || '').trim().toLowerCase();
    if (lower.startsWith('[') && lower.endsWith(']')) {
        lower = lower.slice(1, -1);
    }
    return lower;
}

function parseIpv6Hextets(ip) {
    if (net.isIP(ip) !== 6) return null;
    let normalized = ip.toLowerCase();
    const zoneIndex = normalized.indexOf('%');
    if (zoneIndex !== -1) normalized = normalized.slice(0, zoneIndex);

    if (normalized.includes('.')) {
        const lastColon = normalized.lastIndexOf(':');
        const dotted = normalized.slice(lastColon + 1);
        if (net.isIP(dotted) !== 4) return null;
        const octets = dotted.split('.').map(Number);
        normalized = `${normalized.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    }

    const parts = normalized.split('::');
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
    const missing = parts.length === 2 ? 8 - left.length - right.length : 0;
    const hextets = [...left, ...Array(missing).fill('0'), ...right];
    if (hextets.length !== 8) return null;
    const parsed = hextets.map(part => /^[0-9a-f]{1,4}$/i.test(part) ? parseInt(part, 16) : NaN);
    return parsed.some(Number.isNaN) ? null : parsed;
}

function ipv4FromMappedIpv6(ip) {
    const hextets = parseIpv6Hextets(ip);
    if (!hextets) return null;
    const isMapped = hextets.slice(0, 5).every(part => part === 0) && hextets[5] === 0xffff;
    if (!isMapped) return null;
    return `${(hextets[6] >> 8) & 255}.${hextets[6] & 255}.${(hextets[7] >> 8) & 255}.${hextets[7] & 255}`;
}

function isPrivateOrLocalAddress(hostname) {
    if (!hostname) return true;
    const lower = normalizeHostForIpCheck(hostname);
    if (lower === 'localhost' || lower === '::1' || lower === '::' || lower === '0.0.0.0') return true;
    const mappedIpv4 = ipv4FromMappedIpv6(lower);
    if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
    const ipVersion = net.isIP(lower);
    if (ipVersion === 4) return isPrivateIpv4(lower);
    if (ipVersion === 6) return isPrivateIpv6(lower);
    return false;
}

function isPrivateIpv4(ip) {
    return [
        /^127\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^0\./,
        /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./
    ].some(p => p.test(ip));
}

function ipv6FirstHextet(ip) {
    const hextets = parseIpv6Hextets(ip);
    return hextets ? hextets[0] : null;
}

function isPrivateIpv6(ip) {
    const first = ipv6FirstHextet(ip);
    return ip === '::1'
        || ip === '::'
        || (first !== null && (first & 0xfe00) === 0xfc00)
        || (first !== null && (first & 0xffc0) === 0xfe80);
}

async function assertPublicFetchUrl(raw) {
    const u = assertSafeFetchUrl(raw);
    const allowPrivate = String(process.env.ALLOW_PRIVATE_FETCH || '').toLowerCase() === 'true';
    if (allowPrivate) return u;

    const records = await dns.lookup(u.hostname, { all: true, verbatim: true });
    if (!records || records.length === 0 || records.some(record => isPrivateOrLocalAddress(record.address))) {
        throw new Error('禁止访问解析到内网/本地地址的 URL');
    }
    return u;
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

module.exports = { requireAdmin, requireStrictAdmin, assertSafeFetchUrl, assertPublicFetchUrl, isPrivateOrLocalAddress };
