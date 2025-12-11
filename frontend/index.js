/**
 * 书签导航网站 - 前端 JavaScript
 * 使用后端 API 管理数据
 */

// ========================================
// API 基础 URL
// ========================================
const API_BASE = window.location.origin;

// ========================================
// 状态变量
// ========================================
let categories = [];
let bookmarks = [];
let engines = [];
let currentCategory = 'all';
let currentSearch = '';
let currentEngine = { name: 'Google', icon: '🌐', url: 'https://www.google.com/search?q=' };
let editingBookmarkId = null;
let editingCategoryId = null;
let editingEngineId = null;
let currentIconType = 'auto';
let currentIconData = '';
let editingBookmark = null; // 存储正在编辑的书签原始数据
let collapsedCategories = new Set(); // 存储折叠状态的分类ID

// ========================================
// DOM 元素
// ========================================
let DOM = {};

// ========================================
// 初始化
// ========================================
async function init() {
    // 阻止浏览器自动恢复滚动位置
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    // 确保页面从顶部开始
    window.scrollTo(0, 0);

    cacheDOMElements();
    loadCollapsedState(); // 加载折叠状态
    await loadData();
    renderAll();
    bindAllEvents();
    // 隐藏加载遮罩
    hideLoadingOverlay();
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        // 动画完成后移除元素
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

function cacheDOMElements() {
    DOM = {
        searchInput: document.getElementById('searchInput'),
        searchClear: document.getElementById('searchClear'),
        categoryNav: document.getElementById('categoryNav'),
        bookmarksContainer: document.getElementById('bookmarksContainer'),
        emptyState: document.getElementById('emptyState'),
        emptyAddBookmark: document.getElementById('emptyAddBookmark'),
        emptyAddCategory: document.getElementById('emptyAddCategory'),
        webSearchForm: document.getElementById('webSearchForm'),
        webSearchInput: document.getElementById('webSearchInput'),
        engineBtn: document.getElementById('engineBtn'),
        engineIcon: document.getElementById('engineIcon'),
        engineName: document.getElementById('engineName'),
        engineDropdown: document.getElementById('engineDropdown'),
        engineSelector: document.querySelector('.engine-selector'),
        engineManageBtn: document.getElementById('engineManageBtn'),
        engineModal: document.getElementById('engineModal'),
        modalClose: document.getElementById('modalClose'),
        engineList: document.getElementById('engineList'),
        engineInputName: document.getElementById('engineInputName'),
        engineInputIconUrl: document.getElementById('engineInputIconUrl'),
        engineInputUrl: document.getElementById('engineInputUrl'),
        engineIconPreview: document.getElementById('engineIconPreview'),
        autoFetchEngineIcon: document.getElementById('autoFetchEngineIcon'),
        saveEngineBtn: document.getElementById('saveEngineBtn'),
        saveEngineBtnText: document.getElementById('saveEngineBtnText'),
        cancelEditBtn: document.getElementById('cancelEditBtn'),
        formTitle: document.getElementById('formTitle'),
        bookmarkModal: document.getElementById('bookmarkModal'),
        bookmarkModalTitle: document.getElementById('bookmarkModalTitle'),
        bookmarkModalClose: document.getElementById('bookmarkModalClose'),
        bookmarkInputName: document.getElementById('bookmarkInputName'),
        bookmarkInputUrl: document.getElementById('bookmarkInputUrl'),
        bookmarkInputDesc: document.getElementById('bookmarkInputDesc'),
        bookmarkInputCategory: document.getElementById('bookmarkInputCategory'),
        bookmarkItemType: document.getElementById('bookmarkItemType'),
        bookmarkComponentType: document.getElementById('bookmarkComponentType'),
        componentTypeGroup: document.getElementById('componentTypeGroup'),
        bookmarkOnlyFields: document.querySelectorAll('.bookmark-only-field'),
        bookmarkInputEmoji: document.getElementById('bookmarkInputEmoji'),
        bookmarkInputIconUrl: document.getElementById('bookmarkInputIconUrl'),
        bookmarkInputIconFile: document.getElementById('bookmarkInputIconFile'),
        iconPreviewAuto: document.getElementById('iconPreviewAuto'),
        iconPreviewUpload: document.getElementById('iconPreviewUpload'),
        iconLibraryGrid: document.getElementById('iconLibraryGrid'),
        uploadIconBtn: document.getElementById('uploadIconBtn'),
        saveBookmarkBtn: document.getElementById('saveBookmarkBtn'),
        cancelBookmarkBtn: document.getElementById('cancelBookmarkBtn'),
        // 搜索引擎图标库
        selectFromLibraryBtn: document.getElementById('selectFromLibraryBtn'),
        engineIconLibrary: document.getElementById('engineIconLibrary'),
        engineIconLibraryGrid: document.getElementById('engineIconLibraryGrid'),
        categoryModal: document.getElementById('categoryModal'),
        categoryModalTitle: document.getElementById('categoryModalTitle'),
        categoryModalClose: document.getElementById('categoryModalClose'),
        categoryInputName: document.getElementById('categoryInputName'),
        saveCategoryBtn: document.getElementById('saveCategoryBtn'),
        cancelCategoryBtn: document.getElementById('cancelCategoryBtn'),
        settingsBtn: document.getElementById('settingsBtn'),
        settingsModal: document.getElementById('settingsModal'),
        settingsModalClose: document.getElementById('settingsModalClose'),
        exportBtn: document.getElementById('exportBtn'),
        importBtn: document.getElementById('importBtn'),
        importFile: document.getElementById('importFile'),
        includeIconsExport: document.getElementById('includeIconsExport'),
        includeIconsWebdav: document.getElementById('includeIconsWebdav'),
        categoryList: document.getElementById('categoryList'),
        addCategoryBtn: document.getElementById('addCategoryBtn'),
        webdavUrl: document.getElementById('webdavUrl'),
        webdavUser: document.getElementById('webdavUser'),
        webdavPass: document.getElementById('webdavPass'),
        webdavPath: document.getElementById('webdavPath'),
        webdavSaveBtn: document.getElementById('webdavSaveBtn'),
        webdavUploadBtn: document.getElementById('webdavUploadBtn'),
        webdavDownloadBtn: document.getElementById('webdavDownloadBtn'),
        webdavStatus: document.getElementById('webdavStatus'),
        newCategoryInput: document.getElementById('newCategoryInput'),
        // 新增设置面板元素
        languageSelect: document.getElementById('languageSelect'),
        logoShow: document.getElementById('logoShow'),
        logoText: document.getElementById('logoText'),
        clockShow: document.getElementById('clockShow'),
        clockContainer: document.getElementById('clockContainer'),
        clockTime: document.getElementById('clockTime'),
        clockDate: document.getElementById('clockDate'),
        searchBarShow: document.getElementById('searchBarShow'),
        bookmarkFilterShow: document.getElementById('bookmarkFilterShow'),
        searchContainer: document.querySelector('.search-container'),
        // 书签搜索浮层
        bookmarkSearchBtn: document.getElementById('bookmarkSearchBtn'),
        bookmarkSearchOverlay: document.getElementById('bookmarkSearchOverlay'),
        bookmarkSearchInput: document.getElementById('bookmarkSearchInput'),
        bookmarkSearchClose: document.getElementById('bookmarkSearchClose'),
        bookmarkSearchResults: document.getElementById('bookmarkSearchResults'),
        wallpaperUrl: document.getElementById('wallpaperUrl'),
        wallpaperBlur: document.getElementById('wallpaperBlur'),
        wallpaperBlurValue: document.getElementById('wallpaperBlurValue'),
        wallpaperDim: document.getElementById('wallpaperDim'),
        wallpaperDimValue: document.getElementById('wallpaperDimValue'),
        contentMaxWidth: document.getElementById('contentMaxWidth'),
        footerShow: document.getElementById('footerShow'),
        footerText: document.getElementById('footerText'),
        footer: document.querySelector('.footer'),
        savePersonalization: document.getElementById('savePersonalization'),
        dockerList: document.getElementById('dockerList'),
        refreshDockerBtn: document.getElementById('refreshDockerBtn'),
        settingsIconLibraryGrid: document.getElementById('settingsIconLibraryGrid'),
        settingsTabs: document.querySelectorAll('.settings-tab'),
        settingsPanels: document.querySelectorAll('.settings-panel'),
    };
}

// ========================================
// 数据加载
// ========================================
const iconCache = new Map(); // 图标缓存
let iconLoadQueue = []; // 待加载图标队列
let isLoadingIcons = false; // 是否正在加载图标

async function loadData() {
    try {
        const [catRes, bmRes, engRes] = await Promise.all([
            fetch(`${API_BASE}/api/categories`),
            fetch(`${API_BASE}/api/bookmarks`), // 不含图标数据，快速加载
            fetch(`${API_BASE}/api/engines`)
        ]);

        const catData = await catRes.json();
        const bmData = await bmRes.json();
        const engData = await engRes.json();

        categories = catData.success ? catData.data : [];
        bookmarks = bmData.success ? bmData.data : [];
        engines = engData.success ? engData.data : [];

        // 设置默认搜索引擎（使用排序第一的）
        if (engines.length > 0) {
            const firstEngine = engines[0];
            currentEngine = { name: firstEngine.name, icon: firstEngine.icon, url: firstEngine.url };
        }

        // 加载 WebDAV 设置
        if (DOM.webdavUrl) {
            DOM.webdavUrl.value = localStorage.getItem('webdavUrl') || '';
            DOM.webdavUser.value = localStorage.getItem('webdavUser') || '';
            DOM.webdavPass.value = localStorage.getItem('webdavPass') || '';
            DOM.webdavPath.value = localStorage.getItem('webdavPath') || 'bookmarks/config.json';
        }
    } catch (e) {
        console.error('加载数据失败:', e);
    }
}

// 延迟加载可见书签的图标（只加载 base64 类型）
function lazyLoadVisibleIcons() {
    if (isLoadingIcons) return;

    const visibleBookmarkIds = [];
    const bookmarkElements = document.querySelectorAll('.bookmark-card[data-id]');

    bookmarkElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        // 检查是否在视口内或即将进入视口
        if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
            const id = el.dataset.id;
            if (id && !iconCache.has(id)) {
                // 只加载需要从服务器获取图标的书签（base64 类型）
                const bookmark = bookmarks.find(b => b.id == id);
                if (bookmark && bookmark.icon_type === 'base64' && !bookmark.icon_data) {
                    visibleBookmarkIds.push(id);
                }
            }
        }
    });

    if (visibleBookmarkIds.length > 0) {
        loadIconsBatch(visibleBookmarkIds);
    }
}

