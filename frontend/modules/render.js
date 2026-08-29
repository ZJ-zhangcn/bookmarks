/**
 * 渲染模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

import { highlightText, toSafeImageUrl, escapeHtml, escapeHtmlAttribute, toSafeExternalUrl, toSafeDataImageUrl, bindImageFallbacks } from './utils.js';
import { iconImageHtml } from './icon-display.js';
export { renderIconSelection } from './icon-picker.js';
import { observeBookmarkIcons } from './api.js';
import { bindQuickInputEvent, bindTodoDragEvents } from './todo.js';
import { buildCategorySheetItems, buildCategoryFabLabel } from './ux.js';
import { createVirtualScroll } from './virtual-scroll.js';

// 虚拟滚动实例映射（按分类ID）
const virtualScrollInstances = new Map();
const VIRTUAL_SCROLL_THRESHOLD = 50; // 书签数量超过此值时启用虚拟滚动

export function renderAll() {
    renderCategoryNav();
    renderBookmarks();
    renderTodos();
    renderEngineDropdown();
    updateEngineDisplay();
}

export function renderCategoryNav() {
    const allBtn = DOM.categoryNav.querySelector('[data-category="all"]');
    DOM.categoryNav.innerHTML = '';
    DOM.categoryNav.appendChild(allBtn);
    allBtn.classList.toggle('active', state.currentCategory === 'all');

    state.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn' + (state.currentCategory === cat.id ? ' active' : '');
        btn.dataset.category = cat.id;
        btn.innerHTML = `<span>${escapeHtml(cat.name)}</span>`;
        DOM.categoryNav.appendChild(btn);
    });
    updateCategoryQuickLabel();
}

export function updateCategoryQuickLabel() {
    if (!DOM.categoryFabLabel) return;
    const items = buildCategorySheetItems({ categories: state.categories, bookmarks: state.bookmarks });
    DOM.categoryFabLabel.textContent = buildCategoryFabLabel(items, state.currentCategory);
}

export function renderBookmarks() {
    const searchTerm = state.currentSearch.toLowerCase().trim();
    const isSearchMode = !!searchTerm;
    let hasResults = false;

    const bookmarksByCategory = new Map();
    state.bookmarks.forEach(bookmark => {
        const categoryId = bookmark.category_id;
        if (!bookmarksByCategory.has(categoryId)) bookmarksByCategory.set(categoryId, []);
        bookmarksByCategory.get(categoryId).push(bookmark);
    });

    state.categories.forEach((category, idx) => {
        const isCurrentCategoryActive = state.currentCategory === 'all' || state.currentCategory === category.id;

        const catBookmarks = bookmarksByCategory.get(category.id) || [];
        const filteredItems = catBookmarks.filter(item => {
            if (!searchTerm) return true;
            const searchText = item.searchText || [item.name, item.description, item.url, item.tags, item.category_name]
                .map(value => Array.isArray(value) ? value.join(' ') : String(value || ''))
                .join(' ')
                .toLowerCase();
            return searchText.includes(searchTerm);
        });

        const shouldShow = isCurrentCategoryActive && (filteredItems.length > 0 || state.currentCategory !== 'all');

        let section = DOM.bookmarksContainer.querySelector(`.category-section[data-category-id="${CSS.escape(String(category.id))}"]`);

        if (!shouldShow) {
            if (section) {
                section.style.display = 'none';
                // 销毁虚拟滚动实例
                const vsInstance = virtualScrollInstances.get(category.id);
                if (vsInstance) {
                    vsInstance.unmount();
                    virtualScrollInstances.delete(category.id);
                }
            }
            return;
        }

        hasResults = true;

        const isCollapsed = state.collapsedCategories.has(category.id);

        if (!section) {
            section = createCategorySection(category, isCollapsed, idx);
            DOM.bookmarksContainer.appendChild(section);
        } else {
            section.style.display = 'block';
            if (isCollapsed) section.classList.add('collapsed');
            else section.classList.remove('collapsed');
            const collapseBtn = section.querySelector('.collapse-btn');
            if (collapseBtn) collapseBtn.title = isCollapsed ? '展开' : '折叠';

            const grid = section.querySelector('.bookmarks-grid');
            if (grid) grid.style.display = isCollapsed ? 'none' : '';
        }

        const grid = section.querySelector('.bookmarks-grid');
        const countSpan = section.querySelector('.category-count');

        const currentRenderMode = grid.dataset.renderMode || 'none';
        const targetRenderMode = isSearchMode ? 'search' : 'full';
        const currentDataVersion = grid.dataset.version || '-1';

        const needsUpdate =
            isSearchMode ||
            currentRenderMode === 'search' ||
            currentDataVersion !== String(state.dataVersion) ||
            grid.childElementCount === 0;

        // 决定是否使用虚拟滚动
        const useVirtualScroll = filteredItems.length >= VIRTUAL_SCROLL_THRESHOLD && !isSearchMode && !state.sortingCategory;

        if (needsUpdate) {
            if (useVirtualScroll) {
                // 使用虚拟滚动
                let vsInstance = virtualScrollInstances.get(category.id);

                if (!vsInstance) {
                    // 创建虚拟滚动实例
                    grid.innerHTML = ''; // 清空普通渲染
                    grid.style.minHeight = '400px'; // 设置最小高度

                    vsInstance = createVirtualScroll({
                        container: grid,
                        itemHeight: 140, // 卡片预估高度
                        viewportHeight: 'min(72vh, 720px)',
                        bufferSize: 2,
                        renderItem: (item, index) => {
                            const div = document.createElement('div');
                            div.innerHTML = createBookmarkCard(item, searchTerm, index);
                            return div.firstElementChild;
                        }
                    });

                    vsInstance.mount(grid);
                    virtualScrollInstances.set(category.id, vsInstance);

                    // 恢复滚动位置
                    const savedScrollTop = state.scrollPositions.get(category.id);
                    if (savedScrollTop) {
                        requestAnimationFrame(() => {
                            vsInstance.restoreScrollPosition(savedScrollTop);
                        });
                    }
                } else {
                    // 保存当前滚动位置
                    const scrollPos = vsInstance.getScrollPosition();
                    state.scrollPositions.set(category.id, scrollPos.scrollTop);
                }

                vsInstance.setItems(filteredItems);
                grid.dataset.renderMode = 'virtual';
            } else {
                // 使用普通渲染
                const vsInstance = virtualScrollInstances.get(category.id);
                if (vsInstance) {
                    // 保存滚动位置
                    const scrollPos = vsInstance.getScrollPosition();
                    state.scrollPositions.set(category.id, scrollPos.scrollTop);

                    vsInstance.unmount();
                    virtualScrollInstances.delete(category.id);
                }

                grid.style.minHeight = '';
                grid.innerHTML = filteredItems.map((item, i) => createBookmarkCard(item, searchTerm, i)).join('');
                bindImageFallbacks(grid);
                grid.dataset.renderMode = targetRenderMode;

                // 恢复滚动位置（普通渲染）
                const savedScrollTop = state.scrollPositions.get(category.id);
                if (savedScrollTop && section.scrollTop === 0) {
                    requestAnimationFrame(() => {
                        section.scrollTop = savedScrollTop;
                    });
                }
            }

            grid.dataset.version = state.dataVersion;
            if (countSpan) countSpan.textContent = `${filteredItems.length} 个`;
        }
    });

    DOM.emptyState.style.display = hasResults ? 'none' : 'block';
    DOM.bookmarksContainer.style.display = hasResults ? 'flex' : 'none';

    requestAnimationFrame(() => {
        setTimeout(observeBookmarkIcons, 50);
    });
}

/**
 * 清理所有虚拟滚动实例（用于页面卸载）
 */
