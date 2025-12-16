/**
 * Favicon 获取模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { isPrivateOrLocalAddress } from './utils.js';
import { renderIconSelection } from './render.js';

export async function fetchFavicon() {
    const url = DOM.bookmarkInputUrl.value.trim();
    if (!url || state.currentIconType !== 'auto') return;

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        DOM.iconPreviewAuto.innerHTML = '<span style="opacity:0.5">⏳</span>';

        if (isPrivateOrLocalAddress(domain)) {
            fetchProxyFavicon(url);
            return;
        }

        const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        const testImg = new Image();
        testImg.onload = function () {
            if (this.width > 1 && this.height > 1) {
                state.setAvailableIcons([googleFavicon]);
                renderIconSelection(state.availableIcons);
                fetchMoreIcons(url, domain);
            } else {
                fetchProxyFavicon(url);
            }
        };
        testImg.onerror = function () { fetchProxyFavicon(url); };
        testImg.src = googleFavicon;
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
        if (data.success && data.icons && data.icons.length > 0) {
            if (isPrivateOrLocalAddress(domain)) {
                state.setAvailableIcons(data.icons);
            } else {
                const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                state.setAvailableIcons([...new Set([googleFavicon, ...data.icons.filter(i => i !== googleFavicon)])]);
            }
            renderIconSelection(state.availableIcons);
        }
    } catch (e) { }
}

export async function fetchProxyFavicon(url) {
    try {
        const res = await fetch(`${state.API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success && data.icons && data.icons.length > 0) {
            state.setAvailableIcons(data.icons);
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

        const faviconUrl = isPrivateOrLocalAddress(domain)
            ? `${parsedUrl.origin}/favicon.ico`
            : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

        const testImg = new Image();
        testImg.onload = function () {
            DOM.engineIconPreview.innerHTML = `<img src="${faviconUrl}">`;
            DOM.engineIconPreview.dataset.iconUrl = faviconUrl;
        };
        testImg.onerror = function () {
            DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
            delete DOM.engineIconPreview.dataset.iconUrl;
            alert('自动获取图标失败，请手动输入图标 URL');
        };
        testImg.src = faviconUrl;
    } catch (e) {
        alert('URL 格式不正确');
    }
}

export function updateEngineIconPreviewUrl() {
    const url = DOM.engineInputIconUrl.value.trim();
    if (url) {
        DOM.engineIconPreview.innerHTML = `<img src="${url}" alt="图标" onerror="this.parentElement.innerHTML='<span>❌</span>'">`;
        delete DOM.engineIconPreview.dataset.iconUrl;
    } else {
        if (DOM.engineIconPreview.dataset.iconUrl) {
            DOM.engineIconPreview.innerHTML = `<img src="${DOM.engineIconPreview.dataset.iconUrl}">`;
        } else {
            DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
        }
    }
}