// 批量加载图标
async function loadIconsBatch(ids) {
    if (ids.length === 0 || isLoadingIcons) return;

    isLoadingIcons = true;
    const idsToLoad = ids.filter(id => !iconCache.has(id)).slice(0, 20); // 每次最多加载20个

    if (idsToLoad.length === 0) {
        isLoadingIcons = false;
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/bookmarks?action=icons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: idsToLoad })
        });
        const data = await res.json();

        if (data.success) {
            // 更新缓存并渲染图标
            Object.entries(data.data).forEach(([id, iconInfo]) => {
                iconCache.set(id, iconInfo);
                updateBookmarkIcon(id, iconInfo);
            });

            // 标记没有图标数据的书签
            idsToLoad.forEach(id => {
                if (!data.data[id]) {
                    iconCache.set(id, null); // 标记为已检查但无数据
                }
            });
        }
    } catch (e) {
        console.error('加载图标失败:', e);
    } finally {
        isLoadingIcons = false;
        // 继续加载剩余图标
        setTimeout(lazyLoadVisibleIcons, 100);
    }
}

// 更新单个书签的图标显示
function updateBookmarkIcon(bookmarkId, iconInfo) {
    const card = document.querySelector(`.bookmark-card[data-id="${bookmarkId}"]`);
    if (!card || !iconInfo || !iconInfo.icon_data) return;

    const iconContainer = card.querySelector('.bookmark-icon');
    if (iconContainer) {
        const existingImg = iconContainer.querySelector('img');
        if (existingImg) {
            existingImg.src = iconInfo.icon_data;
        } else {
            // 替换 emoji 为图片
            iconContainer.innerHTML = `<img src="${iconInfo.icon_data}" alt="图标" loading="lazy">`;
        }
    }
}

// ========================================
// 渲染
// ========================================
function renderAll() {
    renderCategoryNav();
    renderBookmarks();
    renderEngineDropdown();
    updateEngineDisplay();
    // 应用个性化设置
    loadPersonalization();
    // 应用语言翻译
    if (window.i18n && window.i18n.applyTranslations) {
        window.i18n.applyTranslations();
    }
    // 刷新系统状态组件
    refreshSystemStats();
}

function renderCategoryNav() {
    const allBtn = DOM.categoryNav.querySelector('[data-category="all"]');
    DOM.categoryNav.innerHTML = '';
    DOM.categoryNav.appendChild(allBtn);

    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'category-btn' + (currentCategory === cat.id ? ' active' : '');
        btn.dataset.category = cat.id;
        btn.innerHTML = `<span>${cat.name}</span>`;
        DOM.categoryNav.appendChild(btn);
    });
}

function renderBookmarks() {
    const searchTerm = currentSearch.toLowerCase().trim();
    let hasResults = false;

    DOM.bookmarksContainer.innerHTML = '';

    categories.forEach((category, idx) => {
        if (currentCategory !== 'all' && currentCategory !== category.id) return;

        const catBookmarks = bookmarks.filter(b => b.category_id === category.id);
        const filteredItems = catBookmarks.filter(item => {
            if (!searchTerm) return true;
            return item.name.toLowerCase().includes(searchTerm) ||
                (item.description && item.description.toLowerCase().includes(searchTerm)) ||
                item.url.toLowerCase().includes(searchTerm);
        });

        if (filteredItems.length === 0 && currentCategory === 'all') return;

        hasResults = true;

        const isCollapsed = collapsedCategories.has(category.id);
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

    // 渲染完成后延迟加载可见图标
    requestAnimationFrame(() => {
        setTimeout(lazyLoadVisibleIcons, 50);
    });
}

function createBookmarkCard(item, searchTerm) {
    // 如果是系统组件，渲染组件卡片
    if (item.item_type === 'component') {
        return createComponentCard(item);
    }

    const name = highlightText(item.name, searchTerm);
    const desc = highlightText(item.description || '', searchTerm);

    let iconHtml;
    // 检查缓存中是否有图标数据
    const cachedIcon = iconCache.get(item.id);
    if (cachedIcon && cachedIcon.icon_data) {
        iconHtml = `<img src="${cachedIcon.icon_data}" alt="${item.name}" loading="lazy">`;
    } else if (item.icon_type === 'url' && item.icon_data) {
        // URL 类型直接渲染，使用浏览器原生懒加载
        iconHtml = `<img src="${item.icon_data}" alt="${item.name}" loading="lazy" onerror="this.outerHTML='<span>${item.icon || '🌐'}</span>'">`;
    } else if (item.icon_type === 'base64' && item.icon_data) {
        iconHtml = `<img src="${item.icon_data}" alt="${item.name}" loading="lazy">`;
    } else if (item.icon_type === 'base64') {
        // base64 类型但还没加载数据，显示占位符
        iconHtml = `<span class="icon-placeholder">${item.icon || '🌐'}</span>`;
    } else {
        // 没有图标数据时，直接使用默认 emoji
        iconHtml = `<span>${item.icon || '🌐'}</span>`;
    }

    // 所有书签都可编辑删除
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
            </div>
        </a>
    `;
}

// 创建系统状态组件卡片
function createComponentCard(item) {
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

// 系统状态刷新
let systemStatsInterval = null;

async function refreshSystemStats() {
    const componentCards = document.querySelectorAll('.component-card');
    if (componentCards.length === 0) {
        if (systemStatsInterval) {
            clearInterval(systemStatsInterval);
            systemStatsInterval = null;
        }
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/system/stats`);
        const result = await res.json();
        if (!result.success) return;

        const { cpu, memory, disk } = result.data;

        // 格式化字节
        const formatBytes = (bytes) => {
            if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
            if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
            return (bytes / 1024).toFixed(1) + ' KB';
        };

        // 更新 CPU 组件
        document.querySelectorAll('.component-value[data-type="cpu"]').forEach(el => {
            el.textContent = cpu.usage.toFixed(1) + '%';
        });
        document.querySelectorAll('.component-progress-bar[data-type="cpu"]').forEach(el => {
            el.style.width = cpu.usage + '%';
            el.style.backgroundColor = cpu.usage > 80 ? '#ef4444' : cpu.usage > 50 ? '#f59e0b' : '#22c55e';
        });

        // 更新内存组件
        document.querySelectorAll('.component-value[data-type="memory"]').forEach(el => {
            el.textContent = `${formatBytes(memory.used)} / ${formatBytes(memory.total)}`;
        });
        document.querySelectorAll('.component-progress-bar[data-type="memory"]').forEach(el => {
            el.style.width = memory.usagePercent + '%';
            el.style.backgroundColor = memory.usagePercent > 80 ? '#ef4444' : memory.usagePercent > 50 ? '#f59e0b' : '#22c55e';
        });

        // 更新磁盘组件
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

    // 设置定时刷新
    if (!systemStatsInterval) {
        systemStatsInterval = setInterval(refreshSystemStats, 5000);
    }
}

function highlightText(text, searchTerm) {
    if (!searchTerm || !text) return text;
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderEngineDropdown() {
    const divider = DOM.engineDropdown.querySelector('.engine-dropdown-divider');
    DOM.engineDropdown.querySelectorAll('.engine-option').forEach(el => el.remove());

    engines.forEach(engine => {
        const opt = document.createElement('div');
        opt.className = 'engine-option' + (currentEngine.name === engine.name ? ' active' : '');
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

function updateEngineDisplay() {
    const icon = currentEngine.icon;
    if (icon && icon.startsWith('http')) {
        DOM.engineIcon.innerHTML = `<img src="${icon}" style="width:18px;height:18px;vertical-align:middle;">`;
    } else if (icon && icon.startsWith('data:')) {
        // base64 图标
        DOM.engineIcon.innerHTML = `<img src="${icon}" style="width:18px;height:18px;vertical-align:middle;">`;
    } else {
        // emoji 或默认图标
        DOM.engineIcon.textContent = icon || '🌐';
    }
    DOM.engineName.textContent = currentEngine.name;
}

// ========================================
// 事件绑定
// ========================================
function bindAllEvents() {
    // 搜索
    DOM.searchInput.addEventListener('input', e => { currentSearch = e.target.value; renderBookmarks(); });
    DOM.searchClear.addEventListener('click', () => { DOM.searchInput.value = ''; currentSearch = ''; renderBookmarks(); });

    // 分类切换
    DOM.categoryNav.addEventListener('click', e => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;
        DOM.categoryNav.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.category;
        renderBookmarks();
    });

    // 搜索引擎
    DOM.engineBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); DOM.engineSelector.classList.toggle('open'); });
    DOM.engineDropdown.addEventListener('click', e => {
        const opt = e.target.closest('.engine-option');
        if (opt) {
            currentEngine = { name: opt.querySelector('span:last-child').textContent, icon: opt.dataset.icon, url: opt.dataset.url };
            updateEngineDisplay();
            DOM.engineSelector.classList.remove('open');
            DOM.webSearchInput.focus();
        }
    });
    document.addEventListener('click', e => { if (!DOM.engineSelector.contains(e.target)) DOM.engineSelector.classList.remove('open'); });
    DOM.webSearchForm.addEventListener('submit', e => {
        e.preventDefault();
        const q = DOM.webSearchInput.value.trim();
        if (q) {
            window.open(currentEngine.url + encodeURIComponent(q), '_blank');
            DOM.webSearchInput.value = ''; // 搜索后清空输入框
        }
    });

    // 搜索引擎管理
    DOM.engineManageBtn.addEventListener('click', e => { e.stopPropagation(); DOM.engineSelector.classList.remove('open'); openEngineModal(); });
    DOM.modalClose.addEventListener('click', closeEngineModal);
    DOM.engineModal.addEventListener('click', e => { if (e.target === DOM.engineModal) closeEngineModal(); });
    DOM.saveEngineBtn.addEventListener('click', saveEngine);
    DOM.cancelEditBtn.addEventListener('click', resetEngineForm);
    DOM.engineList.addEventListener('click', handleEngineListClick);
    DOM.autoFetchEngineIcon.addEventListener('click', fetchEngineIcon);
    DOM.engineInputIconUrl.addEventListener('input', updateEngineIconPreviewUrl);

    // 书签操作
    DOM.bookmarksContainer.addEventListener('click', handleBookmarkClick);

    // 书签弹窗
    DOM.bookmarkModalClose.addEventListener('click', closeBookmarkModal);
    DOM.bookmarkModal.addEventListener('click', e => { if (e.target === DOM.bookmarkModal) closeBookmarkModal(); });
    DOM.cancelBookmarkBtn.addEventListener('click', closeBookmarkModal);
    DOM.saveBookmarkBtn.addEventListener('click', saveBookmark);

    // 图标选择
    document.querySelectorAll('.icon-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.icon-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.icon-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            // 只在书签弹窗内查找对应的面板
            const panel = DOM.bookmarkModal.querySelector(`.icon-panel[data-panel="${tab.dataset.type}"]`);
            if (panel) panel.classList.add('active');
            currentIconType = tab.dataset.type;
            // 切换到图标库时加载图标
            if (tab.dataset.type === 'library') {
                loadIconLibrary('bookmark');
            }
        });
    });
    DOM.uploadIconBtn.addEventListener('click', () => DOM.bookmarkInputIconFile.click());
    DOM.bookmarkInputIconFile.addEventListener('change', handleIconUpload);

    // 搜索引擎图标库按钮
    DOM.selectFromLibraryBtn.addEventListener('click', toggleEngineIconLibrary);

    // 类型切换
    if (DOM.bookmarkItemType) {
        DOM.bookmarkItemType.addEventListener('change', () => {
            const isComponent = DOM.bookmarkItemType.value === 'component';
            DOM.componentTypeGroup.style.display = isComponent ? 'block' : 'none';
            DOM.bookmarkOnlyFields.forEach(el => el.style.display = isComponent ? 'none' : 'block');
            // 重置组件的名称
            if (isComponent) {
                const componentLabels = { cpu: 'CPU 使用率', memory: '内存使用', disk: '磁盘使用' };
                DOM.bookmarkInputName.value = componentLabels[DOM.bookmarkComponentType.value] || '';
            }
        });
        DOM.bookmarkComponentType.addEventListener('change', () => {
            const componentLabels = { cpu: 'CPU 使用率', memory: '内存使用', disk: '磁盘使用' };
            DOM.bookmarkInputName.value = componentLabels[DOM.bookmarkComponentType.value] || '';
        });
    }

    // 自动获取 favicon
    DOM.bookmarkInputUrl.addEventListener('blur', fetchFavicon);

    // 分类弹窗
    DOM.categoryModalClose.addEventListener('click', closeCategoryModal);
    DOM.categoryModal.addEventListener('click', e => { if (e.target === DOM.categoryModal) closeCategoryModal(); });
    DOM.cancelCategoryBtn.addEventListener('click', closeCategoryModal);
    DOM.saveCategoryBtn.addEventListener('click', saveCategory);

    // 设置
    DOM.settingsBtn.addEventListener('click', openSettingsModal);
    DOM.settingsModalClose.addEventListener('click', closeSettingsModal);
    DOM.settingsModal.addEventListener('click', e => { if (e.target === DOM.settingsModal) closeSettingsModal(); });
    DOM.addCategoryBtn.addEventListener('click', () => openCategoryModal());

    // 书签搜索浮层
    DOM.bookmarkSearchBtn.addEventListener('click', openBookmarkSearch);
    DOM.bookmarkSearchClose.addEventListener('click', closeBookmarkSearch);
    DOM.bookmarkSearchOverlay.addEventListener('click', e => { if (e.target === DOM.bookmarkSearchOverlay) closeBookmarkSearch(); });
    DOM.bookmarkSearchInput.addEventListener('input', handleBookmarkSearch);

    // 空状态添加按钮
    if (DOM.emptyAddBookmark) {
        DOM.emptyAddBookmark.addEventListener('click', () => openBookmarkModal());
    }
    if (DOM.emptyAddCategory) {
        DOM.emptyAddCategory.addEventListener('click', () => openCategoryModal());
    }

    // 导入导出
    DOM.exportBtn.addEventListener('click', exportConfig);
    DOM.importBtn.addEventListener('click', () => DOM.importFile.click());
    DOM.importFile.addEventListener('change', importConfig);

    // WebDAV
    DOM.webdavSaveBtn.addEventListener('click', saveWebdavSettings);
    DOM.webdavUploadBtn.addEventListener('click', webdavUpload);
    DOM.webdavDownloadBtn.addEventListener('click', webdavDownload);

    // 设置标签页切换
    DOM.settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            DOM.settingsTabs.forEach(t => t.classList.remove('active'));
            DOM.settingsPanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.add('active');
            // 切换到 Docker 标签页时加载容器列表
            if (tab.dataset.tab === 'docker') loadDockerContainers();
            // 切换到图标库标签页时加载图标
            if (tab.dataset.tab === 'icons') {
                renderIconLibrary();
                bindIconLibraryManageEvents();
            }
        });
    });

    // 语言切换
    DOM.languageSelect.addEventListener('change', e => {
        if (window.i18n) {
            window.i18n.setLanguage(e.target.value);
            location.reload();
        }
    });

    // 个性化设置
    if (DOM.wallpaperBlur) {
        DOM.wallpaperBlur.addEventListener('input', e => {
            if (DOM.wallpaperBlurValue) DOM.wallpaperBlurValue.textContent = e.target.value + 'px';
        });
    }
    if (DOM.wallpaperDim) {
        DOM.wallpaperDim.addEventListener('input', e => {
            if (DOM.wallpaperDimValue) DOM.wallpaperDimValue.textContent = e.target.value + '%';
        });
    }
    if (DOM.savePersonalization) {
        DOM.savePersonalization.addEventListener('click', savePersonalization);
    }

    // Docker
    if (DOM.refreshDockerBtn) {
        DOM.refreshDockerBtn.addEventListener('click', loadDockerContainers);
    }

    // 快捷键
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); DOM.searchInput.focus(); }
        if (e.key === 'Escape') closeAllModals();
    });

    // 滚动时延迟加载图标
    let scrollTimeout = null;
    const backToTopBtn = document.getElementById('backToTop');

    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(lazyLoadVisibleIcons, 100);

        // 回到顶部按钮显示/隐藏
        if (backToTopBtn) {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }
    }, { passive: true });

    // 回到顶部按钮点击事件
    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // 窗口大小变化时重新检查可见图标
    window.addEventListener('resize', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(lazyLoadVisibleIcons, 200);
    }, { passive: true });
}

