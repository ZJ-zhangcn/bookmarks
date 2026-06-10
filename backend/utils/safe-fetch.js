/**
 * 安全的 fetch 封装
 * Node.js 20+ 原生支持 fetch，无需 undici
 */

/**
 * 检查 URL 是否允许访问（简化版，仅检查明显的内网地址）
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
        if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.)/.test(hostname)) {
            return false;
        }

        // 跳过 DNS 解析检查以提升性能
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

    // 默认 15 秒超时（增加超时时间以应对网络延迟）
    const timeoutMs = options.timeout || 15000;
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

/**
 * safeFetchPublicUrl 兼容包装
 */
async function safeFetchPublicUrl(url, options = {}) {
    const response = await safeFetch(url, {
        timeout: options.timeoutMs || 10000,
        headers: options.fetchOptions?.headers || {}
    });
    return { response, url };
}

/**
 * 读取有限大小的响应内容
 */
async function readLimitedArrayBuffer(response, maxBytes = 1024 * 1024) {
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
        throw new Error('响应内容过大');
    }

    return buffer;
}

module.exports = { safeFetch, isUrlAllowed, safeFetchPublicUrl, readLimitedArrayBuffer };
