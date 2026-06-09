/**
 * 安全的 fetch 封装
 * Node.js 20+ 原生支持 fetch，无需 undici
 */

const dns = require('dns').promises;

/**
 * 检查 URL 是否允许访问
 */
async function isUrlAllowed(url) {
    const allowPrivate = String(process.env.ALLOW_PRIVATE_NETWORK || '').toLowerCase() === 'true';
    if (allowPrivate) return true;

    try {
        const { hostname } = new URL(url);

        // 本地地址直接拒绝
        if (['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase())) {
            return false;
        }

        // 内网保留地址直接拒绝
        if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(hostname)) {
            return false;
        }

        // DNS 解析检查
        const addresses = await dns.resolve4(hostname).catch(() => []);
        for (const ip of addresses) {
            if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(ip)) {
                return false;
            }
        }

        return true;
    } catch {
        return true; // 解析失败时允许（避免误杀）
    }
}

/**
 * 安全的 fetch（使用原生 fetch）
 */
async function safeFetch(url, options = {}) {
    const allowed = await isUrlAllowed(url);
    if (!allowed) {
        throw new Error('不允许访问内网或本地地址');
    }

    // 默认 10 秒超时
    const timeoutMs = options.timeout || 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)',
                ...(options.headers || {})
            }
        });
        return response;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = { safeFetch, isUrlAllowed };
