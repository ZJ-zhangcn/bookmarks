/**
 * 书签搜索浮层模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { highlightText, escapeHtml, escapeHtmlAttribute, toSafeDataImageUrl, toSafeExternalUrl, toPreferredIconImageUrl, bindImageFallbacks } from './utils.js';
import searchHelpers from './search-helpers.cjs';
import { openBookmarkModal } from './bookmark.js';

const { buildSearchEmptyState } = searchHelpers;

export function openBookmarkSearch() {
    DOM.bookmarkSearchOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.bookmarkSearchInput.value = '';
    DOM.bookmarkSearchResults.innerHTML = '';
    setTimeout(() => DOM.bookmarkSearchInput.focus(), 100);
}

export function closeBookmarkSearch() {
    DOM.bookmarkSearchOverlay.classList.remove('open');
    document.body.style.overflow = '';
    DOM.bookmarkSearchInput.value = '';
    DOM.bookmarkSearchResults.innerHTML = '';
}

export function handleBookmarkSearch() {
    const searchTerm = DOM.bookmarkSearchInput.value.toLowerCase().trim();

    if (!searchTerm) {
        DOM.bookmarkSearchResults.innerHTML = '';
        return;
    }

    const results = state.bookmarks.filter(b => {
        if (b.item_type === 'component') return false;
        const tagsText = Array.isArray(b.tags) ? b.tags.join(',') : String(b.tags || '');
        return b.name.toLowerCase().includes(searchTerm) ||
            (b.description && b.description.toLowerCase().includes(searchTerm)) ||
            b.url.toLowerCase().includes(searchTerm) ||
            (tagsText && tagsText.toLowerCase().includes(searchTerm));
    });

    if (results.length === 0) {
        DOM.bookmarkSearchResults.innerHTML = buildSearchEmptyState(searchTerm);
        DOM.bookmarkSearchResults.querySelector('[data-action="add-bookmark"]')?.addEventListener('click', () => {
            closeBookmarkSearch();
            openBookmarkModal();
            if (DOM.bookmarkInputName && !DOM.bookmarkInputName.value) DOM.bookmarkInputName.value = searchTerm;
        });
        DOM.bookmarkSearchResults.querySelector('[data-action="web-search"]')?.addEventListener('click', () => {
            const engineUrl = state.currentEngine?.url || 'https://www.google.com/search?q=';
            window.open(engineUrl + encodeURIComponent(searchTerm), '_blank');
        });
        return;
    }

    DOM.bookmarkSearchResults.innerHTML = results.slice(0, 20).map(item => {
        const category = state.categories.find(c => c.id === item.category_id);
        const categoryName = category ? category.name : '未分类';
        const tagsArray = Array.isArray(item.tags)
            ? item.tags.map(t => String(t || '').trim()).filter(Boolean)
            : String(item.tags || '').split(/[,\n，;；|/]+/g).map(t => t.trim()).filter(Boolean);
        const matchedTags = tagsArray.filter(t => t.toLowerCase().includes(searchTerm));
        const matchName = String(item.name || '').toLowerCase().includes(searchTerm);
        const matchDesc = String(item.description || '').toLowerCase().includes(searchTerm);
        const matchUrl = String(item.url || '').toLowerCase().includes(searchTerm);
        const matchTags = matchedTags.length > 0;
        const reasons = [];
        if (matchName) reasons.push('名称');
        if (matchDesc) reasons.push('描述');
        if (matchUrl) reasons.push('网址');
        if (matchTags) reasons.push('标签');
        const reasonText = reasons.length ? `匹配：${reasons.join(' / ')}` : '';

        let iconHtml;
        const cachedIcon = state.iconCache.get(item.id);
        if (cachedIcon && cachedIcon.icon_data) {
            const iconUrl = cachedIcon.icon_type === 'base64'
                ? toSafeDataImageUrl(cachedIcon.icon_data)
                : toPreferredIconImageUrl(cachedIcon.icon_data);
            iconHtml = iconUrl
                ? `<img src="${escapeHtmlAttribute(iconUrl)}" alt="${escapeHtmlAttribute(item.name)}" data-fallback-icon="${escapeHtmlAttribute(item.icon || '🌐')}">`
                : escapeHtml(item.icon || '🌐');
        } else if (item.icon_type === 'url' && item.icon_data) {
            const iconUrl = toPreferredIconImageUrl(item.icon_data);
            iconHtml = iconUrl
                ? `<img src="${escapeHtmlAttribute(iconUrl)}" alt="${escapeHtmlAttribute(item.name)}" data-fallback-icon="${escapeHtmlAttribute(item.icon || '🌐')}">`
                : escapeHtml(item.icon || '🌐');
        } else if (item.icon_type === 'base64' && item.icon_data) {
            iconHtml = `<img src="${toSafeDataImageUrl(item.icon_data)}" alt="${escapeHtmlAttribute(item.name)}">`;
        } else {
            iconHtml = escapeHtml(item.icon || '🌐');
        }

        const descHtml = item.description
            ? highlightText(item.description, searchTerm)
            : highlightText(item.url, searchTerm);
        const descTitle = escapeHtmlAttribute(item.description || item.url || '');
        const nameTitle = escapeHtmlAttribute(item.name || '');
        const tagsToShow = matchTags ? matchedTags : [];
        const tagsHtml = tagsToShow.length
            ? `<div class="search-result-tags">标签：${tagsToShow.slice(0, 6).map(t => `<span class="tag-chip">${highlightText(t, searchTerm)}</span>`).join('')}</div>`
            : '';
        const reasonHtml = reasonText ? `<div class="search-result-reason">${reasonText}</div>` : '';

        return `
            <a href="${toSafeExternalUrl(item.url)}" class="search-result-item" target="_blank" rel="noopener">
                <div class="search-result-icon">${iconHtml}</div>
                <div class="search-result-info">
                    <div class="search-result-name" title="${nameTitle}">${highlightText(item.name, searchTerm)}</div>
                    <div class="search-result-desc" title="${descTitle}">${descHtml}</div>
                    ${tagsHtml}
                    ${reasonHtml}
                </div>
                <span class="search-result-category">${escapeHtml(categoryName)}</span>
            </a>
        `;
    }).join('');
    bindImageFallbacks(DOM.bookmarkSearchResults);
    DOM.bookmarkSearchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', closeBookmarkSearch);
    });
}

window.closeBookmarkSearch = closeBookmarkSearch;
