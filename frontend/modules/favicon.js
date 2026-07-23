/**
 * Favicon 获取模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { isPrivateOrLocalAddress, toSafeImageUrl, toPreferredIconImageUrl, toSafeDataImageUrl, bindImageFallbacks, escapeHtmlAttribute } from './utils.js';
import { showToast } from './ux.js';
import { renderIconSelection, renderLocalIconSelection, clearIconCandidates } from './icon-picker.js';
import { discoverIcons } from './icon-client.js';
import {
    createFaviconRequestGuard,
    buildLocalFaviconCandidates,
    shouldProbeBrowserFallbacks,
    mergeIconsWithLocalFallback
} from './favicon-helpers.cjs';

const faviconRequestGuard = createFaviconRequestGuard();
const metadataRequestGuard = createFaviconRequestGuard();
const BOOKMARK_ENRICHMENT_DELAY_MS = 350;
let bookmarkEnrichmentTimer = null;
let queuedBookmarkUrl = '';
let observedBookmarkUrl = '';
let enrichedBookmarkUrl = '';

function isBookmarkModalOpen() {
    return Boolean(DOM.bookmarkModal?.classList?.contains?.('open'));
}

function getValidBookmarkHttpUrl() {
    const url = DOM.bookmarkInputUrl?.value.trim() || '';
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '';
    } catch {
        return '';
    }
}

function clearBookmarkEnrichmentTimer() {
    if (bookmarkEnrichmentTimer) {
        clearTimeout(bookmarkEnrichmentTimer);
        bookmarkEnrichmentTimer = null;
    }
}

function observeBookmarkUrl(url) {
    if (url === observedBookmarkUrl) return;
    observedBookmarkUrl = url;
    enrichedBookmarkUrl = '';
    faviconRequestGuard.invalidate();
    metadataRequestGuard.invalidate();
}

function runBookmarkUrlEnrichment(url) {
    clearBookmarkEnrichmentTimer();
    queuedBookmarkUrl = '';
    if (!isBookmarkModalOpen() || !url || url !== getValidBookmarkHttpUrl() || url === enrichedBookmarkUrl) return;
    enrichedBookmarkUrl = url;
    fetchFavicon();
    fetchBookmarkMetadata();
}

export function handleBookmarkUrlInput() {
    const url = getValidBookmarkHttpUrl();
    const rawUrl = DOM.bookmarkInputUrl?.value.trim() || '';
    observeBookmarkUrl(rawUrl);
    if (!url) {
        clearBookmarkEnrichmentTimer();
        queuedBookmarkUrl = '';
        return;
    }
    if (url === enrichedBookmarkUrl || url === queuedBookmarkUrl) return;

    clearBookmarkEnrichmentTimer();
    queuedBookmarkUrl = url;
    bookmarkEnrichmentTimer = setTimeout(() => {
        bookmarkEnrichmentTimer = null;
        runBookmarkUrlEnrichment(url);
    }, BOOKMARK_ENRICHMENT_DELAY_MS);
}

export function flushBookmarkUrlEnrichment() {
    const url = getValidBookmarkHttpUrl();
    const rawUrl = DOM.bookmarkInputUrl?.value.trim() || '';
    observeBookmarkUrl(rawUrl);
    clearBookmarkEnrichmentTimer();
    queuedBookmarkUrl = '';
    runBookmarkUrlEnrichment(url);
}

export function cancelBookmarkUrlEnrichment() {
    clearBookmarkEnrichmentTimer();
    queuedBookmarkUrl = '';
    observedBookmarkUrl = '';
    enrichedBookmarkUrl = '';
    faviconRequestGuard.invalidate();
    metadataRequestGuard.invalidate();
}

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

function buildBrowserFallbackCandidates(url, _domain) {
    return buildLocalFaviconCandidates(url);
}

async function getLocalFallbackIcons(url, { timeout = 3000 } = {}) {
    let domain = '';
    try { domain = new URL(url).hostname; } catch { return []; }
    if (!shouldProbeBrowserFallbacks(url)) return [];
    return findLoadableIcons(buildBrowserFallbackCandidates(url, domain), timeout);
}

function renderBookmarkIconCandidates(icons, { local = false } = {}) {
    if (icons.length > 0) {
        if (local) {
            renderLocalIconSelection(icons);
            return;
        }
        state.setAvailableIcons(icons);
        renderIconSelection(state.availableIcons);
        return;
    }
    state.setAvailableIcons([]);
    clearIconCandidates(DOM.iconPreviewAuto, '🌐');
}

async function discoverAndMergeIcons(url) {
    const [discovery, localFallbackIcons] = await Promise.all([
        discoverIcons(url).catch(() => ({ icons: [] })),
        getLocalFallbackIcons(url)
    ]);
    return mergeIconsWithLocalFallback(discovery.icons || [], localFallbackIcons);
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

        const allIcons = await discoverAndMergeIcons(url);
        if (!faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
        renderBookmarkIconCandidates(allIcons);
    } catch (e) {
        if (!faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
        clearIconCandidates(DOM.iconPreviewAuto, '🌐');
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
        const allIcons = await discoverAndMergeIcons(url);
        renderBookmarkIconCandidates(allIcons, { local: isPrivateOrLocalAddress(domain) });
    } catch (e) { }
}

export async function fetchProxyFavicon(url, request = null) {
    try {
        const allIcons = await discoverAndMergeIcons(url);
        if (request && !faviconRequestGuard.isCurrent(request, DOM.bookmarkInputUrl.value.trim())) return;
        const local = isPrivateOrLocalAddress(new URL(url).hostname);
        renderBookmarkIconCandidates(allIcons, { local });
    } catch (e) {
        clearIconCandidates(DOM.iconPreviewAuto, '🌐');
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

        const discovery = await discoverIcons(url).catch(() => ({ ok: false, icons: [] }));
        if (discovery.ok && discovery.icons.length > 0) {
            const iconUrl = discovery.icons[0];
            DOM.engineIconPreview.innerHTML = `<img src="${escapeHtmlAttribute(toSafeImageUrl(iconUrl))}">`;
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
