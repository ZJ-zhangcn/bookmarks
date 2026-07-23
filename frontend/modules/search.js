/**
 * 全局搜索模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { escapeHtml, escapeHtmlAttribute, toSafeExternalUrl } from './utils.js';
import { openBookmarkModal, recordBookmarkVisit } from './bookmark.js';
import { bindIconImageFallbacks, iconImageHtml } from './icon-display.js';
import globalSearchHelpers from './global-search-helpers.cjs';

const { buildGlobalSearchModel } = globalSearchHelpers;
const GLOBAL_SEARCH_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');
let globalSearchPreviousFocus = null;

function clearGlobalSearch() {
    if (DOM.globalSearchInput) DOM.globalSearchInput.value = '';
    if (DOM.globalSearchResults) DOM.globalSearchResults.innerHTML = '';
}

function isGlobalSearchOpen() {
    return Boolean(DOM.globalSearchOverlay?.classList.contains('open'));
}

function isConnected(element) {
    return Boolean(element && element.isConnected !== false);
}

function isValidGlobalSearchRestoreTarget(element) {
    return isConnected(element) && !element.closest?.('[aria-hidden="true"]');
}

function hasOpenModalOrOverlay() {
    const cachedOverlays = [
        DOM.engineModal,
        DOM.bookmarkModal,
        DOM.categoryModal,
        DOM.settingsModal,
        DOM.todoModal,
        DOM.categorySheetOverlay,
        DOM.confirmOverlay
    ];

    return cachedOverlays.some(overlay => overlay?.classList.contains('open'))
        || Boolean(document.querySelector('.command-palette-overlay.open'));
}

function getGlobalSearchFocusables() {
    const panel = DOM.globalSearchOverlay?.querySelector('.global-search-panel');
    if (!panel) return [];
    return Array.from(panel.querySelectorAll(GLOBAL_SEARCH_FOCUSABLE_SELECTOR))
        .filter(element => isConnected(element) && element.getAttribute?.('aria-hidden') !== 'true');
}

export function openGlobalSearch() {
    if (!DOM.globalSearchOverlay) return;
    if (isGlobalSearchOpen()) {
        DOM.globalSearchInput?.focus();
        return;
    }

    globalSearchPreviousFocus = isValidGlobalSearchRestoreTarget(document.activeElement)
        ? document.activeElement
        : isValidGlobalSearchRestoreTarget(DOM.globalSearchTrigger)
            ? DOM.globalSearchTrigger
            : null;
    clearGlobalSearch();
    DOM.globalSearchOverlay.classList.add('open');
    DOM.globalSearchOverlay.setAttribute('aria-hidden', 'false');
    DOM.globalSearchTrigger?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    DOM.globalSearchInput?.focus();
}

export function closeGlobalSearch() {
    if (!DOM.globalSearchOverlay) return;
    const wasOpen = isGlobalSearchOpen();
    DOM.globalSearchOverlay.classList.remove('open');
    DOM.globalSearchOverlay.setAttribute('aria-hidden', 'true');
    DOM.globalSearchTrigger?.setAttribute('aria-expanded', 'false');
    clearGlobalSearch();
    document.body.style.overflow = hasOpenModalOrOverlay() ? 'hidden' : '';

    const previousFocus = globalSearchPreviousFocus;
    globalSearchPreviousFocus = null;
    if (!wasOpen && !previousFocus) return;

    const focusTarget = isValidGlobalSearchRestoreTarget(previousFocus)
        ? previousFocus
        : isValidGlobalSearchRestoreTarget(DOM.globalSearchTrigger)
            ? DOM.globalSearchTrigger
            : null;
    focusTarget?.focus?.();
}

export function handleGlobalSearchFocusTrap(event) {
    if (event.key !== 'Tab' || !isGlobalSearchOpen()) return;

    const focusables = getGlobalSearchFocusables();
    if (!focusables.length) return;

    const panel = DOM.globalSearchOverlay?.querySelector('.global-search-panel');
    const first = focusables[0];
    const last = focusables.at(-1);
    const activeElement = document.activeElement;

    if (event.shiftKey) {
        if (activeElement === first || !panel?.contains(activeElement)) {
            event.preventDefault();
            last.focus();
        }
        return;
    }

    if (activeElement === last || !panel?.contains(activeElement)) {
        event.preventDefault();
        first.focus();
    }
}

function getCategoryName(bookmark) {
    return state.categories.find(category => String(category.id) === String(bookmark.category_id))?.name || '未分类';
}

function renderLocalResult(bookmark) {
    const name = escapeHtml(bookmark.name || '未命名书签');
    const subtitle = escapeHtml(bookmark.description || bookmark.url || '');
    const category = escapeHtml(getCategoryName(bookmark));
    const bookmarkId = escapeHtmlAttribute(bookmark.id);
    const cachedIcon = state.iconCache?.get(bookmark.id);
    const iconInfo = cachedIcon?.icon_data
        ? cachedIcon
        : bookmark.icon_data
            ? { icon_data: bookmark.icon_data, icon_type: bookmark.icon_type }
            : null;
    const icon = iconInfo?.icon_data
        ? iconImageHtml({
            iconData: iconInfo.icon_data,
            iconType: iconInfo.icon_type,
            fallbackIcon: bookmark.icon || '🔖',
            alt: bookmark.name,
            loading: ''
        })
        : escapeHtml(bookmark.icon || '🔖');

    return `
        <button type="button" class="global-search-result global-search-result-local" data-bookmark-id="${bookmarkId}">
            <span class="global-search-result-icon" aria-hidden="true">${icon}</span>
            <span class="global-search-result-body">
                <span class="global-search-result-title">${name}</span>
                <span class="global-search-result-subtitle">${subtitle}</span>
            </span>
            <span class="global-search-result-meta">${category}</span>
        </button>
    `;
}

function renderAddBookmarkAction(query) {
    return `
        <button type="button" class="global-search-result global-search-add" data-action="add-bookmark">
            <span class="global-search-result-icon" aria-hidden="true">➕</span>
            <span class="global-search-result-body">
                <span class="global-search-result-title">添加“${escapeHtml(query)}”作为书签</span>
                <span class="global-search-result-subtitle">将搜索词作为名称后继续填写网址</span>
            </span>
        </button>
    `;
}

function renderWebSearchAction(web, query) {
    const engineName = escapeHtml(web.name || '当前搜索引擎');
    const safeQuery = escapeHtml(query);

    return `
        <button type="button" class="global-search-result global-search-web" data-action="web-search">
            <span class="global-search-result-icon" aria-hidden="true">🌐</span>
            <span class="global-search-result-body">
                <span class="global-search-result-title">使用 ${engineName} 搜索网页</span>
                <span class="global-search-result-subtitle">${safeQuery}</span>
            </span>
            <span class="global-search-result-meta">网页</span>
        </button>
    `;
}

export function handleGlobalSearch() {
    if (!DOM.globalSearchInput || !DOM.globalSearchResults) return;

    const query = DOM.globalSearchInput.value.trim();
    const model = buildGlobalSearchModel({
        bookmarks: state.bookmarks,
        query,
        engine: state.currentEngine,
        limit: 12
    });

    if (!query) {
        DOM.globalSearchResults.innerHTML = '';
        return;
    }

    const localResults = model.bookmarks.map(renderLocalResult).join('');
    const addBookmarkAction = model.bookmarks.length === 0 ? renderAddBookmarkAction(query) : '';
    const webSearchAction = model.web ? renderWebSearchAction(model.web, query) : '';
    DOM.globalSearchResults.innerHTML = `${localResults}${webSearchAction}${addBookmarkAction}`;
    bindIconImageFallbacks(DOM.globalSearchResults);

    DOM.globalSearchResults.querySelectorAll('[data-bookmark-id]').forEach(button => {
        button.addEventListener('click', () => {
            const bookmark = state.bookmarks.find(item => String(item.id) === String(button.dataset.bookmarkId));
            if (!bookmark) return;
            recordBookmarkVisit(bookmark.id);
            window.open(toSafeExternalUrl(bookmark.url), '_blank', 'noopener');
            closeGlobalSearch();
        });
    });

    DOM.globalSearchResults.querySelector('[data-action="add-bookmark"]')?.addEventListener('click', () => {
        closeGlobalSearch();
        openBookmarkModal();
        if (DOM.bookmarkInputName) DOM.bookmarkInputName.value = query;
    });

    DOM.globalSearchResults.querySelector('[data-action="web-search"]')?.addEventListener('click', () => {
        window.open(toSafeExternalUrl(model.web.url), '_blank', 'noopener');
        closeGlobalSearch();
    });
}
