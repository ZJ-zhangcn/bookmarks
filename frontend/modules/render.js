/**
 * 渲染模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

import { highlightText, toSafeImageUrl, toPreferredIconImageUrl, escapeHtml, escapeHtmlAttribute, toSafeExternalUrl, toSafeDataImageUrl, bindImageFallbacks } from './utils.js';
import { findMonitorServerConfig, parseServerComponentType } from './monitor.js';
import { observeBookmarkIcons } from './api.js';
import { bindQuickInputEvent, bindTodoDragEvents } from './todo.js';
import { buildCategorySheetItems, buildCategoryFabLabel } from './ux.js';

export function renderAll() {
    renderCategoryNav();
    renderBookmarks();
    renderTodos();
    renderEngineDropdown();
    updateEngineDisplay();
    refreshSystemStats();
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

    // 不再清空整个容器：DOM.bookmarksContainer.innerHTML = '';
    // 而是复用已有的 DOM 结构，通过 CSS 控制显示隐藏

    const bookmarksByCategory = new Map();
    state.bookmarks.forEach(bookmark => {
        const categoryId = bookmark.category_id;
        if (!bookmarksByCategory.has(categoryId)) bookmarksByCategory.set(categoryId, []);
        bookmarksByCategory.get(categoryId).push(bookmark);
    });

    state.categories.forEach((category, idx) => {
        // 1. 判断该分类是否应该显示
        // 如果当前选中了特定分类，且不是当前分类，则不显示（隐藏）
        const isCurrentCategoryActive = state.currentCategory === 'all' || state.currentCategory === category.id;
        
        const catBookmarks = bookmarksByCategory.get(category.id) || [];
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
        let section = DOM.bookmarksContainer.querySelector(`.category-section[data-category-id="${CSS.escape(String(category.id))}"]`);
        
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

        const isServerMonitorGrid = filteredItems.length > 0 && filteredItems.every(item => {
            const serverComponent = item.item_type === 'component' && parseServerComponentType(item.component_type || '');
            return !!serverComponent?.isServer;
        });
        grid.classList.toggle('server-monitor-grid', isServerMonitorGrid);

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
            currentDataVersion !== String(state.dataVersion) ||
            grid.childElementCount === 0;

        if (needsUpdate) {
            grid.innerHTML = filteredItems.map((item, i) => createBookmarkCard(item, searchTerm, i)).join('');
            bindImageFallbacks(grid);
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
    const displayUrl = toPreferredIconImageUrl(src);
    if (!displayUrl) return `<span>${escapeHtml(fallbackIcon || '🌐')}</span>`;
    return `<img src="${escapeHtmlAttribute(displayUrl)}" data-original-src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(name)}" loading="lazy" data-fallback-icon="${escapeHtmlAttribute(fallbackIcon || '🌐')}">`;
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
        if (cachedIcon.icon_type === 'base64') {
            iconHtml = `<img src="${toSafeDataImageUrl(cachedIcon.icon_data)}" alt="${escapeHtmlAttribute(item.name)}" loading="lazy" data-fallback-icon="${escapeHtmlAttribute(item.icon || '🌐')}">`;
        } else {
            iconHtml = renderBookmarkIconImage(cachedIcon.icon_data, item.name, item.icon || '🌐');
        }
    } else if (item.icon_type === 'url' && item.icon_data) {
        iconHtml = renderBookmarkIconImage(item.icon_data, item.name, item.icon || '🌐');
    } else if (item.icon_type === 'base64' && item.icon_data) {
        iconHtml = `<img src="${toSafeDataImageUrl(item.icon_data)}" alt="${escapeHtmlAttribute(item.name)}" loading="lazy" data-fallback-icon="${escapeHtmlAttribute(item.icon || '🌐')}">`;
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

export function createComponentCard(item) {
    const componentType = item.component_type || '';
    const serverComponent = parseServerComponentType(componentType);
    if (serverComponent.isServer) return createServerMonitorCard(item, serverComponent.serverId);
    return createServerMonitorCard({ ...item, name: item.name || '服务器探针' }, '');
}

function createServerMonitorCard(item, serverId = '') {
    const config = findMonitorServerConfig(serverId);
    const title = serverId ? (config?.name || item.name || serverId) : (item.name || '服务器探针');
    return `
        <div class="server-monitor-slot" data-id="${escapeHtmlAttribute(item.id)}" data-component="server" data-server-id="${escapeHtmlAttribute(serverId)}">
            <div class="bookmark-actions">
                <button class="bookmark-action-btn delete" data-id="${escapeHtmlAttribute(item.id)}" title="删除">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
            <div class="server-card-mount" data-type="server" data-server-id="${escapeHtmlAttribute(serverId)}">
                <div class="server-card offline">
                    <div class="server-card-title-row">
                        <div class="component-icon">🖥️</div>
                        <div class="server-title">
                            <div class="server-name">${escapeHtml(title)}</div>
                            <div class="server-meta">加载中...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function formatBytes(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return `${bytes || 0} B`;
}

function formatRate(bytesPerSecond) {
    return `${formatBytes(bytesPerSecond || 0)}/s`;
}

function formatLoad(load = []) {
    const values = Array.isArray(load) ? load.slice(0, 3) : [];
    if (!values.length) return '0.00 / 0.00 / 0.00';
    return values.map(value => (Number(value) || 0).toFixed(2)).join(' / ');
}

function formatAge(lastSeen) {
    const ageMs = Math.max(0, Date.now() - (Number(lastSeen) || 0));
    if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}秒前`;
    if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}分钟前`;
    return `${Math.round(ageMs / 3_600_000)}小时前`;
}

function formatUptime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const days = Math.floor(value / 86400);
    const hours = Math.floor((value % 86400) / 3600);
    if (days > 0) return `${days}天${hours}小时`;
    return `${hours}小时${Math.floor((value % 3600) / 60)}分`;
}

function progressColor(percent) {
    return percent > 80 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#22c55e';
}

function renderServerCard(server) {
    const cpu = server.cpu?.usage || 0;
    const memory = server.memory?.usagePercent || 0;
    const disk = server.disk?.usagePercent || 0;
    const swap = server.swap?.usagePercent || 0;
    const network = server.network || {};
    const docker = server.docker || {};
    const processInfo = server.process || {};
    const statusLabel = { online: '在线', stale: '延迟', offline: '离线' }[server.status] || server.status;
    const meta = [server.region, server.role].filter(Boolean).join(' · ');
    return `
        <div class="server-card ${escapeHtmlAttribute(server.status || 'offline')}">
            <div class="server-card-top">
                <span class="server-status-dot ${escapeHtmlAttribute(server.status || 'offline')}"></span>
                <span class="server-status-label">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="server-card-title-row">
                <div class="component-icon">🖥️</div>
                <div class="server-title">
                    <div class="server-name">${escapeHtml(server.name || server.id)}</div>
                    <div class="server-meta">${escapeHtml(meta || server.id)}</div>
                </div>
            </div>
            <div class="server-uptime">运行 ${escapeHtml(formatUptime(server.uptime))} · 上报 ${escapeHtml(formatAge(server.lastSeen))}</div>
            <div class="server-metrics">
                <span>CPU <b>${cpu.toFixed(0)}%</b></span>
                <span>RAM <b>${memory.toFixed(0)}%</b></span>
                <span>磁盘 <b>${disk.toFixed(0)}%</b></span>
            </div>
            <div class="server-bars">
                <div class="server-mini-bar"><i style="width:${cpu}%;background:${progressColor(cpu)}"></i></div>
                <div class="server-mini-bar"><i style="width:${memory}%;background:${progressColor(memory)}"></i></div>
                <div class="server-mini-bar"><i style="width:${disk}%;background:${progressColor(disk)}"></i></div>
            </div>
            <div class="server-probe-grid">
                <span><em>负载</em><b>${escapeHtml(formatLoad(server.load))}</b></span>
                <span><em>Swap</em><b>${swap.toFixed(0)}%</b></span>
                <span><em>Docker</em><b>${Number(docker.running || 0)}/${Number(docker.total || 0)}</b></span>
                <span><em>网络</em><b>↓ ${escapeHtml(formatRate(network.rxRate))}</b></span>
                <span><em>上传</em><b>↑ ${escapeHtml(formatRate(network.txRate))}</b></span>
                <span><em>进程</em><b>${Number(processInfo.count || 0)}</b></span>
            </div>
            <div class="server-resource-line">${formatBytes(server.memory?.used || 0)} / ${formatBytes(server.memory?.total || 0)} RAM</div>
            <div class="server-resource-line">${formatBytes(server.disk?.used || 0)} / ${formatBytes(server.disk?.total || 0)} 磁盘</div>
        </div>
    `;
}

function renderServerMissingCard(serverId) {
    const config = findMonitorServerConfig(serverId);
    return `
        <div class="server-card offline missing">
            <div class="server-card-top">
                <span class="server-status-dot offline"></span>
                <span class="server-status-label">未上报</span>
            </div>
            <div class="server-card-title-row">
                <div class="component-icon">🖥️</div>
                <div class="server-title">
                    <div class="server-name">${escapeHtml(config?.name || serverId || '未选择服务器')}</div>
                    <div class="server-meta">${escapeHtml([serverId, config?.region, config?.role].filter(Boolean).join(' · ') || '请先安装 Agent')}</div>
                </div>
            </div>
            <div class="server-resource-line">Agent 尚未上报，或 MONITOR_SERVER_ID 不匹配。</div>
        </div>
    `;
}

export async function refreshSystemStats() {
    const componentCards = document.querySelectorAll('.server-monitor-slot');
    if (componentCards.length === 0) {
        if (state.systemStatsInterval) {
            clearInterval(state.systemStatsInterval);
            state.setSystemStatsInterval(null);
        }
        return;
    }

    try {
        const res = await fetch(`${state.API_BASE}/api/system/servers`);
        const result = await res.json();
        if (!result.success) return;

        const servers = result.data?.servers || [];
        const serverById = new Map(servers.map(server => [server.id, server]));
        document.querySelectorAll('.server-card-mount[data-type="server"]').forEach(el => {
            const serverId = el.dataset.serverId || '';
            const server = serverById.get(serverId);
            el.innerHTML = server ? renderServerCard(server) : renderServerMissingCard(serverId);
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

function getIconSource(url) {
    url = String(url || '');
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
        const displayIcon = toSafeImageUrl(icon);
        const source = getIconSource(icon);
        DOM.iconPreviewAuto.innerHTML = `<div class="icon-single">
            <img src="${displayIcon}" data-url="${escapeHtmlAttribute(icon)}" data-fallback-icon="🌐">
            <span class="icon-source-label ${source.class}">${escapeHtml(source.label)}</span>
        </div>`;
    } else {
        DOM.iconPreviewAuto.innerHTML = `<div class="icon-selection">
            ${availableIcons.slice(0, 6).map((icon, idx) => {
        const source = getIconSource(icon);
        const displayIcon = toSafeImageUrl(icon);
        return `<div class="icon-option-wrap ${idx === 0 ? 'selected' : ''}" data-url="${escapeHtmlAttribute(icon)}" title="${escapeHtmlAttribute(source.label)}">
                    <img src="${displayIcon}" data-url="${escapeHtmlAttribute(icon)}" class="icon-option" data-remove-on-error="true">
                    <span class="icon-source-label ${source.class}">${escapeHtml(source.label)}</span>
                </div>`;
    }).join('')}
        </div>`;
        bindImageFallbacks(DOM.iconPreviewAuto);
        DOM.iconPreviewAuto.querySelectorAll('.icon-option-wrap').forEach(wrap => {
            wrap.onclick = (e) => {
                e.stopPropagation();
                DOM.iconPreviewAuto.querySelectorAll('.icon-option-wrap').forEach(w => w.classList.remove('selected'));
                wrap.classList.add('selected');
            };
        });
    }
    bindImageFallbacks(DOM.iconPreviewAuto);
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

