/**
 * 工具函数模块
 */
import * as state from './state.js';
import iconPolicy from '../../shared/icon-policy.cjs';

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
    return /^data:image\/(png|jpe?g|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|icon);base64,[a-z0-9+/=\s]+$/i.test(src) ? src : '';
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

export function isPrivateOrLocalAddress(hostname) {
    return iconPolicy.isPrivateOrLocalAddress(hostname);
}

export function fallbackIconHtml(icon) {
    return `<span>${escapeHtml(icon || '🌐')}</span>`;
}

function selectNextVisibleIconOption(hiddenWrap) {
    if (!hiddenWrap?.classList?.contains('selected')) return;
    hiddenWrap.classList.remove('selected');
    const options = [...hiddenWrap.parentElement?.querySelectorAll('.icon-option-wrap') || []];
    const next = options.find(option => option !== hiddenWrap && !option.hidden);
    if (next) next.classList.add('selected');
}

function hideIconOption(wrap) {
    if (!wrap?.classList?.contains('icon-option-wrap')) return;
    selectNextVisibleIconOption(wrap);
    wrap.hidden = true;
}

function isSolidPlaceholderImage(img) {
    if (!img?.dataset?.hideSolidPlaceholder) return false;
    const width = img.naturalWidth || img.width || 0;
    const height = img.naturalHeight || img.height || 0;
    if (width < 2 || height < 2) return true;

    const canvas = document.createElement('canvas');
    const size = 16;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    try {
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let samples = 0;
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
            samples += 1;
            const key = [
                Math.round(data[i] / 16),
                Math.round(data[i + 1] / 16),
                Math.round(data[i + 2] / 16),
                Math.round(data[i + 3] / 16)
            ].join(':');
            buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        const dominant = Math.max(...buckets.values());
        return dominant / samples > 0.9;
    } catch {
        return false;
    }
}

export function bindImageFallbacks(root = document) {
    root.querySelectorAll('img[data-fallback-icon], img[data-remove-on-error]').forEach(img => {
        const hideIfSolidPlaceholder = () => {
            if (isSolidPlaceholderImage(img)) {
                hideIconOption(img.parentElement);
            }
        };
        img.addEventListener('load', hideIfSolidPlaceholder, { once: true });
        if (img.complete) setTimeout(hideIfSolidPlaceholder, 0);
        img.addEventListener('error', () => {
            if (img.dataset.removeOnError) {
                const parent = img.parentElement;
                if (img.dataset.hideOnError && parent?.classList.contains('icon-option-wrap')) {
                    hideIconOption(parent);
                    return;
                }
                img.remove();
                if (parent?.classList.contains('icon-option-wrap')) {
                    parent.classList.add('icon-option-error');
                    if (!parent.querySelector('.icon-option-fallback')) {
                        parent.insertAdjacentHTML('afterbegin', '<span class="icon-option-fallback">🌐</span>');
                    }
                    return;
                }
                if (parent && parent.childElementCount === 0) parent.remove();
            } else {
                img.outerHTML = fallbackIconHtml(img.dataset.fallbackIcon || '🌐');
            }
        }, { once: true });
    });
}

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
        return preferProxyHosts && iconPolicy.shouldPreferProxyHost(host);
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
