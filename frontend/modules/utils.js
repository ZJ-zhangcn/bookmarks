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

export function highlightText(text, searchTerm) {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

export function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeHtmlAttribute(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\r?\n/g, ' ');
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

export function isPrivateOrLocalAddress(hostname) {
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

export function shouldUseProxyUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        if (window.location.protocol === 'https:' && parsed.protocol === 'http:') return true;
        const host = parsed.hostname;
        return PREFER_PROXY_HOSTS.some(domain => host === domain || host.endsWith('.' + domain));
    } catch (e) {
        return false;
    }
}

export function toSafeImageUrl(url) {
    return shouldUseProxyUrl(url) ? toProxyUrl(url) : url;
}