export function cleanupVirtualScrolls() {
    virtualScrollInstances.forEach(vs => vs.unmount());
    virtualScrollInstances.clear();
}

function createCategorySection(category, isCollapsed, idx) {
    const section = document.createElement('section');
    section.className = 'category-section' + (isCollapsed ? ' collapsed' : '');
    section.dataset.categoryId = category.id;
    section.style.animationDelay = `${idx * 0.1}s`;

    section.innerHTML = `
        <header class="category-header">
            <button class="collapse-btn" data-category="${escapeHtmlAttribute(category.id)}" title="${isCollapsed ? '展开' : '折叠'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m6 9 6 6 6-6"/>
                </svg>
            </button>
            <h2 class="category-title">${escapeHtml(category.name)}</h2>
            <div class="category-header-actions">
                <button class="header-action-btn add-btn" data-category="${escapeHtmlAttribute(category.id)}" title="添加书签">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button class="header-action-btn sort-btn" data-category="${escapeHtmlAttribute(category.id)}" title="排序书签">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h12M3 18h6"/></svg>
                </button>
            </div>
            <span class="category-count">0 个</span>
        </header>
        <div class="bookmarks-grid" data-category="${escapeHtmlAttribute(category.id)}" ${isCollapsed ? 'style="display:none;"' : ''}>
        </div>
    `;
    return section;
}

