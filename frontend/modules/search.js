/**
 * 书签搜索浮层模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { highlightText, escapeHtml, escapeHtmlAttribute, toSafeExternalUrl, bindImageFallbacks } from './utils.js';
import { iconImageHtml } from './icon-display.js';
import searchHelpers from './search-helpers.cjs';
import { openBookmarkModal } from './bookmark.js';
import { hasForegroundOverlayAbove, syncDocumentScrollLock } from './overlay-state.js';

const { buildSearchEmptyState } = searchHelpers;
const BOOKMARK_SEARCH_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');
let bookmarkSearchPreviousFocus = null;

function isBookmarkSearchOpen() {
    return Boolean(DOM.bookmarkSearchOverlay?.classList?.contains?.('open'));
}

function isConnected(element) {
    return Boolean(element && element.isConnected !== false);
}

function isValidBookmarkSearchRestoreTarget(element) {
    return isConnected(element)
        && element !== document.body
        && !element.closest?.('[aria-hidden="true"]');
}

function clearBookmarkSearch() {
    if (DOM.bookmarkSearchInput) DOM.bookmarkSearchInput.value = '';
    if (DOM.bookmarkSearchResults) DOM.bookmarkSearchResults.innerHTML = '';
}

function getBookmarkSearchFocusables() {
    const panel = DOM.bookmarkSearchOverlay?.querySelector?.('.bookmark-search-panel');
    if (!panel) return [];
    return Array.from(panel.querySelectorAll?.(BOOKMARK_SEARCH_FOCUSABLE_SELECTOR) || [])
        .filter(element => isConnected(element)
            && !element.disabled
            && element.getAttribute?.('aria-hidden') !== 'true');
}

function getCategoryName(bookmark) {
    return state.categories.find(category => String(category.id) === String(bookmark.category_id))?.name || '未分类';
}

export function openBookmarkSearch() {
    if (!DOM.bookmarkSearchOverlay || hasForegroundOverlayAbove(DOM.bookmarkSearchOverlay)) return;
    if (isBookmarkSearchOpen()) {
        syncDocumentScrollLock();
        DOM.bookmarkSearchInput?.focus?.();
        return;
    }

    bookmarkSearchPreviousFocus = isValidBookmarkSearchRestoreTarget(document.activeElement)
        ? document.activeElement
        : isValidBookmarkSearchRestoreTarget(DOM.bookmarkSearchBtn)
            ? DOM.bookmarkSearchBtn
            : null;
    clearBookmarkSearch();
    DOM.bookmarkSearchOverlay.classList.add('open');
    DOM.bookmarkSearchOverlay.setAttribute?.('aria-hidden', 'false');
    syncDocumentScrollLock();
    DOM.bookmarkSearchInput?.focus?.();
}

export function closeBookmarkSearch() {
    if (!DOM.bookmarkSearchOverlay) return;
    const wasOpen = isBookmarkSearchOpen();
    DOM.bookmarkSearchOverlay.classList.remove('open');
    DOM.bookmarkSearchOverlay.setAttribute?.('aria-hidden', 'true');
    clearBookmarkSearch();
    syncDocumentScrollLock();

    const previousFocus = bookmarkSearchPreviousFocus;
    bookmarkSearchPreviousFocus = null;
    if (!wasOpen && !previousFocus) return;

    const focusTarget = isValidBookmarkSearchRestoreTarget(previousFocus)
        ? previousFocus
        : isValidBookmarkSearchRestoreTarget(DOM.bookmarkSearchBtn)
            ? DOM.bookmarkSearchBtn
            : null;
    focusTarget?.focus?.();
}

export function handleBookmarkSearchFocusTrap(event) {
    if (event.key !== 'Tab' || !isBookmarkSearchOpen()
        || hasForegroundOverlayAbove(DOM.bookmarkSearchOverlay)) return;
    const focusables = getBookmarkSearchFocusables();
    if (!focusables.length) return;

    const panel = DOM.bookmarkSearchOverlay?.querySelector?.('.bookmark-search-panel');
    const first = focusables[0];
    const last = focusables.at(-1);
    const activeElement = document.activeElement;
    if (event.shiftKey) {
        if (activeElement === first || !panel?.contains?.(activeElement)) {
            event.preventDefault();
            last.focus();
        }
        return;
    }
    if (activeElement === last || !panel?.contains?.(activeElement)) {
        event.preventDefault();
        first.focus();
    }
}

export function handleBookmarkSearch() {
    if (!DOM.bookmarkSearchInput || !DOM.bookmarkSearchResults) return;
    const searchTerm = DOM.bookmarkSearchInput.value.toLowerCase().trim();

    if (!searchTerm) {
        DOM.bookmarkSearchResults.innerHTML = '';
        return;
    }

    const results = state.bookmarks.filter(bookmark => {
        const tagsText = Array.isArray(bookmark.tags) ? bookmark.tags.join(',') : String(bookmark.tags || '');
        return String(bookmark.name || '').toLowerCase().includes(searchTerm)
            || String(bookmark.description || '').toLowerCase().includes(searchTerm)
            || String(bookmark.url || '').toLowerCase().includes(searchTerm)
            || tagsText.toLowerCase().includes(searchTerm);
    });

    if (results.length === 0) {
        DOM.bookmarkSearchResults.innerHTML = buildSearchEmptyState(searchTerm);
        DOM.bookmarkSearchResults.querySelector?.('[data-action="add-bookmark"]')?.addEventListener('click', () => {
            closeBookmarkSearch();
            openBookmarkModal();
            if (DOM.bookmarkInputName && !DOM.bookmarkInputName.value) DOM.bookmarkInputName.value = searchTerm;
        });
        DOM.bookmarkSearchResults.querySelector?.('[data-action="web-search"]')?.addEventListener('click', () => {
            const engineUrl = state.currentEngine?.url || 'https://www.google.com/search?q=';
            const searchUrl = toSafeExternalUrl(engineUrl + encodeURIComponent(searchTerm));
            if (searchUrl !== '#') window.open(searchUrl, '_blank', 'noopener,noreferrer');
        });
        return;
    }

    DOM.bookmarkSearchResults.innerHTML = results.slice(0, 20).map(item => {
        const tagsArray = Array.isArray(item.tags)
            ? item.tags.map(tag => String(tag || '').trim()).filter(Boolean)
            : String(item.tags || '').split(/[,\n，;；|/]+/g).map(tag => tag.trim()).filter(Boolean);
        const matchedTags = tagsArray.filter(tag => tag.toLowerCase().includes(searchTerm));
        const reasons = [];
        if (String(item.name || '').toLowerCase().includes(searchTerm)) reasons.push('名称');
        if (String(item.description || '').toLowerCase().includes(searchTerm)) reasons.push('描述');
        if (String(item.url || '').toLowerCase().includes(searchTerm)) reasons.push('网址');
        if (matchedTags.length) reasons.push('标签');

        const cachedIcon = state.iconCache?.get(item.id);
        const iconInfo = cachedIcon?.icon_data
            ? cachedIcon
            : item.icon_data
                ? { icon_data: item.icon_data, icon_type: item.icon_type }
                : null;
        const iconHtml = iconInfo?.icon_data
            ? iconImageHtml({
                iconData: iconInfo.icon_data,
                iconType: iconInfo.icon_type,
                fallbackIcon: item.icon || '🌐',
                alt: item.name,
                loading: ''
            })
            : escapeHtml(item.icon || '🌐');
        const tagsHtml = matchedTags.length
            ? `<div class="search-result-tags">标签：${matchedTags.slice(0, 6).map(tag => `<span class="tag-chip">${highlightText(tag, searchTerm)}</span>`).join('')}</div>`
            : '';
        const reasonHtml = reasons.length ? `<div class="search-result-reason">匹配：${reasons.join(' / ')}</div>` : '';

        return `
            <a href="${toSafeExternalUrl(item.url)}" class="search-result-item" target="_blank" rel="noopener noreferrer">
                <div class="search-result-icon">${iconHtml}</div>
                <div class="search-result-info">
                    <div class="search-result-name" title="${escapeHtmlAttribute(item.name || '')}">${highlightText(item.name, searchTerm)}</div>
                    <div class="search-result-desc" title="${escapeHtmlAttribute(item.description || item.url || '')}">${highlightText(item.description || item.url, searchTerm)}</div>
                    ${tagsHtml}
                    ${reasonHtml}
                </div>
                <span class="search-result-category">${escapeHtml(getCategoryName(item))}</span>
            </a>
        `;
    }).join('');
    bindImageFallbacks(DOM.bookmarkSearchResults);
    DOM.bookmarkSearchResults.querySelectorAll?.('.search-result-item').forEach(item => {
        item.addEventListener('click', closeBookmarkSearch);
    });
}