// ========================================
// Favicon 获取
// ========================================
let availableIcons = [];

// 判断是否为内网/本地地址
function isPrivateOrLocalAddress(hostname) {
    // localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    // 私有 IP 段：10.x.x.x, 172.16-31.x.x, 192.168.x.x
    const privatePatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./, // 链路本地
        /^fc00:/i,     // IPv6 私有
        /^fe80:/i      // IPv6 链路本地
    ];
    return privatePatterns.some(p => p.test(hostname));
}

async function fetchFavicon() {
    const url = DOM.bookmarkInputUrl.value.trim();
    if (!url || currentIconType !== 'auto') return;

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        DOM.iconPreviewAuto.innerHTML = '<span style="opacity:0.5">⏳</span>';

        // 内网地址直接通过后端代理获取，不使用 Google Favicon
        if (isPrivateOrLocalAddress(domain)) {
            fetchProxyFavicon(url);
            return;
        }

        // 外网地址先尝试 Google Favicon
        const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        const testImg = new Image();
        testImg.onload = function () {
            if (this.width > 1 && this.height > 1) {
                availableIcons = [googleFavicon];
                renderIconSelection();
                fetchMoreIcons(url, domain);
            } else {
                fetchProxyFavicon(url);
            }
        };
        testImg.onerror = function () { fetchProxyFavicon(url); };
        testImg.src = googleFavicon;
    } catch (e) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
    }
}

async function fetchMoreIcons(url, domain) {
    try {
        const res = await fetch(`${API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success && data.icons && data.icons.length > 0) {
            // 内网地址不添加 Google Favicon
            if (isPrivateOrLocalAddress(domain)) {
                availableIcons = data.icons;
            } else {
                const googleFavicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
                availableIcons = [...new Set([googleFavicon, ...data.icons.filter(i => i !== googleFavicon)])];
            }
            renderIconSelection();
        }
    } catch (e) { }
}

async function fetchProxyFavicon(url) {
    try {
        const res = await fetch(`${API_BASE}/api/favicon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success && data.icons && data.icons.length > 0) {
            availableIcons = data.icons;
            renderIconSelection();
        } else {
            DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        }
    } catch (e) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
    }
}

function renderIconSelection() {
    if (availableIcons.length === 0) {
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        return;
    }
    if (availableIcons.length === 1) {
        DOM.iconPreviewAuto.innerHTML = `<img src="${availableIcons[0]}" onerror="this.outerHTML='🌐'">`;
    } else {
        DOM.iconPreviewAuto.innerHTML = `<div class="icon-selection">
            ${availableIcons.slice(0, 6).map((icon, idx) =>
            `<img src="${icon}" class="icon-option ${idx === 0 ? 'selected' : ''}" data-url="${icon}" onerror="this.style.display='none'" title="点击选择">`
        ).join('')}
        </div>`;
        DOM.iconPreviewAuto.querySelectorAll('.icon-option').forEach(img => {
            img.onclick = (e) => {
                e.stopPropagation();
                DOM.iconPreviewAuto.querySelectorAll('.icon-option').forEach(i => i.classList.remove('selected'));
                img.classList.add('selected');
            };
        });
    }
}

// ========================================
// 书签 CRUD
// ========================================
let sortingCategory = null; // 当前正在排序的分类

