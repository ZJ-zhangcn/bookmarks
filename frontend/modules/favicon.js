/**
 * Favicon 获取模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { isPrivateOrLocalAddress, toSafeImageUrl, toPreferredIconImageUrl, toSafeDataImageUrl, bindImageFallbacks, escapeHtml, escapeHtmlAttribute } from './utils.js';
import { showToast } from './ux.js';
import { renderIconSelection } from './render.js';
import {
    normalizeFaviconResponse,
    createFaviconRequestGuard,
    buildLocalFaviconCandidates,
    mergeIconsWithLocalFallback
} from './favicon-helpers.cjs';

const faviconRequestGuard = createFaviconRequestGuard();
const metadataRequestGuard = createFaviconRequestGuard();

async function tryLoadImage(url, timeout = 3000) {
    return new Promise(resolve => {
        const img = new Image();
        const timer = setTimeout(() => { img.src = ''; resolve(false); }, timeout);
        img.onload = () => { clearTimeout(timer); resolve(img.width > 1 && img.height > 1); };
        img.onerror = () => { clearTimeout(timer); resolve(false); };
        img.src = url;
    });
}

function directHttpImageUrl(raw) {
    try {
        const u = new URL(String(raw || '').trim());
        return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
    } catch {
        return '';
    }
}

async function findLoadableIcons(candidates, timeout = 3000) {
    const results = await Promise.all(candidates.map(async iconUrl => {
        const directUrl = directHttpImageUrl(iconUrl);
        return directUrl && (await tryLoadImage(directUrl, timeout)) ? directUrl : null;
    }));
    return results.filter(Boolean);
}

function localIconSourceLabel(url) {
    const s = String(url || '');
    if (s.includes('apple-touch-icon')) return { label: '本地 Apple', class: 'source-apple' };
    return { label: '本地直连', class: 'source-site' };
}

function renderLocalIconSelection(localIcons) {
    const icons = Array.isArray(localIcons) ? localIcons : [];
    state.setAvailableIcons(icons);

    if (icons.length === 0) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        delete DOM.iconPreviewAuto.dataset.hasCandidates;
        return;
    }

    DOM.iconPreviewAuto.innerHTML = `<div class="icon-selection">
        ${icons.slice(0, 6).map((icon, idx) => {
        const source = localIconSourceLabel(icon);
        return `<div class="icon-option-wrap ${idx === 0 ? 'selected' : ''}" data-url="${escapeHtmlAttribute(icon)}" title="${escapeHtmlAttribute(source.label)}">
                <img src="${escapeHtmlAttribute(icon)}" data-url="${escapeHtmlAttribute(icon)}" class="icon-option" data-remove-on-error="true">
                <span class="icon-source-label ${source.class}">${escapeHtml(source.label)}</span>
            </div>`;
    }).join('')}
    </div>`;
    DOM.iconPreviewAuto.dataset.hasCandidates = 'true';

    DOM.iconPreviewAuto.querySelectorAll('.icon-option-wrap').forEach(wrap => {
        wrap.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            DOM.iconPreviewAuto.querySelectorAll('.icon-option-wrap').forEach(w => w.classList.remove('selected'));
            wrap.classList.add('selected');
        });
    });
    bindImageFallbacks(DOM.iconPreviewAuto);
}

function buildBrowserFallbackCandidates(url, _domain) {
    return buildLocalFaviconCandidates(url);
}

async function getLocalFallbackIcons(url, { timeout = 3000 } = {}) {
    let domain = '';
    try { domain = new URL(url).hostname; } catch { return []; }
    return findLoadableIcons(buildBrowserFallbackCandidates(url, domain), timeout);
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
            const localIcons = await getLocalFallbackIcons(url);
            if (!faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
            renderLocalIconSelection(localIcons);
            return;
        }

        // 并行获取：同时请求后端发现和当前浏览器可直连的同源图标候选
        const proxyPromise = fetch(`${state.API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        }).then(res => res.json()).catch(() => null);

        const localFallbackPromise = getLocalFallbackIcons(url);

        // 等待所有请求完成
        const [proxyResult, localFallbackIcons] = await Promise.all([proxyPromise, localFallbackPromise]);
        if (!faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;

        // 合并图标：网站自带图标优先，本地浏览器可加载候选作为当前设备网络 fallback
        const rawSiteIcons = normalizeFaviconResponse(proxyResult);
        const allIcons = mergeIconsWithLocalFallback(rawSiteIcons, localFallbackIcons);

        if (allIcons.length > 0) {
            state.setAvailableIcons(allIcons);
            renderIconSelection(state.availableIcons);
        } else {
            state.setAvailableIcons([]);
            DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
            delete DOM.iconPreviewAuto.dataset.hasCandidates;
        }
    } catch (e) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        delete DOM.iconPreviewAuto.dataset.hasCandidates;
    }
}

export async function fetchBookmarkMetadata() {
    const url = DOM.bookmarkInputUrl?.value.trim() || '';
    if (!url || !DOM.bookmarkInputName || DOM.bookmarkInputName.value.trim()) return;

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return;
    }
    if (isPrivateOrLocalAddress(parsedUrl.hostname)) return;

    const request = metadataRequestGuard.start(url);
    try {
        const res = await fetch(`${state.API_BASE}/api/metadata`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const result = await res.json().catch(() => null);
        if (!metadataRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
        const title = String(result?.data?.title || '').trim();
        if (res.ok && result?.success && title && !DOM.bookmarkInputName.value.trim()) {
            DOM.bookmarkInputName.value = title;
        }
    } catch {}
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
        const localIcons = await getLocalFallbackIcons(url);
        const allIcons = mergeIconsWithLocalFallback(icons, localIcons);
        if (allIcons.length > 0) {
            if (isPrivateOrLocalAddress(domain)) {
                renderLocalIconSelection(allIcons);
                return;
            }
            state.setAvailableIcons(allIcons);
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
        const localIcons = await getLocalFallbackIcons(url);
        if (request && !faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
        const allIcons = mergeIconsWithLocalFallback(icons, localIcons);
        if (allIcons.length > 0) {
            if (isPrivateOrLocalAddress(new URL(url).hostname)) {
                renderLocalIconSelection(allIcons);
            } else {
                state.setAvailableIcons(allIcons);
                renderIconSelection(state.availableIcons);
            }
        } else {
            state.setAvailableIcons([]);
            DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
            delete DOM.iconPreviewAuto.dataset.hasCandidates;
        }
    } catch (e) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        delete DOM.iconPreviewAuto.dataset.hasCandidates;
    }
}

export async function fetchEngineIcon() {
    const url = DOM.engineInputUrl.value.trim();
    if (!url) {
        showToast('请先输入搜索 URL', 'warning');
        return;
    }

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        DOM.engineIconPreview.innerHTML = '<span style="opacity:0.5">⏳</span>';

        if (isPrivateOrLocalAddress(domain)) {
            const localIcons = await getLocalFallbackIcons(url);
            if (localIcons.length > 0) {
                const iconUrl = localIcons[0];
                DOM.engineIconPreview.innerHTML = `<img src="${escapeHtmlAttribute(iconUrl)}">`;
                DOM.engineIconPreview.dataset.iconUrl = iconUrl;
            } else {
                DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
                delete DOM.engineIconPreview.dataset.iconUrl;
            }
            return;
        }

        const localIcons = await getLocalFallbackIcons(url);
        if (localIcons.length > 0) {
            const iconUrl = localIcons[0];
            const displayIcon = toSafeImageUrl(iconUrl);
            DOM.engineIconPreview.innerHTML = `<img src="${escapeHtmlAttribute(displayIcon)}">`;
            DOM.engineIconPreview.dataset.iconUrl = iconUrl;
            return;
        }

        DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
        delete DOM.engineIconPreview.dataset.iconUrl;
    } catch (e) {
        showToast('URL 格式不正确', 'error');
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
            const displayIcon = iconUrl.startsWith('data:') ? toSafeDataImageUrl(iconUrl) : toPreferredIconImageUrl(iconUrl);
            DOM.engineIconPreview.innerHTML = `<img src="${escapeHtmlAttribute(displayIcon)}">`;
        } else {
            DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
        }
    }
}
