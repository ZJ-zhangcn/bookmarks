/**
 * API 数据加载模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

export async function loadCoreData() {
    let payload = null;
    try {
        const res = await fetch(`${state.API_BASE}/api/bootstrap-v2`, { cache: 'no-store' });
        const result = await res.json();

        payload = result && result.success ? result.data : null;
        state.setCategories(payload?.categories || []);
        state.setBookmarks(payload?.bookmarks || []);
        state.setEngines(payload?.engines || []);

        // 单请求首屏：如果后端提供了 TODO 数据，则直接落状态
        if (payload && 'todoCategories' in payload) {
            state.setTodoCategories(payload.todoCategories || []);
        }
        if (payload && 'todos' in payload) {
            state.setTodos(payload.todos || []);
        }

        if (payload && 'config' in payload) {
            state.setPersonalizationConfig(payload.config ?? null);
        }

        if (state.engines.length > 0) {
            const firstEngine = state.engines[0];
            state.setCurrentEngine({ name: firstEngine.name, icon: firstEngine.icon, url: firstEngine.url });
        }

        if (DOM.webdavUrl) {
            DOM.webdavUrl.value = localStorage.getItem('webdavUrl') || '';
            DOM.webdavUser.value = localStorage.getItem('webdavUser') || '';
            DOM.webdavPass.value = localStorage.getItem('webdavPass') || '';
            DOM.webdavPath.value = localStorage.getItem('webdavPath') || 'bookmarks/config.json';
        }
    } catch (e) {
        console.error('加载核心数据失败:', e);
    }

    return {
        payload,
        hasTodoCategories: Array.isArray(payload?.todoCategories),
        hasTodos: Array.isArray(payload?.todos)
    };
}

export async function loadData() {
    try {
        const core = await loadCoreData();

        // 后端未合并 TODO 数据时，回退到旧行为
        const tasks = [];
        if (!core?.hasTodoCategories) tasks.push(loadTodoCategories());
        if (!core?.hasTodos) tasks.push(loadTodos());
        await Promise.all(tasks);
    } catch (e) {
        console.error('加载数据失败:', e);
    }
}


export async function loadAiStatus() {
    try {
        const res = await fetch(`${state.API_BASE}/api/ai?action=status`);
        const result = await res.json();
        if (result && result.success && result.data) {
            state.setAiStatus(result.data);
        }
    } catch (e) {
        state.setAiStatus({ enabled: false, provider: null, model: null, note: null });
    }
}

export async function loadIconsBatch(ids) {
    if (ids.length === 0 || state.isLoadingIcons) return;

    state.setIsLoadingIcons(true);
    const idsToLoad = ids.filter(id => !state.iconCache.has(id)).slice(0, 20);

    if (idsToLoad.length === 0) {
        state.setIsLoadingIcons(false);
        return;
    }

    try {
        const res = await fetch(`${state.API_BASE}/api/bookmarks?action=icons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: idsToLoad })
        });
        const data = await res.json();

        if (data.success) {
            Object.entries(data.data).forEach(([id, iconInfo]) => {
                state.iconCache.set(id, iconInfo);
                updateBookmarkIcon(id, iconInfo);
            });

            idsToLoad.forEach(id => {
                if (!data.data[id]) {
                    state.iconCache.set(id, null);
                }
            });
        }
    } catch (e) {
        console.error('加载图标失败:', e);
    } finally {
        state.setIsLoadingIcons(false);
        setTimeout(lazyLoadVisibleIcons, 100);
    }
}

// IntersectionObserver实例（高性能懒加载）
let iconObserver = null;
const observedElements = new WeakSet();

export function initIconObserver() {
    if (iconObserver) return;

    // 特性检测（兼容性）
    if (!('IntersectionObserver' in window)) {
        console.warn('IntersectionObserver not supported, falling back');
        return;
    }

    iconObserver = new IntersectionObserver((entries) => {
        const visibleBookmarkIds = [];

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const id = el.dataset.id;

                if (id && !state.iconCache.has(id)) {
                    const bookmark = state.bookmarks.find(b => b.id == id);
                    if (bookmark && bookmark.icon_type === 'base64' && !bookmark.icon_data) {
                        visibleBookmarkIds.push(id);
                    }
                }
                // 加载后停止观察
                iconObserver.unobserve(el);
            }
        });

        if (visibleBookmarkIds.length > 0 && !state.isLoadingIcons) {
            loadIconsBatch(visibleBookmarkIds);
        }
    }, {
        rootMargin: '200px'
    });
}

export function observeBookmarkIcons() {
    if (!iconObserver) {
        initIconObserver();
        if (!iconObserver) return; // 不支持则退出
    }

    const bookmarkElements = document.querySelectorAll('.bookmark-card[data-id]');
    bookmarkElements.forEach(el => {
        if (!observedElements.has(el)) {
            iconObserver.observe(el);
            observedElements.add(el);
        }
    });
}

// 保留旧函数以兼容（但标记为已废弃）
export function lazyLoadVisibleIcons() {
    // 已废弃：使用observeBookmarkIcons()替代
    observeBookmarkIcons();
}

function updateBookmarkIcon(bookmarkId, iconInfo) {
    const card = document.querySelector(`.bookmark-card[data-id="${bookmarkId}"]`);
    if (!card || !iconInfo || !iconInfo.icon_data) return;

    const iconContainer = card.querySelector('.bookmark-icon');
    if (iconContainer) {
        const existingImg = iconContainer.querySelector('img');
        if (existingImg) {
            existingImg.src = iconInfo.icon_data;
        } else {
            iconContainer.innerHTML = `<img src="${iconInfo.icon_data}" alt="图标" loading="lazy">`;
        }
    }
}

export function loadCollapsedState() {
    try {
        const saved = localStorage.getItem('collapsedCategories');
        if (saved) {
            state.setCollapsedCategories(new Set(JSON.parse(saved)));
        }
    } catch (e) {
        console.error('加载折叠状态失败:', e);
    }
}

export function saveCollapsedState() {
    try {
        localStorage.setItem('collapsedCategories', JSON.stringify([...state.collapsedCategories]));
    } catch (e) {
        console.error('保存折叠状态失败:', e);
    }
}

export async function loadTodos(categoryId = null, status = 'all') {
    try {
        let url = `${state.API_BASE}/api/todos?status=${status}`;
        if (categoryId && categoryId !== 'all') {
            url += `&category_id=${encodeURIComponent(categoryId)}`;
        }
        const res = await fetch(url, { cache: 'no-store' });
        const result = await res.json();
        if (result && result.success) {
            state.setTodos(result.data || []);
        }
    } catch (e) {
        console.error('加载 TODO 失败:', e);
    }
}

export async function loadTodoCategories() {
    try {
        const res = await fetch(`${state.API_BASE}/api/categories?type=todo`, { cache: 'no-store' });
        const result = await res.json();
        if (result && result.success) {
            state.setTodoCategories(result.data || []);
        }
    } catch (e) {
        console.error('加载 TODO 分类失败:', e);
    }
}
