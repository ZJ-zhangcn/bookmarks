/**
 * 渲染模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

const PROXY_ALLOWED_HOSTS = ['github.com', 'grok.com', 'www.google.com', 'favicon.im', 'icon.horse', 'favicons.githubusercontent.com'];

function shouldUseProxy(url) {
    try {
        const hostname = new URL(url).hostname;
        return PROXY_ALLOWED_HOSTS.some(host => hostname === host || hostname.endsWith('.' + host));
    } catch {
        return false;
    }
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
import { highlightText } from './utils.js';
import { observeBookmarkIcons } from './api.js';

export function renderAll() {
    renderCategoryNav();
    renderBookmarks();
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
    let hasResults = false;

    DOM.bookmarksContainer.innerHTML = '';

    state.categories.forEach((category, idx) => {
        if (state.currentCategory !== 'all' && state.currentCategory !== category.id) return;

        const catBookmarks = state.bookmarks.filter(b => b.category_id === category.id);
        const filteredItems = catBookmarks.filter(item => {
            if (!searchTerm) return true;
            const tagsText = Array.isArray(item.tags) ? item.tags.join(',') : String(item.tags || '');
            return item.name.toLowerCase().includes(searchTerm) ||
                (item.description && item.description.toLowerCase().includes(searchTerm)) ||
                item.url.toLowerCase().includes(searchTerm) ||
                (tagsText && tagsText.toLowerCase().includes(searchTerm));
        });

        if (filteredItems.length === 0 && state.currentCategory === 'all') return;

        hasResults = true;

        const isCollapsed = state.collapsedCategories.has(category.id);
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
                <span class="category-count">${filteredItems.length} 个</span>
            </header>
            <div class="bookmarks-grid" data-category="${category.id}" ${isCollapsed ? 'style="display:none;"' : ''}>
                ${filteredItems.map((item, i) => createBookmarkCard(item, searchTerm, i)).join('')}
            </div>
        `;

        DOM.bookmarksContainer.appendChild(section);
    });

    DOM.emptyState.style.display = hasResults ? 'none' : 'block';
    DOM.bookmarksContainer.style.display = hasResults ? 'flex' : 'none';

    // 使用IntersectionObserver替代scroll监听（性能优化）
    requestAnimationFrame(() => {
        setTimeout(observeBookmarkIcons, 50);
    });
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
        const escapedIcon = escapeHtml(item.icon || '🌐');
        if (shouldUseProxy(rawIconUrl)) {
            const proxyIconUrl = `${state.API_BASE}/api/proxy-icon?url=${encodeURIComponent(rawIconUrl)}`;
            iconHtml = `<img src="${rawIconUrl}" alt="${item.name}" loading="lazy" data-proxy-url="${proxyIconUrl}" onerror="if(!this.dataset.proxyTried && !this.src.includes('/api/proxy-icon?')){this.dataset.proxyTried='1';this.src=this.dataset.proxyUrl;}else{this.outerHTML='<span>${escapedIcon}</span>'}">`;
        } else {
            iconHtml = `<img src="${rawIconUrl}" alt="${item.name}" loading="lazy" onerror="this.outerHTML='<span>${escapedIcon}</span>'">`;
        }
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
        if (shouldUseProxy(icon)) {
            const proxyUrl = `${state.API_BASE}/api/proxy-icon?url=${encodeURIComponent(icon)}`;
            DOM.iconPreviewAuto.innerHTML = `<div class="icon-single">
                <img src="${icon}" data-proxy-url="${proxyUrl}" onerror="if(!this.dataset.proxyTried && !this.src.includes('/api/proxy-icon?')){this.dataset.proxyTried='1';this.src=this.dataset.proxyUrl;}else{this.outerHTML='<span>🌐</span>'}">
                <span class="icon-source-label ${source.class}">${source.label}</span>
            </div>`;
        } else {
            DOM.iconPreviewAuto.innerHTML = `<div class="icon-single">
                <img src="${icon}" onerror="this.outerHTML='<span>🌐</span>'">
                <span class="icon-source-label ${source.class}">${source.label}</span>
            </div>`;
        }
    } else {
        DOM.iconPreviewAuto.innerHTML = `<div class="icon-selection">
            ${availableIcons.slice(0, 6).map((icon, idx) => {
                const source = getIconSource(icon);
                if (shouldUseProxy(icon)) {
                    const proxyUrl = `${state.API_BASE}/api/proxy-icon?url=${encodeURIComponent(icon)}`;
                    return `<div class="icon-option-wrap ${idx === 0 ? 'selected' : ''}" data-url="${icon}" title="${source.label}">
                        <img src="${icon}" class="icon-option" data-proxy-url="${proxyUrl}" onerror="if(!this.dataset.proxyTried && !this.src.includes('/api/proxy-icon?')){this.dataset.proxyTried='1';this.src=this.dataset.proxyUrl;}else{this.parentElement.remove();}">
                        <span class="icon-source-label ${source.class}">${source.label}</span>
                    </div>`;
                } else {
                    return `<div class="icon-option-wrap ${idx === 0 ? 'selected' : ''}" data-url="${icon}" title="${source.label}">
                        <img src="${icon}" class="icon-option" onerror="this.parentElement.remove()">
                        <span class="icon-source-label ${source.class}">${source.label}</span>
                    </div>`;
                }
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