function handleBookmarkClick(e) {
    const editBtn = e.target.closest('.bookmark-action-btn.edit');
    const deleteBtn = e.target.closest('.bookmark-action-btn.delete');
    const addBtn = e.target.closest('.header-action-btn.add-btn');
    const sortBtn = e.target.closest('.header-action-btn.sort-btn');
    const collapseBtn = e.target.closest('.collapse-btn');

    if (collapseBtn) { e.preventDefault(); e.stopPropagation(); toggleCategoryCollapse(collapseBtn.dataset.category); }
    else if (editBtn) { e.preventDefault(); e.stopPropagation(); openBookmarkModal(editBtn.dataset.id); }
    else if (deleteBtn) { e.preventDefault(); e.stopPropagation(); deleteBookmark(deleteBtn.dataset.id); }
    else if (addBtn) { e.preventDefault(); openBookmarkModal(null, addBtn.dataset.category); }
    else if (sortBtn) { e.preventDefault(); toggleBookmarkSorting(sortBtn.dataset.category); }
}

function openBookmarkModal(bookmarkId = null, categoryId = null) {
    editingBookmarkId = bookmarkId;

    // 填充分类选择 + 新建选项
    DOM.bookmarkInputCategory.innerHTML = categories.map(c =>
        `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${c.name}</option>`
    ).join('') + '<option value="__new__">+ 新建分类...</option>';

    if (bookmarkId) {
        DOM.bookmarkModalTitle.textContent = '编辑书签';
        const bookmark = bookmarks.find(b => b.id === bookmarkId);
        if (bookmark) {
            editingBookmark = bookmark; // 保存原始书签数据
            DOM.bookmarkInputName.value = bookmark.name;
            DOM.bookmarkInputUrl.value = bookmark.url;
            DOM.bookmarkInputDesc.value = bookmark.description || '';
            DOM.bookmarkInputCategory.value = bookmark.category_id;

            // 根据原图标类型设置当前图标类型，base64 类型显示为 auto
            const originalIconType = bookmark.icon_type || 'auto';
            currentIconType = (originalIconType === 'base64') ? 'auto' : originalIconType;
            currentIconData = bookmark.icon_data || '';

            // 填充对应的输入框
            if (originalIconType === 'emoji') {
                DOM.bookmarkInputEmoji.value = bookmark.icon_data || '';
            } else {
                DOM.bookmarkInputEmoji.value = '';
            }
            if (originalIconType === 'url') {
                DOM.bookmarkInputIconUrl.value = bookmark.icon_data || '';
            } else {
                DOM.bookmarkInputIconUrl.value = '';
            }

            // 显示已有图标的预览
            if (bookmark.icon_data) {
                if (originalIconType === 'base64' || originalIconType === 'url') {
                    DOM.iconPreviewAuto.innerHTML = `<img src="${bookmark.icon_data}" class="selected">`;
                } else if (originalIconType === 'emoji') {
                    DOM.iconPreviewAuto.innerHTML = `<span>${bookmark.icon_data}</span>`;
                }
            } else {
                DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
            }
            DOM.iconPreviewUpload.innerHTML = '';
        }
    } else {
        editingBookmark = null; // 新建书签
        DOM.bookmarkModalTitle.textContent = '添加书签';
        DOM.bookmarkInputName.value = '';
        DOM.bookmarkInputUrl.value = '';
        DOM.bookmarkInputDesc.value = '';
        currentIconType = 'auto';
        currentIconData = '';
        DOM.bookmarkInputEmoji.value = '';
        DOM.bookmarkInputIconUrl.value = '';
        // 重置图标预览
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        DOM.iconPreviewUpload.innerHTML = '';
    }

    // 重置图标选择器
    document.querySelectorAll('.icon-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.icon-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-type="${currentIconType}"]`)?.classList.add('active');
    // 只在书签弹窗内查找面板
    DOM.bookmarkModal.querySelector(`[data-panel="${currentIconType}"]`)?.classList.add('active');

    DOM.bookmarkModal.classList.add('open');
    document.body.style.overflow = 'hidden';

    // 监听分类选择变化
    DOM.bookmarkInputCategory.onchange = function () {
        if (this.value === '__new__') {
            const newCatName = prompt('请输入新分类名称：');
            if (newCatName && newCatName.trim()) {
                createCategoryForBookmark(newCatName.trim());
            } else {
                this.value = categories[0]?.id || '';
            }
        }
    };
}

async function createCategoryForBookmark(name) {
    try {
        const res = await fetch(`${API_BASE}/api/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon: '📁' })
        });
        const data = await res.json();
        if (data.success) {
            categories.push(data.data);
            renderCategoryNav();
            // 更新下拉框
            DOM.bookmarkInputCategory.innerHTML = categories.map(c =>
                `<option value="${c.id}">${c.icon} ${c.name}</option>`
            ).join('') + '<option value="__new__">+ 新建分类...</option>';
            DOM.bookmarkInputCategory.value = data.data.id;
        }
    } catch (e) {
        alert('创建分类失败: ' + e.message);
    }
}

function closeBookmarkModal() {
    DOM.bookmarkModal.classList.remove('open');
    document.body.style.overflow = '';
    editingBookmarkId = null;
}

async function saveBookmark() {
    const name = DOM.bookmarkInputName.value.trim();
    const url = DOM.bookmarkInputUrl.value.trim();
    const description = DOM.bookmarkInputDesc.value.trim();
    const category_id = DOM.bookmarkInputCategory.value;
    const item_type = DOM.bookmarkItemType ? DOM.bookmarkItemType.value : 'bookmark';
    const component_type = item_type === 'component' ? DOM.bookmarkComponentType.value : null;

    // 组件不需要验证 URL
    if (!name) { alert('请填写名称'); return; }
    if (item_type === 'bookmark' && !url) { alert('请填写网址'); return; }

    let icon_type = currentIconType;
    let icon_data = '';
    let icon = '🌐';

    // 组件使用默认图标
    if (item_type === 'component') {
        const componentIcons = { cpu: '💻', memory: '📊', disk: '💾' };
        icon = componentIcons[component_type] || '📊';
        icon_type = 'emoji';
        icon_data = icon;
    } else if (currentIconType === 'library') {
        // 从图标库选择
        if (currentIconData) {
            icon_type = currentIconData.startsWith('data:') ? 'base64' : 'url';
            icon_data = currentIconData;
        } else if (editingBookmark && editingBookmark.icon_data) {
            // 没有选择新图标，使用原有图标
            icon_type = editingBookmark.icon_type;
            icon_data = editingBookmark.icon_data;
        }
    } else if (currentIconType === 'emoji') {
        icon_data = DOM.bookmarkInputEmoji.value.trim() || '🌐';
        icon = icon_data;
    } else if (currentIconType === 'url') {
        // 直接保存 URL，不转换为 base64
        const iconUrl = DOM.bookmarkInputIconUrl.value.trim();
        if (iconUrl) {
            icon_type = 'url';
            icon_data = iconUrl;
        } else if (editingBookmark && editingBookmark.icon_data) {
            // 没有输入新 URL，使用原有图标
            icon_type = editingBookmark.icon_type;
            icon_data = editingBookmark.icon_data;
        }
    } else if (currentIconType === 'upload') {
        if (currentIconData) {
            icon_type = 'base64';
            icon_data = currentIconData;
        } else if (editingBookmark && editingBookmark.icon_data) {
            // 没有上传新图标，使用原有图标
            icon_type = editingBookmark.icon_type;
            icon_data = editingBookmark.icon_data;
        }
    } else if (currentIconType === 'auto') {
        // 获取选中的 favicon URL，直接保存 URL
        const selectedImg = DOM.iconPreviewAuto.querySelector('img.selected') || DOM.iconPreviewAuto.querySelector('img');
        if (selectedImg && selectedImg.src) {
            // 检查是否是 data: URL（已经是 base64）
            if (selectedImg.src.startsWith('data:')) {
                icon_type = 'base64';
                icon_data = selectedImg.src;
            } else {
                // 直接保存 URL，不转换为 base64
                icon_type = 'url';
                icon_data = selectedImg.src;
            }
        } else if (editingBookmark && editingBookmark.icon_data) {
            // 没有选择新图标，使用原有图标
            icon_type = editingBookmark.icon_type;
            icon_data = editingBookmark.icon_data;
        }
    }

    try {
        const res = await fetch(`${API_BASE}/api/bookmarks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: editingBookmarkId,
                category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type
            })
        });

        if (res.ok) {
            await loadData();
            renderAll();
            refreshIconLibraryCache(); // 刷新图标库缓存
            closeBookmarkModal();
        } else {
            const err = await res.json();
            alert('保存失败: ' + err.error);
        }
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

async function deleteBookmark(id) {
    if (!confirm('确定删除此书签？')) return;

    try {
        await fetch(`${API_BASE}/api/bookmarks?id=${id}`, { method: 'DELETE' });
        await loadData();
        renderAll();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

// 书签排序功能
function toggleBookmarkSorting(categoryId) {
    const section = document.querySelector(`.category-section[data-category-id="${categoryId}"]`);
    if (!section) return;

    const grid = section.querySelector('.bookmarks-grid');
    const sortBtn = section.querySelector('.sort-btn');

    if (sortingCategory === categoryId) {
        // 关闭排序模式
        sortingCategory = null;
        grid.classList.remove('sorting-mode');
        sortBtn.classList.remove('active');
        // 移除保存按钮
        const saveBtn = section.querySelector('.save-sort-btn');
        if (saveBtn) saveBtn.remove();
    } else {
        // 开启排序模式
        sortingCategory = categoryId;
        grid.classList.add('sorting-mode');
        sortBtn.classList.add('active');

        // 添加保存排序按钮
        const header = section.querySelector('.category-header');
        if (!section.querySelector('.save-sort-btn')) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary save-sort-btn';
            saveBtn.innerHTML = '💾 保存排序';
            saveBtn.onclick = () => saveBookmarkOrder(categoryId);
            header.insertAdjacentElement('afterend', saveBtn);
        }

        enableBookmarkDrag(grid, categoryId);
    }
}

function enableBookmarkDrag(grid, categoryId) {
    let draggedItem = null;

    const cards = grid.querySelectorAll('.bookmark-card, .component-card');
    cards.forEach(card => {
        card.draggable = true;

        card.ondragstart = (e) => {
            draggedItem = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        };

        card.ondragend = () => {
            card.classList.remove('dragging');
            draggedItem = null;
        };

        card.ondragover = (e) => {
            e.preventDefault();
            if (!draggedItem || draggedItem === card) return;

            const rect = card.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            if (e.clientX < midX) {
                grid.insertBefore(draggedItem, card);
            } else {
                grid.insertBefore(draggedItem, card.nextSibling);
            }
        };
    });
}

async function saveBookmarkOrder(categoryId) {
    const section = document.querySelector(`.category-section[data-category-id="${categoryId}"]`);
    const grid = section.querySelector('.bookmarks-grid');
    const cards = grid.querySelectorAll('.bookmark-card, .component-card');

    const order = Array.from(cards).map((card, index) => ({
        id: card.dataset.id,
        sort_order: index
    }));

    try {
        await fetch(`${API_BASE}/api/bookmarks`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });

        // 关闭排序模式
        toggleBookmarkSorting(categoryId);

        // 重新加载数据
        await loadData();
        renderAll();
    } catch (e) {
        alert('保存排序失败: ' + e.message);
    }
}

function handleIconUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        currentIconData = reader.result;
        DOM.iconPreviewUpload.innerHTML = `<img src="${reader.result}">`;
    };
    reader.readAsDataURL(file);
}

// ========================================
// 图标库功能
// ========================================
let iconLibraryCache = null;
let selectedLibraryIcon = null;

async function loadIconLibrary(target = 'bookmark') {
    const gridElement = target === 'bookmark' ? DOM.iconLibraryGrid : DOM.engineIconLibraryGrid;

    // 显示加载状态
    gridElement.innerHTML = '<div class="icon-library-loading">加载中...</div>';

    try {
        // 使用缓存或重新加载
        if (!iconLibraryCache) {
            const res = await fetch(`${API_BASE}/api/icons`);
            const data = await res.json();
            if (data.success) {
                iconLibraryCache = data.data;
            }
        }

        if (!iconLibraryCache || iconLibraryCache.length === 0) {
            gridElement.innerHTML = '<div class="icon-library-empty">暂无已保存的图标</div>';
            return;
        }

        // 渲染图标网格
        gridElement.innerHTML = iconLibraryCache.map((icon, index) => `
            <div class="icon-library-item" data-index="${index}" data-icon="${encodeURIComponent(icon.data)}" title="${icon.source || '未知来源'}">
                <img src="${icon.data}" alt="图标" onerror="this.parentElement.style.display='none'">
            </div>
        `).join('');

        // 绑定点击事件
        gridElement.querySelectorAll('.icon-library-item').forEach(item => {
            item.addEventListener('click', () => {
                // 移除其他选中状态
                gridElement.querySelectorAll('.icon-library-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                const iconData = decodeURIComponent(item.dataset.icon);
                selectedLibraryIcon = iconData;

                if (target === 'bookmark') {
                    // 书签：设置图标类型和数据
                    currentIconType = 'library';
                    currentIconData = iconData;
                } else {
                    // 搜索引擎：更新预览和输入框
                    DOM.engineIconPreview.innerHTML = `<img src="${iconData}">`;
                    DOM.engineInputIconUrl.value = iconData.startsWith('data:') ? '' : iconData;
                    DOM.engineIconPreview.dataset.iconUrl = iconData;
                }
            });
        });

    } catch (e) {
        gridElement.innerHTML = '<div class="icon-library-empty">加载失败</div>';
    }
}

function toggleEngineIconLibrary() {
    const isVisible = DOM.engineIconLibrary.style.display !== 'none';
    if (isVisible) {
        DOM.engineIconLibrary.style.display = 'none';
    } else {
        DOM.engineIconLibrary.style.display = 'block';
        loadIconLibrary('engine');
    }
}

// 刷新图标库缓存
function refreshIconLibraryCache() {
    iconLibraryCache = null;
}

// ========================================
// 分类管理
// ========================================
function openCategoryModal(categoryId = null) {
    editingCategoryId = categoryId;

    if (categoryId) {
        DOM.categoryModalTitle.textContent = '编辑分类';
        const cat = categories.find(c => c.id === categoryId);
        if (cat) {
            DOM.categoryInputName.value = cat.name;
        }
    } else {
        DOM.categoryModalTitle.textContent = '添加分类';
        DOM.categoryInputName.value = '';
    }

    DOM.categoryModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeCategoryModal() {
    DOM.categoryModal.classList.remove('open');
    document.body.style.overflow = '';
    editingCategoryId = null;
}

async function saveCategory() {
    const name = DOM.categoryInputName.value.trim();
    const icon = '📁'; // 默认图标

    if (!name) { alert('请填写分类名称'); return; }

    try {
        await fetch(`${API_BASE}/api/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingCategoryId, name, icon })
        });
        await loadData();
        renderAll();
        renderCategoryList();
        closeCategoryModal();
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

async function deleteCategory(id) {
    if (!confirm('确定删除此分类？分类下的书签也将被删除。')) return;

    try {
        await fetch(`${API_BASE}/api/categories?id=${id}`, { method: 'DELETE' });
        await loadData();
        renderAll();
        renderCategoryList();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

function renderCategoryList() {
    DOM.categoryList.innerHTML = categories.map((c, index) => `
        <div class="category-list-item" data-id="${c.id}" data-index="${index}" draggable="true">
            <span class="drag-handle" title="拖拽排序">⋮⋮</span>
            <span class="category-list-name">${c.name}</span>
            <button class="engine-action-btn edit" data-id="${c.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="engine-action-btn delete" data-id="${c.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
    `).join('');

    // 点击事件
    DOM.categoryList.onclick = e => {
        const editBtn = e.target.closest('.engine-action-btn.edit');
        const deleteBtn = e.target.closest('.engine-action-btn.delete');
        if (editBtn) openCategoryModal(editBtn.dataset.id);
        if (deleteBtn) deleteCategory(deleteBtn.dataset.id);
    };

    // 拖拽排序
    let draggedItem = null;

    DOM.categoryList.querySelectorAll('.category-list-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
            saveCategoryOrder();
        });

        item.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedItem || draggedItem === item) return;

            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            if (e.clientY < midY) {
                item.parentNode.insertBefore(draggedItem, item);
            } else {
                item.parentNode.insertBefore(draggedItem, item.nextSibling);
            }
        });
    });
}

async function saveCategoryOrder() {
    const items = DOM.categoryList.querySelectorAll('.category-list-item');
    const order = Array.from(items).map((item, index) => ({
        id: item.dataset.id,
        sort_order: index
    }));

    try {
        await fetch(`${API_BASE}/api/categories`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });
        await loadData();
        renderCategoryNav();
        renderBookmarks();
    } catch (e) {
        console.error('保存排序失败:', e);
    }
}

// ========================================
// 图标库管理（设置面板）
// ========================================
let selectedIcons = new Set(); // 选中的图标 ID

async function renderIconLibrary() {
    if (!DOM.settingsIconLibraryGrid) return;

    // 显示加载状态
    DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-loading">加载中...</div>';

    try {
        // 从 API 获取图标数据（每次都刷新）
        const res = await fetch(`${API_BASE}/api/icons`);
        const data = await res.json();
        if (data.success) {
            iconLibraryCache = data.data;
        }

        updateIconLibraryCount();

        if (!iconLibraryCache || iconLibraryCache.length === 0) {
            DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-empty">暂无图标，请上传或添加书签</div>';
            return;
        }

        // 为没有ID的图标生成临时ID
        iconLibraryCache.forEach((icon, index) => {
            if (!icon.id) {
                icon.id = `temp_${index}_${Date.now()}`;
                icon.isTemp = true; // 标记为临时ID（来自书签）
            }
        });

        DOM.settingsIconLibraryGrid.innerHTML = iconLibraryCache.map((icon, index) => `
            <div class="icon-library-item ${selectedIcons.has(icon.id) ? 'selected' : ''}"
                 data-index="${index}"
                 data-id="${icon.id}"
                 data-icon="${encodeURIComponent(icon.data)}"
                 data-temp="${icon.isTemp || false}"
                 title="${icon.source || '未知来源'}${icon.uploaded ? ' (已上传)' : ' (来自书签)'}">
                <input type="checkbox" class="icon-checkbox" data-id="${icon.id}" ${selectedIcons.has(icon.id) ? 'checked' : ''} onchange="handleIconCheckboxChange(event, '${icon.id}')">
                <img src="${icon.data}" alt="图标" onclick="handleIconItemClick(event)" onerror="this.parentElement.style.display='none'">
                <button type="button" class="icon-delete-btn" title="删除" onclick="handleIconDelete('${icon.id}', ${icon.isTemp || false})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
        `).join('');
    } catch (err) {
        console.error('加载图标库失败:', err);
        DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-empty">加载图标库失败</div>';
    }
}

// 全局图标库事件处理函数（供内联事件调用）
window.handleIconCheckboxChange = function(event, iconId) {
    const checkbox = event.target;
    const item = checkbox.closest('.icon-library-item');

    if (iconId) {
        if (checkbox.checked) {
            selectedIcons.add(iconId);
            if (item) item.classList.add('selected');
        } else {
            selectedIcons.delete(iconId);
            if (item) item.classList.remove('selected');
        }
        updateBatchDeleteButton();
    }
};

window.handleIconDelete = async function(iconId, isTemp) {
    if (!iconId) return;

    if (isTemp) {
        // 来自书签的图标，需要从书签中清除
        if (!confirm('此图标来自书签，删除后将清除使用此图标的书签的图标数据。确定要删除吗？')) {
            return;
        }
        // 获取图标数据用于匹配
        const item = document.querySelector(`.icon-library-item[data-id="${iconId}"]`);
        if (!item) return;
        const iconData = decodeURIComponent(item.dataset.icon);

        try {
            const res = await fetch(`${API_BASE}/api/icons?action=clear-from-bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iconData })
            });
            const data = await res.json();
            if (data.success) {
                selectedIcons.delete(iconId);
                await renderIconLibrary();
                updateBatchDeleteButton();
            } else {
                alert('删除失败: ' + data.error);
            }
        } catch (e) {
            alert('删除失败: ' + e.message);
        }
    } else {
        // 手动上传的图标，直接从图标库删除
        if (!confirm('确定要删除此图标吗？')) {
            return;
        }
        selectedIcons.delete(iconId);
        await deleteIconFromLibrary(iconId);
        updateBatchDeleteButton();
    }
};

