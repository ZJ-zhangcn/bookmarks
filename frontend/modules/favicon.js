/**
 * Favicon 获取模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { isPrivateOrLocalAddress, toSafeImageUrl, toSafeDataImageUrl, bindImageFallbacks } from './utils.js';
import { renderIconSelection } from './render.js';
import { normalizeFaviconResponse, createFaviconRequestGuard } from './favicon-helpers.cjs';

const faviconRequestGuard = createFaviconRequestGuard();

const FALLBACK_SOURCES = [
    domain => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
    domain => `https://favicon.im/${domain}`,
    domain => `https://icon.horse/icon/${domain}`
];

async function tryLoadImage(url, timeout = 3000) {
    return new Promise(resolve => {
        const img = new Image();
        const timer = setTimeout(() => { img.src = ''; resolve(false); }, timeout);
        img.onload = () => { clearTimeout(timer); resolve(img.width > 1 && img.height > 1); };
        img.onerror = () => { clearTimeout(timer); resolve(false); };
        img.src = url;
    });
}

export async function fetchFavicon() {
    const url = DOM.bookmarkInputUrl.value.trim();
    if (!url || state.currentIconType !== 'auto') return;

    const request = faviconRequestGuard.start(url);

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        DOM.iconPreviewAuto.innerHTML = '<span style="opacity:0.5">⏳</span>';

        if (isPrivateOrLocalAddress(domain)) {
            fetchProxyFavicon(url, request);
            return;
        }

        // 并行获取：同时请求后端代理和第三方服务
        const proxyPromise = fetch(`${state.API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        }).then(res => res.json()).catch(() => null);

        const fallbackPromises = FALLBACK_SOURCES.map(async getUrl => {
            const iconUrl = getUrl(domain);
            return (await tryLoadImage(iconUrl)) ? iconUrl : null;
        });

        // 等待所有请求完成
        const [proxyResult, ...fallbackResults] = await Promise.all([proxyPromise, ...fallbackPromises]);
        if (!faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;

        // 合并图标：网站自带图标优先
        const rawSiteIcons = normalizeFaviconResponse(proxyResult);
        const fallbackIcons = fallbackResults.filter(Boolean);

        // 网站自带图标放前面，第三方服务图标放后面，去重
        const allIcons = [...new Set([...rawSiteIcons, ...fallbackIcons])];

        if (allIcons.length > 0) {
            state.setAvailableIcons(allIcons);
            renderIconSelection(state.availableIcons);
        } else {
            DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        }
    } catch (e) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
    }
}

export async function fetchMoreIcons(url, domain) {
    try {
        const res = await fetch(`${state.API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        const icons = normalizeFaviconResponse(data);
        if (icons.length > 0) {
            if (isPrivateOrLocalAddress(domain)) {
                state.setAvailableIcons(icons);
            } else {
                const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                state.setAvailableIcons([...new Set([googleFavicon, ...icons.filter(i => i !== googleFavicon)])]);
            }
            renderIconSelection(state.availableIcons);
        }
    } catch (e) { }
}

export async function fetchProxyFavicon(url, request = null) {
    try {
        const res = await fetch(`${state.API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (request && !faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
        const icons = normalizeFaviconResponse(data);
        if (icons.length > 0) {
            state.setAvailableIcons(icons);
            renderIconSelection(state.availableIcons);
        } else {
            DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        }
    } catch (e) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
    }
}

export async function fetchEngineIcon() {
    const url = DOM.engineInputUrl.value.trim();
    if (!url) {
        alert('请先输入搜索 URL');
        return;
    }

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        DOM.engineIconPreview.innerHTML = '<span style="opacity:0.5">⏳</span>';

        if (isPrivateOrLocalAddress(domain)) {
            const localIcon = `${parsedUrl.origin}/favicon.ico`;
            const displayIcon = toSafeImageUrl(localIcon);
            if (await tryLoadImage(displayIcon)) {
                DOM.engineIconPreview.innerHTML = `<img src="${displayIcon}">`;
                DOM.engineIconPreview.dataset.iconUrl = localIcon;
            } else {
                DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
                delete DOM.engineIconPreview.dataset.iconUrl;
            }
            return;
        }

        for (const getUrl of FALLBACK_SOURCES) {
            const iconUrl = getUrl(domain);
            const displayIcon = toSafeImageUrl(iconUrl);
            if (await tryLoadImage(displayIcon)) {
                DOM.engineIconPreview.innerHTML = `<img src="${displayIcon}">`;
                DOM.engineIconPreview.dataset.iconUrl = iconUrl;
                return;
            }
        }

        DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
        delete DOM.engineIconPreview.dataset.iconUrl;
    } catch (e) {
        alert('URL 格式不正确');
    }
}

export function updateEngineIconPreviewUrl() {
    const url = DOM.engineInputIconUrl.value.trim();
    if (url) {
        DOM.engineIconPreview.innerHTML = `<img src="${toSafeImageUrl(url)}" alt="图标" data-fallback-icon="❌">`;
        bindImageFallbacks(DOM.engineIconPreview);
        delete DOM.engineIconPreview.dataset.iconUrl;
    } else {
        if (DOM.engineIconPreview.dataset.iconUrl) {
            const iconUrl = DOM.engineIconPreview.dataset.iconUrl;
            DOM.engineIconPreview.innerHTML = `<img src="${iconUrl.startsWith('data:') ? toSafeDataImageUrl(iconUrl) : toSafeImageUrl(iconUrl)}">`;
        } else {
            DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
        }
    }
}