function renderBookmarkIconImage(src, name, fallbackIcon = '🌐') {
    return iconImageHtml({
        iconData: src,
        iconType: 'url',
        fallbackIcon,
        alt: name,
        loading: 'lazy'
    });
}

export function createBookmarkCard(item, searchTerm) {
    const name = highlightText(item.name, searchTerm);
    const desc = highlightText(item.description || '', searchTerm);
    const tagsArray = Array.isArray(item.tags)
        ? item.tags.map(t => String(t || '').trim()).filter(Boolean)
        : String(item.tags || '').split(/[,\n，;；|/]+/g).map(t => t.trim()).filter(Boolean);
    const matchedTags = searchTerm
        ? tagsArray.filter(t => t.toLowerCase().includes(searchTerm))
        : [];
    const displayTags = searchTerm ? matchedTags : tagsArray.slice(0, 4);
    const tagsHtml = displayTags.length > 0
        ? `<div class="bookmark-tags" title="点击标签筛选">${displayTags.map(t => `<button type="button" class="tag-chip" data-tag="${escapeHtmlAttribute(t)}">${highlightText(t, searchTerm)}</button>`).join('')}</div>`
        : '';

    let iconHtml;
    const cachedIcon = state.iconCache.get(item.id);
    if (cachedIcon && cachedIcon.icon_data) {
        if (cachedIcon.icon_type === 'base64') {
            iconHtml = iconImageHtml({
                iconData: cachedIcon.icon_data,
                iconType: 'base64',
                fallbackIcon: item.icon || '🌐',
                alt: item.name,
                loading: 'lazy'
            });
        } else {
            iconHtml = renderBookmarkIconImage(cachedIcon.icon_data, item.name, item.icon || '🌐');
        }
    } else if (item.icon_type === 'url' && item.icon_data) {
        iconHtml = renderBookmarkIconImage(item.icon_data, item.name, item.icon || '🌐');
    } else if (item.icon_type === 'base64' && item.icon_data) {
        iconHtml = iconImageHtml({
            iconData: item.icon_data,
            iconType: 'base64',
            fallbackIcon: item.icon || '🌐',
            alt: item.name,
            loading: 'lazy'
        });
    } else if (item.icon_type === 'base64') {
        iconHtml = `<span class="icon-placeholder">${escapeHtml(item.icon || '🌐')}</span>`;
    } else {
        iconHtml = `<span>${escapeHtml(item.icon || '🌐')}</span>`;
    }

    const rawDesc = item.description || '';
    const visitCount = Number(item.visit_count) || 0;
    const lastVisited = item.last_visited_at ? new Date(item.last_visited_at) : null;
    const lastVisitedText = lastVisited && !Number.isNaN(lastVisited.getTime())
        ? `最后访问 ${lastVisited.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}`
        : '尚未访问';
    const statsHtml = visitCount > 0
        ? `<div class="bookmark-stats" title="${escapeHtmlAttribute(lastVisitedText)}">👁 ${visitCount} · ${escapeHtml(lastVisitedText)}</div>`
        : '';
    return `
        <a href="${toSafeExternalUrl(item.url)}" class="bookmark-card" target="_blank" rel="noopener" data-id="${escapeHtmlAttribute(item.id)}">
            ${state.batchMode ? `<input class="batch-select" type="checkbox" data-id="${escapeHtmlAttribute(item.id)}" aria-label="选择 ${escapeHtmlAttribute(item.name)}" ${state.batchSelectedIds.has(item.id) ? 'checked' : ''}>` : ''}
            <div class="bookmark-actions">
                <button class="bookmark-action-btn edit" data-id="${escapeHtmlAttribute(item.id)}" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="bookmark-action-btn delete" data-id="${escapeHtmlAttribute(item.id)}" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
            <div class="bookmark-icon">${iconHtml}</div>
            <div class="bookmark-info">
                <div class="bookmark-name">${name}</div>
                <div class="bookmark-desc" title="${escapeHtmlAttribute(rawDesc)}">${desc}</div>
                ${tagsHtml}
                ${statsHtml}
            </div>
        </a>
    `;
}