window.handleIconItemClick = async function(event) {
    // 复制图标数据到剪贴板
    const item = event.target.closest('.icon-library-item');
    if (!item) return;

    const iconData = decodeURIComponent(item.dataset.icon);
    try {
        await navigator.clipboard.writeText(iconData);
        item.classList.add('copied');
        setTimeout(() => item.classList.remove('copied'), 1000);
    } catch {
        console.log('复制失败');
    }
};

// 全选图标
window.selectAllIcons = function(checked) {
    selectedIcons.clear();

    const checkboxes = DOM.settingsIconLibraryGrid?.querySelectorAll('.icon-checkbox');
    if (!checkboxes) return;

    checkboxes.forEach(checkbox => {
        const iconId = checkbox.dataset.id;
        const item = checkbox.closest('.icon-library-item');

        checkbox.checked = checked;

        if (checked && iconId) {
            selectedIcons.add(iconId);
            if (item) item.classList.add('selected');
        } else {
            if (item) item.classList.remove('selected');
        }
    });

    updateBatchDeleteButton();
};

function updateIconLibraryCount() {
    const countEl = document.getElementById('iconLibraryCount');
    if (countEl && iconLibraryCache) {
        const uploadedCount = iconLibraryCache.filter(i => i.uploaded).length;
        const totalCount = iconLibraryCache.length;
        countEl.textContent = `${totalCount} 个图标 (${uploadedCount} 个已上传)`;
    }
}

function updateBatchDeleteButton() {
    const btn = document.getElementById('iconBatchDeleteBtn');
    if (btn) {
        btn.disabled = selectedIcons.size === 0;
        btn.textContent = selectedIcons.size > 0 ? `删除选中 (${selectedIcons.size})` : '删除选中';
    }
}

async function deleteIconFromLibrary(iconId) {
    try {
        const res = await fetch(`${API_BASE}/api/icons?id=${iconId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            selectedIcons.delete(iconId);
            await renderIconLibrary();
        } else {
            alert('删除失败: ' + data.error);
        }
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

async function batchDeleteIcons() {
    if (selectedIcons.size === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedIcons.size} 个图标吗？`)) return;

    try {
        // 分离真实 ID 和临时 ID（来自书签的图标）
        const realIds = [];
        const tempIconsData = [];

        for (const iconId of selectedIcons) {
            if (iconId.startsWith('temp_')) {
                // 临时 ID，需要获取图标数据来清除书签中的图标
                const item = document.querySelector(`.icon-library-item[data-id="${iconId}"]`);
                if (item) {
                    const iconData = decodeURIComponent(item.dataset.icon);
                    tempIconsData.push(iconData);
                }
            } else {
                realIds.push(iconId);
            }
        }

        let hasError = false;

        // 删除真实图标（从图标库表中删除）
        if (realIds.length > 0) {
            const res = await fetch(`${API_BASE}/api/icons?action=batch-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: realIds })
            });
            const data = await res.json();
            if (!data.success) {
                hasError = true;
                alert('删除图标库图标失败: ' + data.error);
            }
        }

        // 清除来自书签的图标（从书签中清除图标数据）
        if (tempIconsData.length > 0) {
            const res = await fetch(`${API_BASE}/api/icons?action=batch-clear-from-bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iconDataList: tempIconsData })
            });
            const data = await res.json();
            if (!data.success) {
                hasError = true;
                alert('清除书签图标失败: ' + data.error);
            }
        }

        if (!hasError) {
            selectedIcons.clear();
            await renderIconLibrary();
            updateBatchDeleteButton();
        }
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

async function uploadIconToLibrary(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const res = await fetch(`${API_BASE}/api/icons`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        data: e.target.result,
                        type: 'base64'
                    })
                });
                const data = await res.json();
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.error));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

async function uploadIconFromUrl(url) {
    try {
        const res = await fetch(`${API_BASE}/api/icons?action=from-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success) {
            return data.data;
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        throw e;
    }
}

function bindIconLibraryManageEvents() {
    // 上传按钮
    const uploadBtn = document.getElementById('iconLibraryUploadBtn');
    const fileInput = document.getElementById('iconLibraryFileInput');

    if (uploadBtn && fileInput) {
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files.length) return;

            uploadBtn.disabled = true;
            uploadBtn.textContent = '上传中...';

            try {
                for (const file of files) {
                    await uploadIconToLibrary(file);
                }
                await renderIconLibrary();
            } catch (err) {
                alert('上传失败: ' + err.message);
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17,8 12,3 7,8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    上传图片
                `;
                fileInput.value = '';
            }
        };
    }

    // URL 添加按钮
    const urlInput = document.getElementById('iconLibraryUrlInput');
    const urlBtn = document.getElementById('iconLibraryUrlBtn');

    if (urlInput && urlBtn) {
        urlBtn.onclick = async () => {
            const url = urlInput.value.trim();
            if (!url) {
                alert('请输入图标 URL');
                return;
            }

            urlBtn.disabled = true;
            urlBtn.textContent = '添加中...';

            try {
                await uploadIconFromUrl(url);
                urlInput.value = '';
                await renderIconLibrary();
            } catch (err) {
                alert('添加失败: ' + err.message);
            } finally {
                urlBtn.disabled = false;
                urlBtn.textContent = '从 URL 添加';
            }
        };
    }

    // 全选复选框 - 使用内联事件处理，这里不需要绑定

    // 批量删除按钮
    const batchDeleteBtn = document.getElementById('iconBatchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.onclick = batchDeleteIcons;
    }
}

