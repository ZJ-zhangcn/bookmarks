/**
 * 工具函数模块
 */
import * as state from './state.js';

/**
 * 统一 API 请求函数
 * 封装 fetch 调用，提供统一的错误处理、状态码检查和 JSON 解析
 * @param {string} url - API 路径（如 '/api/todos'）或完整 URL
 * @param {object} options - fetch 选项
 * @param {object} extra - 额外配置
 * @param {boolean} extra.silent - 为 true 时静默失败（不弹窗），默认 false
 * @param {string} extra.errorPrefix - 错误消息前缀，默认 '操作失败'
 * @returns {Promise<object|null>} - 成功时返回 result.data，失败时返回 null
 */
export async function apiFetch(url, options = {}, extra = {}) {
    const { silent = false, errorPrefix = '操作失败' } = extra;
    const fullUrl = url.startsWith('http') ? url : `${state.API_BASE}${url}`;

    try {
        const res = await fetch(fullUrl, options);

        // HTTP 状态码异常
        if (!res.ok) {
            let errMsg = `HTTP ${res.status}`;
            try {
                const errBody = await res.json();
                errMsg = errBody.error || errBody.message || errMsg;
            } catch { /* 解析失败则使用状态码 */ }

            if (!silent) {
                console.error(`${errorPrefix}: ${errMsg}`);
            }
            return null;
        }

        const result = await res.json();

        // 业务逻辑错误
        if (result && !result.success) {
            const errMsg = result.error || result.message || '未知错误';
            if (!silent) {
                console.error(`${errorPrefix}: ${errMsg}`);
            }
            return null;
        }

        return result?.data !== undefined ? result.data : result;
    } catch (e) {
        // 网络错误 / JSON 解析错误
        if (!silent) {
            console.error(`${errorPrefix}: ${e.message}`);
        }
        return null;
    }
}

export function debounce(fn, delay = 300) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

export function throttle(fn, limit = 100) {
    let inThrottle = false;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

export function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function escapeHtmlAttribute(s) {
    return escapeHtml(s).replace(/\r?\n/g, ' ');
}

export function highlightText(text, searchTerm) {
    const source = escapeHtml(text);
    if (!searchTerm || !source) return source;
    const regex = new RegExp(`(${escapeRegExp(escapeHtml(searchTerm))})`, 'gi');
    return source.replace(regex, '<span class="highlight">$1</span>');
}

export function escapeRegExp(s) {
    return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function toSafeDataImageUrl(url) {
    const src = String(url || '').trim();
    return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(src) ? src : '';
}

export function toSafeExternalUrl(url) {
    const src = String(url || '').trim();
    try {
        const parsed = new URL(src);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '#';
    } catch {
        return '#';
    }
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

export function preloadImage(url, timeoutMs = 4000) {
    const src = String(url || '').trim();
    if (!src) return Promise.resolve(false);
    return new Promise(resolve => {
        const img = new Image();
        let done = false;
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            resolve(false);
        }, timeoutMs);

        img.onload = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(true);
        };
        img.onerror = () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve(false);
        };

        img.src = src;
    });
}

function parseIpv6Hextets(ip) {
    if (!String(ip || '').includes(':')) return null;
    let normalized = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    const zoneIndex = normalized.indexOf('%');
    if (zoneIndex !== -1) normalized = normalized.slice(0, zoneIndex);
    if (normalized.includes('.')) {
        const lastColon = normalized.lastIndexOf(':');
        const dotted = normalized.slice(lastColon + 1);
        const octets = dotted.split('.').map(Number);
        if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null;
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

function ipv4FromMappedIpv6(host) {
    const hextets = parseIpv6Hextets(host);
    if (!hextets) return null;
    const isMapped = hextets.slice(0, 5).every(part => part === 0) && hextets[5] === 0xffff;
    if (!isMapped) return null;
    return `${(hextets[6] >> 8) & 255}.${hextets[6] & 255}.${(hextets[7] >> 8) & 255}.${hextets[7] & 255}`;
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

export function isPrivateOrLocalAddress(hostname) {
    const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '::') return true;
    const mappedIpv4 = ipv4FromMappedIpv6(host);
    if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return isPrivateIpv4(host);
    const hextets = parseIpv6Hextets(host);
    if (!hextets) return false;
    const first = hextets[0];
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

export function fallbackIconHtml(icon) {
    return `<span>${escapeHtml(icon || '🌐')}</span>`;
}

export function bindImageFallbacks(root = document) {
    root.querySelectorAll('img[data-fallback-icon], img[data-remove-on-error]').forEach(img => {
        img.addEventListener('error', () => {
            if (img.dataset.removeOnError) {
                img.parentElement?.remove();
            } else {
                img.outerHTML = fallbackIconHtml(img.dataset.fallbackIcon || '🌐');
            }
        }, { once: true });
    });
}

const PREFER_PROXY_HOSTS = [
    'grok.com',
    'github.com',
    'githubusercontent.com',
    'google.com',
    'huggingface.co',
    'zhihu.com',
    'tool.lu',
    'leaflow.net',
    'the-x.cn'
];

export function toProxyUrl(url) {
    return `${state.API_BASE}/api/proxy-icon?url=${encodeURIComponent(url)}`;
}

export function shouldUseProxyUrl(url, { preferProxyHosts = true } = {}) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname;
        if (isPrivateOrLocalAddress(host)) return false;
        if (window.location.protocol === 'https:' && parsed.protocol === 'http:') return true;
        return preferProxyHosts && PREFER_PROXY_HOSTS.some(domain => host === domain || host.endsWith('.' + domain));
    } catch (e) {
        return false;
    }
}

export function toSafeImageUrl(url, options = {}) {
    const safeDataUrl = toSafeDataImageUrl(url);
    if (safeDataUrl) return safeDataUrl;
    const safeUrl = toSafeExternalUrl(url);
    if (safeUrl === '#') return '';
    return shouldUseProxyUrl(safeUrl, options) ? toProxyUrl(safeUrl) : safeUrl;
}

export function toPreferredIconImageUrl(url) {
    return toSafeImageUrl(url, { preferProxyHosts: true });
}
