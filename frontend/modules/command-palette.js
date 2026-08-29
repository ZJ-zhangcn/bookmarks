/**
 * 命令面板模块
 * Cmd/Ctrl+K 打开，支持快速搜索书签、分类、搜索引擎和常用操作。
 */
import * as state from './state.js';
import { escapeHtml, escapeHtmlAttribute, toSafeExternalUrl } from './utils.js';

let overlay;
let input;
let list;
let activeIndex = 0;
let commandActions = {};
let currentItems = [];

export function initCommandPalette(actions = {}) {
    commandActions = actions;
    ensurePalette();

    document.addEventListener('keydown', event => {
        const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
        const key = String(event.key || '').toLowerCase();

        if ((event.ctrlKey || event.metaKey) && key === 'k') {
            event.preventDefault();
            openCommandPalette();
            return;
        }

        if (event.key === '/' && !isInputFocused && !isOpen()) {
            event.preventDefault();
            openCommandPalette();
            return;
        }

        if (!isOpen()) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            closeCommandPalette();
        } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveActive(1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(-1);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            runActiveCommand();
        }
    });
}

function ensurePalette() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'command-palette-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
        <div class="command-palette-panel" role="dialog" aria-modal="true" aria-label="命令面板">
            <div class="command-palette-search-row">
                <span class="command-palette-icon">⌘</span>
                <input class="command-palette-input" type="search" placeholder="搜索书签、分类、搜索引擎或命令..." aria-label="命令面板搜索">
                <span class="command-palette-shortcut">Cmd/Ctrl+K</span>
            </div>
            <div class="command-palette-list" role="listbox"></div>
        </div>`;

    document.body.appendChild(overlay);
    input = overlay.querySelector('.command-palette-input');
    list = overlay.querySelector('.command-palette-list');

    overlay.addEventListener('click', event => {
        if (event.target === overlay) closeCommandPalette();
    });
    input.addEventListener('input', () => renderCommands(input.value));
    list.addEventListener('mousemove', event => {
        const item = event.target.closest('.command-palette-item');
        if (!item) return;
        setActive(Number(item.dataset.index));
    });
    list.addEventListener('click', event => {
        const item = event.target.closest('.command-palette-item');
        if (!item) return;
        setActive(Number(item.dataset.index));
        runActiveCommand();
    });
}

function isOpen() {
    return overlay?.classList.contains('open');
}

function openCommandPalette() {
    ensurePalette();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    input.value = '';
    renderCommands('');
    requestAnimationFrame(() => input.focus());
}

function closeCommandPalette() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function renderCommands(query) {
    const normalized = String(query || '').trim().toLowerCase();
    currentItems = buildCommandItems(normalized).slice(0, 30);
    activeIndex = 0;

    if (currentItems.length === 0) {
        list.innerHTML = '<div class="command-palette-empty">没有找到匹配项</div>';
        return;
    }

    list.innerHTML = currentItems.map((item, index) => `
        <button type="button" class="command-palette-item${index === activeIndex ? ' active' : ''}" data-index="${index}" data-command="${escapeHtmlAttribute(item.command)}" role="option" aria-selected="${index === activeIndex ? 'true' : 'false'}">
            <span class="command-palette-item-icon">${escapeHtml(item.icon)}</span>
            <span class="command-palette-item-body">
                <span class="command-palette-item-title">${escapeHtml(item.title)}</span>
                <span class="command-palette-item-subtitle">${escapeHtml(item.subtitle)}</span>
            </span>
            <span class="command-palette-item-type">${escapeHtml(item.type)}</span>
        </button>
    `).join('');
}

function buildCommandItems(query) {
    const staticCommands = [
        { command: 'add-bookmark', icon: '➕', title: '新增书签', subtitle: '打开添加书签窗口', type: '操作', run: () => commandActions.openBookmarkModal?.() },
        { command: 'open-settings', icon: '⚙️', title: '打开设置', subtitle: '主题、同步、AI、导入导出', type: '操作', run: () => commandActions.openSettingsModal?.() },
        { command: 'open-todos', icon: '✅', title: '查看 TODO', subtitle: '跳转到待办区域', type: '操作', run: () => scrollToElement('#todosContainer') },
        { command: 'focus-filter', icon: '🔎', title: '过滤书签', subtitle: '聚焦首页书签过滤框', type: '操作', run: () => focusElement('#searchInput') }
    ];

    const bookmarkItems = state.bookmarks.map(bookmark => ({
        command: `bookmark-${bookmark.id}`,
        icon: bookmark.icon || '🔖',
        title: bookmark.name || '未命名书签',
        subtitle: [bookmark.url, bookmark.description, ...(Array.isArray(bookmark.tags) ? bookmark.tags : [])].filter(Boolean).join(' · '),
        type: '书签',
        run: () => window.open(toSafeExternalUrl(bookmark.url), '_blank', 'noopener')
    }));

    const categoryItems = state.categories.map(category => ({
        command: `category-${category.id}`,
        icon: category.icon || '📁',
        title: category.name || '未命名分类',
        subtitle: '跳转到分类',
        type: '分类',
        run: () => scrollToCategory(category.id)
    }));

    const engineItems = state.engines.map(engine => ({
        command: `engine-${engine.id}`,
        icon: engine.icon || '🌐',
        title: `使用 ${engine.name || '搜索引擎'} 搜索`,
        subtitle: '输入关键词后回车可用当前搜索引擎搜索',
        type: '搜索',
        run: () => {
            state.setCurrentEngine({ name: engine.name, icon: engine.icon, url: engine.url });
            focusElement('#webSearchInput');
        }
    }));

    const items = [...staticCommands, ...bookmarkItems, ...categoryItems, ...engineItems];
    if (!query) return items;

    return items.filter(item => [item.title, item.subtitle, item.type]
        .some(value => String(value || '').toLowerCase().includes(query)));
}

function moveActive(delta) {
    if (currentItems.length === 0) return;
    setActive((activeIndex + delta + currentItems.length) % currentItems.length);
}

function setActive(index) {
    if (!Number.isFinite(index) || index < 0 || index >= currentItems.length) return;
    activeIndex = index;
    list.querySelectorAll('.command-palette-item').forEach((item, itemIndex) => {
        const active = itemIndex === activeIndex;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
        if (active) item.scrollIntoView({ block: 'nearest' });
    });
}

function runActiveCommand() {
    const item = currentItems[activeIndex];
    if (!item) return;
    closeCommandPalette();
    item.run?.();
}

function scrollToElement(selector) {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function focusElement(selector) {
    const element = document.querySelector(selector);
    if (!element) return;
    element.focus();
    element.select?.();
}

function scrollToCategory(categoryId) {
    const target = document.querySelector(`.category-section[data-category-id="${CSS.escape(String(categoryId))}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