// ========================================
// 搜索引擎管理
// ========================================
function openEngineModal() {
    renderEngineList();
    resetEngineForm();
    DOM.engineModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeEngineModal() {
    DOM.engineModal.classList.remove('open');
    document.body.style.overflow = '';
}

function renderEngineList() {
    DOM.engineList.innerHTML = engines.map((e, index) => {
        const iconHtml = e.icon && (e.icon.startsWith('http') || e.icon.startsWith('data:'))
            ? `<img src="${e.icon}" style="width:20px;height:20px;">`
            : e.icon || '🔍';
        return `
        <div class="engine-list-item" draggable="true" data-id="${e.id}" data-index="${index}">
            <div class="engine-drag-handle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/>
                    <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                    <circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>
                </svg>
            </div>
            <div class="engine-list-icon">${iconHtml}</div>
            <div class="engine-list-info">
                <div class="engine-list-name">${e.name}${index === 0 ? ' <span class="engine-default-badge">默认</span>' : ''}</div>
                <div class="engine-list-url">${e.url}</div>
            </div>
            <div class="engine-list-actions">
                <button class="engine-action-btn edit" data-id="${e.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="engine-action-btn delete" data-id="${e.id}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
        </div>
    `;
    }).join('');

    // 绑定拖拽事件
    initEngineDragSort();
}

function handleEngineListClick(e) {
    const editBtn = e.target.closest('.engine-action-btn.edit');
    const deleteBtn = e.target.closest('.engine-action-btn.delete');
    if (editBtn) editEngine(editBtn.dataset.id);
    if (deleteBtn) deleteEngine(deleteBtn.dataset.id);
}

function editEngine(id) {
    const engine = engines.find(e => e.id === id);
    if (!engine) return;
    editingEngineId = id;
    DOM.engineInputName.value = engine.name;
    DOM.engineInputUrl.value = engine.url;

    // 处理图标：显示当前图标
    if (engine.icon && engine.icon.startsWith('http')) {
        DOM.engineIconPreview.innerHTML = `<img src="${engine.icon}">`;
        DOM.engineInputIconUrl.value = engine.icon;
    } else {
        DOM.engineIconPreview.innerHTML = `<span>${engine.icon || '🔍'}</span>`;
        DOM.engineInputIconUrl.value = '';
    }

    DOM.formTitle.textContent = '编辑搜索引擎';
    DOM.saveEngineBtnText.textContent = '保存';
    DOM.cancelEditBtn.style.display = 'inline-flex';
}

async function saveEngine() {
    const name = DOM.engineInputName.value.trim();
    const url = DOM.engineInputUrl.value.trim();
    // 优先使用手动输入的图标 URL，否则使用已自动获取的（存储在 dataset 中），默认 🔍
    let icon = DOM.engineInputIconUrl.value.trim();
    if (!icon && DOM.engineIconPreview.dataset.iconUrl) {
        icon = DOM.engineIconPreview.dataset.iconUrl;
    }
    icon = icon || '🔍';
    const searchUrl = DOM.engineInputUrl.value.trim();

    if (!name || !url) { alert('请填写名称和 URL'); return; }

    try {
        await fetch(`${API_BASE}/api/engines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: editingEngineId, name, icon, url })
        });
        await loadData();
        renderEngineDropdown();
        renderEngineList();
        refreshIconLibraryCache(); // 刷新图标库缓存
        resetEngineForm();
        DOM.engineIconLibrary.style.display = 'none'; // 关闭图标库面板
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

async function deleteEngine(id) {
    if (!confirm('确定删除？')) return;
    try {
        await fetch(`${API_BASE}/api/engines?id=${id}`, { method: 'DELETE' });
        await loadData();
        renderEngineDropdown();
        renderEngineList();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

function resetEngineForm() {
    editingEngineId = null;
    DOM.engineInputName.value = '';
    DOM.engineInputIconUrl.value = '';
    DOM.engineInputUrl.value = '';
    DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
    delete DOM.engineIconPreview.dataset.iconUrl;
    DOM.formTitle.textContent = '添加搜索引擎';
    DOM.saveEngineBtnText.textContent = '添加';
    DOM.cancelEditBtn.style.display = 'none';
    DOM.engineIconLibrary.style.display = 'none'; // 关闭图标库面板
}

// 搜索引擎拖拽排序
function initEngineDragSort() {
    const items = DOM.engineList.querySelectorAll('.engine-list-item');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
            // 保存新顺序
            saveEngineOrder();
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedItem || draggedItem === item) return;

            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            if (e.clientY < midY) {
                item.parentNode.insertBefore(draggedItem, item);
            } else {
                item.parentNode.insertBefore(draggedItem, item.nextSibling);
            }
        });
    });
}

async function saveEngineOrder() {
    const items = DOM.engineList.querySelectorAll('.engine-list-item');
    const orders = [];

    items.forEach((item, index) => {
        orders.push({ id: item.dataset.id, sort_order: index });
    });

    try {
        await fetch(`${API_BASE}/api/engines`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orders })
        });

        // 重新加载数据并更新界面
        await loadData();
        renderEngineDropdown();
        renderEngineList();
        updateEngineDisplay();
    } catch (e) {
        console.error('保存排序失败:', e);
    }
}

// 自动获取搜索引擎图标
async function fetchEngineIcon() {
    const url = DOM.engineInputUrl.value.trim();
    if (!url) {
        alert('请先输入搜索 URL');
        return;
    }

    try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        DOM.engineIconPreview.innerHTML = '<span style="opacity:0.5">⏳</span>';

        // 内网地址直接尝试 /favicon.ico，外网使用 Google Favicon
        const faviconUrl = isPrivateOrLocalAddress(domain)
            ? `${parsedUrl.origin}/favicon.ico`
            : `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

        const testImg = new Image();
        testImg.onload = function () {
            DOM.engineIconPreview.innerHTML = `<img src="${faviconUrl}">`;
            DOM.engineIconPreview.dataset.iconUrl = faviconUrl;
        };
        testImg.onerror = function () {
            DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
            delete DOM.engineIconPreview.dataset.iconUrl;
            alert('自动获取图标失败，请手动输入图标 URL');
        };
        testImg.src = faviconUrl;
    } catch (e) {
        alert('URL 格式不正确');
    }
}

// 手动输入图标 URL 时更新预览
function updateEngineIconPreviewUrl() {
    const url = DOM.engineInputIconUrl.value.trim();
    if (url) {
        DOM.engineIconPreview.innerHTML = `<img src="${url}" alt="图标" onerror="this.parentElement.innerHTML='<span>❌</span>'">`;
        delete DOM.engineIconPreview.dataset.iconUrl; // 手动输入优先，清除自动获取的
    } else {
        // 如果清空了输入框，检查是否有自动获取的图标
        if (DOM.engineIconPreview.dataset.iconUrl) {
            DOM.engineIconPreview.innerHTML = `<img src="${DOM.engineIconPreview.dataset.iconUrl}">`;
        } else {
            DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
        }
    }
}

// ========================================
// 设置弹窗
// ========================================
function openSettingsModal() {
    renderCategoryList();
    loadPersonalization();
    // 设置语言选择器
    if (window.i18n) {
        DOM.languageSelect.value = window.i18n.getLanguage();
    }
    DOM.settingsModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeSettingsModal() {
    DOM.settingsModal.classList.remove('open');
    document.body.style.overflow = '';
}

function closeAllModals() {
    [DOM.engineModal, DOM.bookmarkModal, DOM.categoryModal, DOM.settingsModal, DOM.bookmarkSearchOverlay].forEach(m => m?.classList.remove('open'));
    document.body.style.overflow = '';
}

// ========================================
// Docker 容器管理
// ========================================
async function loadDockerContainers() {
    DOM.dockerList.innerHTML = '<div class="docker-loading">加载中...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/docker/containers`);
        const result = await res.json();

        if (!result.success || !result.data || result.data.length === 0) {
            DOM.dockerList.innerHTML = `<div class="docker-loading">${result.error || '没有找到容器'}</div>`;
            return;
        }

        DOM.dockerList.innerHTML = result.data.map(c => `
            <div class="docker-item" data-id="${c.id}">
                <div class="docker-item-info">
                    <div class="docker-item-name">${c.name}</div>
                    <div class="docker-item-image">${c.image}</div>
                </div>
                <span class="docker-status ${c.status === 'running' ? 'running' : 'stopped'}">
                    ${c.status === 'running' ? '运行中' : '已停止'}
                </span>
                <div class="docker-actions">
                    <label class="switch">
                        <input type="checkbox" ${c.status === 'running' ? 'checked' : ''} onchange="toggleContainer('${c.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                    <button class="btn btn-secondary btn-sm" onclick="restartContainer('${c.id}')">🔄</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        DOM.dockerList.innerHTML = '<div class="docker-loading">无法连接 Docker</div>';
    }
}

async function toggleContainer(id, start) {
    const action = start ? 'start' : 'stop';
    try {
        await fetch(`${API_BASE}/api/docker/containers/${id}/${action}`, { method: 'POST' });
        setTimeout(loadDockerContainers, 1000);
    } catch (e) {
        alert('操作失败: ' + e.message);
    }
}

async function restartContainer(id) {
    try {
        await fetch(`${API_BASE}/api/docker/containers/${id}/restart`, { method: 'POST' });
        setTimeout(loadDockerContainers, 1000);
    } catch (e) {
        alert('重启失败: ' + e.message);
    }
}

// ========================================
// 个性化设置
// ========================================
async function loadPersonalization() {
    try {
        const res = await fetch(`${API_BASE}/api/config`);
        const result = await res.json();
        if (result.success && result.data) {
            const config = result.data;
            if (DOM.logoShow) DOM.logoShow.checked = config.logoShow !== false;
            if (DOM.logoText) DOM.logoText.value = config.logoText || '书签导航';
            if (DOM.clockShow) DOM.clockShow.checked = config.clockShow || false;
            if (DOM.searchBarShow) DOM.searchBarShow.checked = config.searchBarShow !== false;
            if (DOM.bookmarkFilterShow) DOM.bookmarkFilterShow.checked = config.bookmarkFilterShow !== false;
            if (DOM.wallpaperUrl) DOM.wallpaperUrl.value = config.wallpaperUrl || '';
            if (DOM.wallpaperBlur) DOM.wallpaperBlur.value = config.wallpaperBlur || 0;
            if (DOM.wallpaperBlurValue) DOM.wallpaperBlurValue.textContent = (config.wallpaperBlur || 0) + 'px';
            if (DOM.wallpaperDim) DOM.wallpaperDim.value = config.wallpaperDim || 30;
            if (DOM.wallpaperDimValue) DOM.wallpaperDimValue.textContent = (config.wallpaperDim || 30) + '%';
            if (DOM.contentMaxWidth) DOM.contentMaxWidth.value = config.contentMaxWidth || 1200;
            if (DOM.footerShow) DOM.footerShow.checked = config.footerShow !== false;
            if (DOM.footerText) DOM.footerText.value = config.footerText || '© 2024 书签导航 · 快捷访问常用网站';
            applyPersonalization(config);
        }
    } catch (e) {
        console.error('加载个性化设置失败:', e);
    }
}

async function savePersonalization() {
    const config = {
        logoShow: DOM.logoShow ? DOM.logoShow.checked : true,
        logoText: DOM.logoText ? DOM.logoText.value : '书签导航',
        clockShow: DOM.clockShow ? DOM.clockShow.checked : false,
        searchBarShow: DOM.searchBarShow ? DOM.searchBarShow.checked : true,
        bookmarkFilterShow: DOM.bookmarkFilterShow ? DOM.bookmarkFilterShow.checked : true,
        wallpaperUrl: DOM.wallpaperUrl ? DOM.wallpaperUrl.value : '',
        wallpaperBlur: DOM.wallpaperBlur ? parseInt(DOM.wallpaperBlur.value) : 0,
        wallpaperDim: DOM.wallpaperDim ? parseInt(DOM.wallpaperDim.value) : 30,
        contentMaxWidth: DOM.contentMaxWidth ? parseInt(DOM.contentMaxWidth.value) : 1200,
        footerShow: DOM.footerShow ? DOM.footerShow.checked : true,
        footerText: DOM.footerText ? DOM.footerText.value : '© 2024 书签导航 · 快捷访问常用网站'
    };

    try {
        await fetch(`${API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        applyPersonalization(config);
        alert('保存成功！');
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

function applyPersonalization(config) {
    // LOGO
    const logo = document.querySelector('.site-title');
    if (logo) {
        logo.style.display = config.logoShow ? '' : 'none';
        logo.textContent = config.logoText || '书签导航';
    }

    // 搜索栏
    const searchForm = document.querySelector('.web-search-form');
    if (searchForm) searchForm.style.display = config.searchBarShow ? '' : 'none';

    // 书签过滤输入框
    if (DOM.searchContainer) {
        DOM.searchContainer.style.display = config.bookmarkFilterShow !== false ? '' : 'none';
    }

    // 时钟
    if (DOM.clockContainer) {
        DOM.clockContainer.style.display = config.clockShow ? 'block' : 'none';
        if (config.clockShow) {
            startClock();
        }
    }

    // 壁纸
    const wallpaperLayer = document.getElementById('wallpaperLayer');
    const wallpaperImage = document.getElementById('wallpaperImage');
    const wallpaperOverlay = document.getElementById('wallpaperOverlay');
    const bgDecoration = document.getElementById('bgDecoration');

    if (config.wallpaperUrl) {
        // 显示壁纸层
        wallpaperLayer.classList.add('active');
        wallpaperImage.style.backgroundImage = `url(${config.wallpaperUrl})`;

        // 应用模糊效果
        const blur = config.wallpaperBlur || 0;
        wallpaperOverlay.style.backdropFilter = `blur(${blur}px)`;
        wallpaperOverlay.style.webkitBackdropFilter = `blur(${blur}px)`;

        // 应用暗化效果
        const dim = config.wallpaperDim || 30;
        wallpaperOverlay.style.background = `rgba(0, 0, 0, ${dim / 100})`;

        // 隐藏默认背景装饰
        if (bgDecoration) bgDecoration.style.display = 'none';

        // 清除 body 上可能存在的旧样式
        document.body.style.backgroundImage = '';
    } else {
        // 隐藏壁纸层
        wallpaperLayer.classList.remove('active');
        wallpaperImage.style.backgroundImage = '';

        // 显示默认背景装饰
        if (bgDecoration) bgDecoration.style.display = '';

        // 清除 body 上可能存在的旧样式
        document.body.style.backgroundImage = '';
    }

    // 内容区域最大宽度
    const container = document.querySelector('.container');
    if (container) container.style.maxWidth = (config.contentMaxWidth || 1200) + 'px';

    // 页脚版权信息
    if (DOM.footer) {
        DOM.footer.style.display = config.footerShow !== false ? '' : 'none';
        const footerP = DOM.footer.querySelector('p');
        if (footerP) {
            footerP.textContent = config.footerText || '© 2024 书签导航 · 快捷访问常用网站';
        }
    }
}

// 时钟功能
let clockInterval = null;

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    if (DOM.clockTime) {
        DOM.clockTime.textContent = `${hours}:${minutes}`;
    }

    if (DOM.clockDate) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const month = now.getMonth() + 1;
        const date = now.getDate();
        const weekday = weekdays[now.getDay()];
        DOM.clockDate.textContent = `${month}-${date} 星期${weekday}`;
    }
}

function startClock() {
    if (clockInterval) return;
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

// ========================================
// 导入导出
// ========================================
async function exportConfig() {
    try {
        const includeIcons = DOM.includeIconsExport?.checked ?? true;
        const res = await fetch(`${API_BASE}/api/data?includeIcons=${includeIcons}`);
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const suffix = includeIcons ? '' : '_lite';
        a.download = `bookmarks${suffix}_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('导出失败: ' + e.message);
    }
}

async function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const data = JSON.parse(reader.result);

            // 检查文件大小
            const jsonStr = JSON.stringify(data);
            const sizeInMB = new Blob([jsonStr]).size / (1024 * 1024);

            // 如果超过 4MB，需要清理图标或分批导入
            if (sizeInMB > 4) {
                const choice = confirm(
                    `导入文件较大 (${sizeInMB.toFixed(1)}MB)，超出 Vercel 免费版 4.5MB 限制。\n\n` +
                    `点击"确定"：清理 base64 图标后导入（URL 和 emoji 图标会保留）\n` +
                    `点击"取消"：取消导入\n\n` +
                    `提示：导入后可使用"批量获取图标"功能重新获取被清理的图标`
                );

                if (!choice) {
                    alert('导入已取消');
                    return;
                }

                // 只清理 base64 图标数据，保留 URL 和 emoji 图标
                if (data.bookmarks) {
                    data.bookmarks = data.bookmarks.map(b => {
                        // 如果是 base64 类型，清理图标数据
                        if (b.icon_type === 'base64' || (b.icon_data && b.icon_data.startsWith('data:'))) {
                            return {
                                ...b,
                                icon: b.icon || '🌐',
                                icon_type: 'auto',
                                icon_data: ''
                            };
                        }
                        // URL 和 emoji 类型保持不变
                        return b;
                    });
                }
                // 搜索引擎：只清理 base64 图标，保留 URL 和 emoji
                if (data.engines) {
                    data.engines = data.engines.map(e => {
                        // 如果图标是 base64 格式，清理掉
                        if (e.icon && e.icon.startsWith('data:')) {
                            return {
                                ...e,
                                icon: '🔍'
                            };
                        }
                        // URL 和 emoji 图标保持不变
                        return e;
                    });
                }

                // 再次检查大小
                const cleanedSize = new Blob([JSON.stringify(data)]).size / (1024 * 1024);
                if (cleanedSize > 4) {
                    alert(`清理后仍然较大 (${cleanedSize.toFixed(1)}MB)，请减少书签数量或联系管理员`);
                    return;
                }
            }

            const res = await fetch(`${API_BASE}/api/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || `HTTP ${res.status}`);
            }
            await loadData();
            renderAll();
            // 导入后重新加载个性化设置
            await loadPersonalization();
            // 刷新图标库缓存
            refreshIconLibraryCache();
            alert('导入成功！');
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ========================================
// WebDAV
// ========================================
function saveWebdavSettings() {
    localStorage.setItem('webdavUrl', DOM.webdavUrl.value);
    localStorage.setItem('webdavUser', DOM.webdavUser.value);
    localStorage.setItem('webdavPass', DOM.webdavPass.value);
    localStorage.setItem('webdavPath', DOM.webdavPath.value);
    showWebdavStatus('设置已保存', 'success');
}

async function webdavUpload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();
    const includeIcons = DOM.includeIconsWebdav?.checked ?? true;

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error'); return; }

    try {
        showWebdavStatus('正在上传...', 'success');
        const exportRes = await fetch(`${API_BASE}/api/data?includeIcons=${includeIcons}`);
        const data = await exportRes.json();

        // 使用后端代理
        const response = await fetch(`${API_BASE}/api/webdav?action=upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, username: user, password: pass, path: filePath, data })
        });

        const result = await response.json();
        if (result.success) {
            showWebdavStatus('上传成功！' + (includeIcons ? '' : '（不含图标）'), 'success');
        } else {
            showWebdavStatus(result.error || '上传失败', 'error');
        }
    } catch (err) {
        showWebdavStatus('上传错误: ' + err.message, 'error');
    }
}

async function webdavDownload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error'); return; }

    try {
        showWebdavStatus('正在下载...', 'success');

        // 使用后端代理
        const response = await fetch(`${API_BASE}/api/webdav?action=download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, username: user, password: pass, path: filePath })
        });

        const result = await response.json();
        if (result.success && result.data) {
            await fetch(`${API_BASE}/api/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.data)
            });
            await loadData();
            renderAll();
            // 下载后重新加载个性化设置
            await loadPersonalization();
            // 刷新图标库缓存
            refreshIconLibraryCache();
            showWebdavStatus('下载成功！', 'success');
        } else {
            showWebdavStatus(result.error || '下载失败', 'error');
        }
    } catch (err) {
        showWebdavStatus('下载错误: ' + err.message, 'error');
    }
}

function showWebdavStatus(msg, type) {
    DOM.webdavStatus.textContent = msg;
    DOM.webdavStatus.className = 'webdav-status ' + type;
    setTimeout(() => { DOM.webdavStatus.className = 'webdav-status'; }, 5000);
}

// ========================================
// 分类折叠功能
// ========================================
function toggleCategoryCollapse(categoryId) {
    const section = document.querySelector(`.category-section[data-category-id="${categoryId}"]`);
    if (!section) return;

    const grid = section.querySelector('.bookmarks-grid');
    const collapseBtn = section.querySelector('.collapse-btn');
    const isCollapsed = collapsedCategories.has(categoryId);

    if (isCollapsed) {
        // 展开
        collapsedCategories.delete(categoryId);
        section.classList.remove('collapsed');
        grid.style.display = '';
        collapseBtn.title = '折叠';
    } else {
        // 折叠
        collapsedCategories.add(categoryId);
        section.classList.add('collapsed');
        grid.style.display = 'none';
        collapseBtn.title = '展开';
    }

    // 保存折叠状态到本地存储
    saveCollapsedState();
}

function loadCollapsedState() {
    try {
        const saved = localStorage.getItem('collapsedCategories');
        if (saved) {
            collapsedCategories = new Set(JSON.parse(saved));
        }
    } catch (e) {
        console.error('加载折叠状态失败:', e);
    }
}

function saveCollapsedState() {
    try {
        localStorage.setItem('collapsedCategories', JSON.stringify([...collapsedCategories]));
    } catch (e) {
        console.error('保存折叠状态失败:', e);
    }
}

// ========================================
// 书签搜索浮层
// ========================================
function openBookmarkSearch() {
    DOM.bookmarkSearchOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.bookmarkSearchInput.value = '';
    DOM.bookmarkSearchResults.innerHTML = '';
    setTimeout(() => DOM.bookmarkSearchInput.focus(), 100);
}

function closeBookmarkSearch() {
    DOM.bookmarkSearchOverlay.classList.remove('open');
    document.body.style.overflow = '';
    DOM.bookmarkSearchInput.value = '';
    DOM.bookmarkSearchResults.innerHTML = '';
}

function handleBookmarkSearch() {
    const searchTerm = DOM.bookmarkSearchInput.value.toLowerCase().trim();

    if (!searchTerm) {
        DOM.bookmarkSearchResults.innerHTML = '';
        return;
    }

    // 过滤书签（只搜索书签类型，不包括组件）
    const results = bookmarks.filter(b => {
        if (b.item_type === 'component') return false;
        return b.name.toLowerCase().includes(searchTerm) ||
            (b.description && b.description.toLowerCase().includes(searchTerm)) ||
            b.url.toLowerCase().includes(searchTerm);
    });

    if (results.length === 0) {
        DOM.bookmarkSearchResults.innerHTML = '<div class="search-no-results">没有找到匹配的书签</div>';
        return;
    }

    // 渲染搜索结果
    DOM.bookmarkSearchResults.innerHTML = results.slice(0, 20).map(item => {
        const category = categories.find(c => c.id === item.category_id);
        const categoryName = category ? category.name : '未分类';

        // 获取图标（优先 URL 类型）
        let iconHtml;
        const cachedIcon = iconCache.get(item.id);
        if (cachedIcon && cachedIcon.icon_data) {
            iconHtml = `<img src="${cachedIcon.icon_data}" alt="${item.name}">`;
        } else if (item.icon_type === 'url' && item.icon_data) {
            iconHtml = `<img src="${item.icon_data}" alt="${item.name}" onerror="this.outerHTML='<span>${item.icon || '🌐'}</span>'">`;
        } else if (item.icon_type === 'base64' && item.icon_data) {
            iconHtml = `<img src="${item.icon_data}" alt="${item.name}">`;
        } else {
            iconHtml = item.icon || '🌐';
        }

        return `
            <a href="${item.url}" class="search-result-item" target="_blank" rel="noopener" onclick="closeBookmarkSearch()">
                <div class="search-result-icon">${iconHtml}</div>
                <div class="search-result-info">
                    <div class="search-result-name">${highlightText(item.name, searchTerm)}</div>
                    <div class="search-result-desc">${item.description ? highlightText(item.description, searchTerm) : item.url}</div>
                </div>
                <span class="search-result-category">${categoryName}</span>
            </a>
        `;
    }).join('');
}

// ========================================
// 启动
// ========================================
document.addEventListener('DOMContentLoaded', init);