export function renderEngineDropdown() {
    const divider = DOM.engineDropdown.querySelector('.engine-dropdown-divider');
    DOM.engineDropdown.querySelectorAll('.engine-option').forEach(el => el.remove());

    state.engines.forEach(engine => {
        const opt = document.createElement('div');
        opt.className = 'engine-option' + (state.currentEngine.name === engine.name ? ' active' : '');
        opt.dataset.engine = engine.id || '';
        opt.dataset.icon = engine.icon || '';
        opt.dataset.url = toSafeExternalUrl(engine.url);

        const iconHtml = engine.icon && engine.icon.startsWith('http')
            ? `<img src="${toSafeImageUrl(engine.icon)}" style="width:18px;height:18px;">`
            : escapeHtml(engine.icon || '');
        opt.innerHTML = `<span class="engine-option-icon">${iconHtml}</span><span>${escapeHtml(engine.name)}</span>`;
        divider.parentNode.insertBefore(opt, divider);
    });
}

export function updateEngineDisplay() {
    const icon = state.currentEngine.icon;
    if (icon && icon.startsWith('http')) {
        DOM.engineIcon.innerHTML = `<img src="${toSafeImageUrl(icon)}" style="width:18px;height:18px;vertical-align:middle;">`;
    } else if (icon && icon.startsWith('data:')) {
        DOM.engineIcon.innerHTML = `<img src="${toSafeDataImageUrl(icon)}" style="width:18px;height:18px;vertical-align:middle;">`;
    } else {
        DOM.engineIcon.textContent = icon || '🌐';
    }
    DOM.engineName.textContent = state.currentEngine.name;
}

export function renderTodos() {
    if (!DOM.todosContainer) return;

    const allTodos = state.todos || [];

    // 分离未完成和已完成
    const pendingTodos = allTodos.filter(t => !t.is_done);
    const completedTodos = allTodos.filter(t => t.is_done);

    // 按 sort_order 排序
    pendingTodos.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    let html = '';

    // 快速输入框
    html += `
        <div class="todo-header">
            <div class="todo-quick-add">
                <input type="text" id="todoQuickInput" class="todo-quick-input"
                       placeholder="添加新待办，按回车确认..." autocomplete="off">
            </div>
        </div>
    `;

    // 待办列表
    if (pendingTodos.length > 0) {
        html += '<div class="todos-list" data-status="pending">';
        html += pendingTodos.map(t => createTodoCard(t, false)).join('');
        html += '</div>';
    } else {
        html += '<div class="todos-empty">暂无待办事项</div>';
    }

    // 已完成区域（可折叠）
    if (completedTodos.length > 0) {
        html += `
            <div class="todos-completed-section">
                <div class="todos-completed-header" id="todosCompletedHeader">
                    <span class="todos-completed-toggle">
                        <svg class="toggle-icon ${state.todoShowCompleted ? 'expanded' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="m6 9 6 6 6-6"/>
                        </svg>
                        已完成 (${completedTodos.length})
                    </span>
                    <button class="todos-clear-btn" id="todosClearCompleted" title="清除所有已完成">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        清除已完成
                    </button>
                </div>
                <div class="todos-completed-list ${state.todoShowCompleted ? '' : 'collapsed'}" id="todosCompletedList">
                    ${completedTodos.map(t => createTodoCard(t, true)).join('')}
                </div>
            </div>
        `;
    }

    DOM.todosContainer.innerHTML = html;
    
    // 渲染完成后绑定事件
    bindQuickInputEvent();
    bindTodoDragEvents();
}

export function createTodoCard(todo, isCompleted = false) {
    const cardClass = isCompleted ? 'todo-card completed' : 'todo-card';
    const checkClass = isCompleted ? 'todo-check checked' : 'todo-check';
    const checkTitle = isCompleted ? '取消完成' : '标记完成';

    return `
        <div class="${cardClass}" data-id="${todo.id}" draggable="${!isCompleted}">
            ${!isCompleted ? `
            <div class="todo-drag-handle" title="拖动排序">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                    <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                    <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                </svg>
            </div>
            ` : ''}
            <button class="${checkClass}" data-id="${todo.id}" title="${checkTitle}"></button>
            <div class="todo-content">
                <div class="todo-title">${escapeHtml(todo.title)}</div>
            </div>
            <div class="todo-actions">
                <button class="todo-action-btn edit" data-id="${todo.id}" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="todo-action-btn delete" data-id="${todo.id}" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
    `;
}
