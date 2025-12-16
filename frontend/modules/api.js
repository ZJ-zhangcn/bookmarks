/**
 * API 数据加载模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

export async function loadData() {
    try {
        const [catRes, bmRes, engRes] = await Promise.all([
            fetch(`${state.API_BASE}/api/categories`),
            fetch(`${state.API_BASE}/api/bookmarks`),
            fetch(`${state.API_BASE}/api/engines`)
        ]);

        const catData = await catRes.json();
        const bmData = await bmRes.json();
        const engData = await engRes.json();

        state.setCategories(catData.success ? catData.data : []);
        state.setBookmarks(bmData.success ? bmData.data : []);
        state.setEngines(engData.success ? engData.data : []);

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

export function lazyLoadVisibleIcons() {
    if (state.isLoadingIcons) return;

    const visibleBookmarkIds = [];
    const bookmarkElements = document.querySelectorAll('.bookmark-card[data-id]');

    bookmarkElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight + 200 && rect.bottom > -200) {
            const id = el.dataset.id;
            if (id && !state.iconCache.has(id)) {
                const bookmark = state.bookmarks.find(b => b.id == id);
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
