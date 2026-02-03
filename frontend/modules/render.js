/**
 * 渲染模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
import { highlightText, shouldUseProxyUrl, toProxyUrl } from './utils.js';
import { observeBookmarkIcons } from './api.js';
import { bindQuickInputEvent, bindTodoDragEvents, bindTodoFilterEvent } from './todo.js';

export function renderAll() {
    renderCategoryNav();
    renderBookmarks();
    renderTodos();
    renderEngineDropdown();
    updateEngineDisplay();
    if (window.i18n && window.i18n.applyTranslations) {
        window.i18n.applyTranslations();
    }
    refreshSystemStats();
}

export function renderCategoryNav() {
    const allBtn = DOM.categoryNav.querySelector('[data-category="all"]');
    DOM.categoryNav.innerHTML = '';
    DOM.categoryNav.appendChild(allBtn);

    state.categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn' + (state.currentCategory === cat.id ? ' active' : '');
        btn.dataset.category = cat.id;
        btn.innerHTML = `<span>${cat.name}</span>`;
        DOM.categoryNav.appendChild(btn);
    });
}

export function renderBookmarks() {
    const searchTerm = state.currentSearch.toLowerCase().trim();
    const isSearchMode = !!searchTerm;
    let hasResults = false;

    // 不再清空整个容器：DOM.bookmarksContainer.innerHTML = '';
    // 而是复用已有的 DOM 结构，通过 CSS 控制显示隐藏

    state.categories.forEach((category, idx) => {
        // 1. 判断该分类是否应该显示
        // 如果当前选中了特定分类，且不是当前分类，则不显示（隐藏）
        const isCurrentCategoryActive = state.currentCategory === 'all' || state.currentCategory === category.id;
        
        const catBookmarks = state.bookmarks.filter(b => b.category_id === category.id);
        const filteredItems = catBookmarks.filter(item => {
            if (!searchTerm) return true;
            const tagsText = Array.isArray(item.tags) ? item.tags.join(',') : String(item.tags || '');
            return item.name.toLowerCase().includes(searchTerm) ||
                (item.description && item.description.toLowerCase().includes(searchTerm)) ||
                item.url.toLowerCase().includes(searchTerm) ||
                (tagsText && tagsText.toLowerCase().includes(searchTerm));
        });

        // 如果是全部分类模式且该分类无内容，通常不显示（除非是当前选中的特定分类，可能显示空状态）
        const shouldShow = isCurrentCategoryActive && (filteredItems.length > 0 || state.currentCategory !== 'all');

        // 2. 获取或创建 DOM 节点
        let section = DOM.bookmarksContainer.querySelector(`.category-section[data-category-id="${category.id}"]`);
        
        if (!shouldShow) {
            if (section) section.style.display = 'none';
            return;
        }

        hasResults = true;

        const isCollapsed = state.collapsedCategories.has(category.id);
        
        if (!section) {
            section = createCategorySection(category, isCollapsed, idx);
            DOM.bookmarksContainer.appendChild(section);
        } else {
            section.style.display = 'block';
            // 更新折叠状态
            if (isCollapsed) section.classList.add('collapsed');
            else section.classList.remove('collapsed');
            // 更新折叠按钮 title
            const collapseBtn = section.querySelector('.collapse-btn');
            if (collapseBtn) collapseBtn.title = isCollapsed ? '展开' : '折叠';
            
            // 更新 Grid 可见性
            const grid = section.querySelector('.bookmarks-grid');
            if (grid) grid.style.display = isCollapsed ? 'none' : ''; 
        }

        // 3. 更新内容 (增量更新核心)
        const grid = section.querySelector('.bookmarks-grid');
        const countSpan = section.querySelector('.category-count');
        
        // 判定是否需要重绘 Grid 内容
        // 重新渲染条件：
        // a. 处于搜索模式 (内容随关键词变动)
        // b. Grid 之前处于搜索模式渲染结果 (现在切回普通模式，需要恢复全量)
        // c. 数据版本变动 (有新增/删除/修改)
        // d. Grid 为空 (新创建)
        
        const currentRenderMode = grid.dataset.renderMode || 'none';
        const targetRenderMode = isSearchMode ? 'search' : 'full';
        const currentDataVersion = grid.dataset.version || '-1';
        
        const needsUpdate = 
            isSearchMode || 
            currentRenderMode === 'search' || 
            currentDataVersion != state.dataVersion ||
            grid.childElementCount === 0;

        if (needsUpdate) {
            grid.innerHTML = filteredItems.map((item, i) => createBookmarkCard(item, searchTerm, i)).join('');
            grid.dataset.renderMode = targetRenderMode;
            grid.dataset.version = state.dataVersion;
            
            if (countSpan) countSpan.textContent = `${filteredItems.length} 个`;
        }
    });

    DOM.emptyState.style.display = hasResults ? 'none' : 'block';
    DOM.bookmarksContainer.style.display = hasResults ? 'flex' : 'none';

    // 使用IntersectionObserver替代scroll监听（性能优化）
    requestAnimationFrame(() => {
        setTimeout(observeBookmarkIcons, 50);
    });
}

function createCategorySection(category, isCollapsed, idx) {
    const section = document.createElement('section');
    section.className = 'category-section' + (isCollapsed ? ' collapsed' : '');
    section.dataset.categoryId = category.id;
    section.style.animationDelay = `${idx * 0.1}s`;

    section.innerHTML = `
        <header class="category-header">
            <button class="collapse-btn" data-category="${category.id}" title="${isCollapsed ? '展开' : '折叠'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m6 9 6 6 6-6"/>
                </svg>
            </button>
            <h2 class="category-title">${category.name}</h2>
            <div class="category-header-actions">
                <button class="header-action-btn add-btn" data-category="${category.id}" title="添加书签">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button class="header-action-btn sort-btn" data-category="${category.id}" title="排序书签">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h12M3 18h6"/></svg>
                </button>
            </div>
            <span class="category-count">0 个</span>
        </header>
        <div class="bookmarks-grid" data-category="${category.id}" ${isCollapsed ? 'style="display:none;"' : ''}>
        </div>
    `;
    return section;
}

export function createBookmarkCard(item, searchTerm) {
    if (item.item_type === 'component') {
        return createComponentCard(item);
    }

    const name = highlightText(item.name, searchTerm);
    const desc = highlightText(item.description || '', searchTerm);
    const tagsArray = Array.isArray(item.tags)
        ? item.tags.map(t => String(t || '').trim()).filter(Boolean)
        : String(item.tags || '').split(/[,\n，;；|/]+/g).map(t => t.trim()).filter(Boolean);
    const matchedTags = searchTerm
        ? tagsArray.filter(t => t.toLowerCase().includes(searchTerm))
        : [];
    const tagsHtml = matchedTags.length > 0
        ? `<div class="bookmark-tags" title="标签（匹配）">${matchedTags.map(t => `<span class="tag-chip">${highlightText(t, searchTerm)}</span>`).join('')}</div>`
        : '';

    let iconHtml;
    const cachedIcon = state.iconCache.get(item.id);
    if (cachedIcon && cachedIcon.icon_data) {
        iconHtml = `<img src="${cachedIcon.icon_data}" alt="${item.name}" loading="lazy">`;
    } else if (item.icon_type === 'url' && item.icon_data) {
        const rawIconUrl = item.icon_data;
        const displayUrl = shouldUseProxyUrl(rawIconUrl) ? toProxyUrl(rawIconUrl) : rawIconUrl;
        const escapedIcon = escapeHtml(item.icon || '🌐');
        iconHtml = `<img src="${displayUrl}" alt="${item.name}" loading="lazy" onerror="this.outerHTML='<span>${escapedIcon}</span>'">`;
    } else if (item.icon_type === 'base64' && item.icon_data) {
        iconHtml = `<img src="${item.icon_data}" alt="${item.name}" loading="lazy">`;
    } else if (item.icon_type === 'base64') {
        iconHtml = `<span class="icon-placeholder">${item.icon || '🌐'}</span>`;
    } else {
        iconHtml = `<span>${item.icon || '🌐'}</span>`;
    }

    const rawDesc = item.description || '';
    return `
        <a href="${item.url}" class="bookmark-card" target="_blank" rel="noopener" data-id="${item.id}">
            <div class="bookmark-actions">
                <button class="bookmark-action-btn edit" data-id="${item.id}" title="编辑">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="bookmark-action-btn delete" data-id="${item.id}" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
            <div class="bookmark-icon">${iconHtml}</div>
            <div class="bookmark-info">
                <div class="bookmark-name">${name}</div>
                <div class="bookmark-desc" title="${rawDesc.replace(/"/g, '&quot;')}">${desc}</div>
                ${tagsHtml}
            </div>
        </a>
    `;
}

export function createComponentCard(item) {
    const componentType = item.component_type || 'cpu';
    const icons = { cpu: '💻', memory: '📊', disk: '💾' };
    const labels = { cpu: 'CPU', memory: 'RAM', disk: '磁盘' };

    return `
        <div class="component-card" data-id="${item.id}" data-component="${componentType}">
            <div class="bookmark-actions">
                <button class="bookmark-action-btn delete" data-id="${item.id}" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
            <div class="component-icon">${icons[componentType]}</div>
            <div class="component-info">
                <div class="component-label">${labels[componentType]}</div>
                <div class="component-value" data-type="${componentType}">加载中...</div>
                <div class="component-progress">
                    <div class="component-progress-bar" data-type="${componentType}" style="width: 0%"></div>
                </div>
            </div>
        </div>
    `;
}

export async function refreshSystemStats() {
    const componentCards = document.querySelectorAll('.component-card');
    if (componentCards.length === 0) {
        if (state.systemStatsInterval) {
            clearInterval(state.systemStatsInterval);
            state.setSystemStatsInterval(null);
        }
        return;
    }

    try {
        const res = await fetch(`${state.API_BASE}/api/system/stats`);
        const result = await res.json();
        if (!result.success) return;

        const { cpu, memory, disk } = result.data;

        const formatBytes = (bytes) => {
            if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
            if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
            return (bytes / 1024).toFixed(1) + ' KB';
        };

        document.querySelectorAll('.component-value[data-type="cpu"]').forEach(el => {
            el.textContent = cpu.usage.toFixed(1) + '%';
        });
        document.querySelectorAll('.component-progress-bar[data-type="cpu"]').forEach(el => {
            el.style.width = cpu.usage + '%';
            el.style.backgroundColor = cpu.usage > 80 ? '#ef4444' : cpu.usage > 50 ? '#f59e0b' : '#22c55e';
        });

        document.querySelectorAll('.component-value[data-type="memory"]').forEach(el => {
            el.textContent = `${formatBytes(memory.used)} / ${formatBytes(memory.total)}`;
        });
        document.querySelectorAll('.component-progress-bar[data-type="memory"]').forEach(el => {
            el.style.width = memory.usagePercent + '%';
            el.style.backgroundColor = memory.usagePercent > 80 ? '#ef4444' : memory.usagePercent > 50 ? '#f59e0b' : '#22c55e';
        });

        document.querySelectorAll('.component-value[data-type="disk"]').forEach(el => {
            el.textContent = `${formatBytes(disk.used)} / ${formatBytes(disk.total)}`;
        });
        document.querySelectorAll('.component-progress-bar[data-type="disk"]').forEach(el => {
            el.style.width = disk.usagePercent + '%';
            el.style.backgroundColor = disk.usagePercent > 80 ? '#ef4444' : disk.usagePercent > 50 ? '#f59e0b' : '#22c55e';
        });

    } catch (e) {
        console.error('获取系统状态失败:', e);
    }

    if (!state.systemStatsInterval) {
        state.setSystemStatsInterval(setInterval(refreshSystemStats, 5000));
    }
}

export function renderEngineDropdown() {
    const divider = DOM.engineDropdown.querySelector('.engine-dropdown-divider');
    DOM.engineDropdown.querySelectorAll('.engine-option').forEach(el => el.remove());

    state.engines.forEach(engine => {
        const opt = document.createElement('div');
        opt.className = 'engine-option' + (state.currentEngine.name === engine.name ? ' active' : '');
        opt.dataset.engine = engine.id;
        opt.dataset.icon = engine.icon;
        opt.dataset.url = engine.url;

        const iconHtml = engine.icon && engine.icon.startsWith('http')
            ? `<img src="${engine.icon}" style="width:18px;height:18px;">`
            : engine.icon;
        opt.innerHTML = `<span class="engine-option-icon">${iconHtml}</span><span>${engine.name}</span>`;
        divider.parentNode.insertBefore(opt, divider);
    });
}

export function updateEngineDisplay() {
    const icon = state.currentEngine.icon;
    if (icon && icon.startsWith('http')) {
        DOM.engineIcon.innerHTML = `<img src="${icon}" style="width:18px;height:18px;vertical-align:middle;">`;
    } else if (icon && icon.startsWith('data:')) {
        DOM.engineIcon.innerHTML = `<img src="${icon}" style="width:18px;height:18px;vertical-align:middle;">`;
    } else {
        DOM.engineIcon.textContent = icon || '🌐';
    }
    DOM.engineName.textContent = state.currentEngine.name;
}

function getIconSource(url) {
    if (url.includes('google.com/s2/favicons')) return { label: 'Google', class: 'source-google' };
    if (url.includes('favicon.im')) return { label: 'Favicon.im', class: 'source-faviconim' };
    if (url.includes('icon.horse')) return { label: 'IconHorse', class: 'source-iconhorse' };
    if (url.includes('apple-touch-icon')) return { label: 'Apple', class: 'source-apple' };
    if (url.includes('/favicon.ico')) return { label: '站点', class: 'source-site' };
    return { label: '网站', class: 'source-site' };
}

export function renderIconSelection(availableIcons) {
    if (availableIcons.length === 0) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        return;
    }
    if (availableIcons.length === 1) {
        const icon = availableIcons[0];
        const source = getIconSource(icon);
        DOM.iconPreviewAuto.innerHTML = `<div class="icon-single">
            <img src="${icon}" onerror="this.outerHTML='<span>🌐</span>'">
            <span class="icon-source-label ${source.class}">${source.label}</span>
        </div>`;
    } else {
        DOM.iconPreviewAuto.innerHTML = `<div class="icon-selection">
            ${availableIcons.slice(0, 6).map((icon, idx) => {
                const source = getIconSource(icon);
                return `<div class="icon-option-wrap ${idx === 0 ? 'selected' : ''}" data-url="${icon}" title="${source.label}">
                    <img src="${icon}" class="icon-option" onerror="this.parentElement.remove()">
                    <span class="icon-source-label ${source.class}">${source.label}</span>
                </div>`;
            }).join('')}
        </div>`;
        DOM.iconPreviewAuto.querySelectorAll('.icon-option-wrap').forEach(wrap => {
            wrap.onclick = (e) => {
                e.stopPropagation();
                DOM.iconPreviewAuto.querySelectorAll('.icon-option-wrap').forEach(w => w.classList.remove('selected'));
                wrap.classList.add('selected');
            };
        });
    }
}

export function renderTodos() {
    if (!DOM.todosContainer) return;

    const allTodos = state.todos || [];
    const filterCat = state.todoFilterCategory;

    // 按分类筛选
    const filteredTodos = allTodos.filter(t => {
        if (filterCat === 'all') return true;
        if (filterCat === 'uncategorized') return !t.category_id;
        return t.category_id === filterCat;
    });

    // 分离未完成和已完成
    const pendingTodos = filteredTodos.filter(t => !t.is_done);
    const completedTodos = filteredTodos.filter(t => t.is_done);

    // 按优先级和截止时间排序待办
    pendingTodos.sort((a, b) => {
        // 优先级高的在前 (3 > 2 > 1 > 0)
        if (b.priority !== a.priority) return (b.priority || 0) - (a.priority || 0);
        // 有截止时间的在前，且按时间升序
        if (a.due_at && !b.due_at) return -1;
        if (!a.due_at && b.due_at) return 1;
        if (a.due_at && b.due_at) return new Date(a.due_at) - new Date(b.due_at);
        // 其他按 sort_order
        return (a.sort_order || 0) - (b.sort_order || 0);
    });

    let html = '';

    // 分类筛选下拉 + 快速输入框
    html += `
        <div class="todo-header">
            <div class="todo-filter">
                <select id="todoFilterCategory" class="todo-filter-select">
                    <option value="all" ${filterCat === 'all' ? 'selected' : ''}>全部分类</option>
                    <option value="uncategorized" ${filterCat === 'uncategorized' ? 'selected' : ''}>未分类</option>
                    ${state.categories.map(c => `<option value="${c.id}" ${filterCat === c.id ? 'selected' : ''}>${c.icon || '📁'} ${c.name}</option>`).join('')}
                </select>
            </div>
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
    bindTodoFilterEvent();
}

export function createTodoCard(todo, isCompleted = false) {
    const priorityLabels = ['', '低', '中', '高'];
    const priorityClasses = ['', 'priority-low', 'priority-medium', 'priority-high'];
    const priority = todo.priority || 0;
    const priorityClass = priorityClasses[priority] || '';
    const priorityLabel = priority > 0 ? `<span class="todo-priority ${priorityClass}">${priorityLabels[priority]}</span>` : '';

    // 截止时间格式化
    let dueDateHtml = '';
    if (todo.due_at) {
        const dueDate = new Date(todo.due_at);
        const now = new Date();
        const isOverdue = !isCompleted && dueDate < now;
        const isToday = dueDate.toDateString() === now.toDateString();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const isTomorrow = dueDate.toDateString() === tomorrow.toDateString();

        let dueDateLabel;
        if (isToday) {
            dueDateLabel = '今天 ' + dueDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else if (isTomorrow) {
            dueDateLabel = '明天 ' + dueDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else {
            dueDateLabel = dueDate.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        }

        const dueClass = isOverdue ? 'overdue' : (isToday ? 'due-today' : '');
        dueDateHtml = `<span class="todo-due ${dueClass}" title="${dueDate.toLocaleString('zh-CN')}">📅 ${dueDateLabel}</span>`;
    }

    // 备注展开
    const hasNotes = todo.notes && todo.notes.trim();
    const notesHtml = hasNotes ? `
        <div class="todo-notes-toggle" data-id="${todo.id}" title="查看备注">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
            </svg>
        </div>
        <div class="todo-notes-content" id="todoNotes_${todo.id}" style="display:none;">
            <div class="todo-notes-text">${escapeHtml(todo.notes)}</div>
        </div>
    ` : '';

    // 分类标签
    const categoryHtml = todo.category_name ? 
        `<span class="todo-category">${todo.category_icon || '📁'} ${todo.category_name}</span>` : '';

    const cardClass = isCompleted ? 'todo-card completed' : 'todo-card';
    const checkClass = isCompleted ? 'todo-check checked' : 'todo-check';
    const checkTitle = isCompleted ? '取消完成' : '标记完成';

    return `
        <div class="${cardClass} ${priorityClass}" data-id="${todo.id}" draggable="${!isCompleted}">
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
                <div class="todo-title-row">
                    <div class="todo-title">${escapeHtml(todo.title)}</div>
                    ${priorityLabel}
                </div>
                <div class="todo-meta">
                    ${categoryHtml}
                    ${dueDateHtml}
                    ${hasNotes ? notesHtml.split('<div class="todo-notes-content"')[0] : ''}
                </div>
                ${hasNotes ? `<div class="todo-notes-content" id="todoNotes_${todo.id}" style="display:none;">
                    <div class="todo-notes-text">${escapeHtml(todo.notes)}</div>
                </div>` : ''}
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

// 保留 formatDueDate 以备将来使用
