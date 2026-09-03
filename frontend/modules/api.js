/**
 * API 数据加载模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { toIconDisplayUrl, iconImageHtml } from './icon-display.js';
import { apiRequest } from './api-client.js';
import iconLoadQueueModule from './icon-load-queue.cjs';
import { readBootstrapCache, writeBootstrapCache } from './bootstrap-cache.js';
import { isAuthRequiredError } from './auth.js';

const { createIconLoadQueue } = iconLoadQueueModule;

export async function loadCoreData() {
    let payload = null;
    try {
        payload = await apiRequest('/api/bootstrap-v2', { cache: 'no-store' }, { toast: false });
        writeBootstrapCache(payload).catch(() => {});
    } catch (error) {
        if (isAuthRequiredError(error)) throw error;
        if (globalThis.__BOOKMARK_NAV_SESSION_MODE__) throw error;
        const cached = await readBootstrapCache();
        payload = cached?.data || null;
        if (!payload) console.error('加载核心数据失败:', error);
    }

    if (payload) {
        state.setCategories(payload?.categories || []);
        state.setBookmarks(payload?.bookmarks || []);
        state.setEngines(payload?.engines || []);

        // 单请求首屏：如果后端提供了 TODO 数据，则直接落状态
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
    }

    return payload;
}

export async function loadData() {
    try {
        await loadCoreData();
    } catch (e) {
        console.error('加载数据失败:', e);
    }
}


export async function loadAiStatus() {
    try {
        const result = await apiRequest('/api/ai?action=status', {}, { toast: false });
        if (result) state.setAiStatus(result);
    } catch (e) {
        state.setAiStatus({ enabled: false, provider: null, model: null, note: null });
    }
}

const iconLoadQueue = createIconLoadQueue({
    batchSize: 20,
    maxConcurrent: 1,
    maxRetries: 2,
    isResolved: id => state.iconCache.has(id),
    loadBatch: ids => apiRequest('/api/bookmarks/icons', {
            method: 'POST',
            json: { ids }
        }, { toast: false }),
    onResult(ids, data) {
        Object.entries(data || {}).forEach(([id, iconInfo]) => {
            state.iconCache.set(id, iconInfo);
            updateBookmarkIcon(id, iconInfo);
        });
        ids.forEach(id => {
            if (!Object.prototype.hasOwnProperty.call(data || {}, id)) state.iconCache.set(id, null);
        });
    },
    onError(ids) {
        ids.forEach(id => state.iconCache.set(id, null));
    }
});

export async function loadIconsBatch(ids) {
    iconLoadQueue.enqueue(ids);
    await iconLoadQueue.whenIdle();
}

export function queueBookmarkIcons(ids) {
    return iconLoadQueue.enqueue(ids);
}

export function isBookmarkIconQueued(id) {
    return iconLoadQueue.has(id);
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
        const elementsById = new Map();

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const id = el.dataset.id;

                if (id && !state.iconCache.has(id)) {
                    const bookmark = state.bookmarks.find(b => b.id === id);
                    // 支持 'auto' 和 'base64' 类型的图标自动获取
                    if (bookmark && (bookmark.icon_type === 'base64' || bookmark.icon_type === 'auto') && !bookmark.icon_data) {
                        visibleBookmarkIds.push(id);
                        elementsById.set(id, el);
                    }
                }
                if (id && state.iconCache.has(id)) iconObserver.unobserve(el);
            }
        });

        if (visibleBookmarkIds.length > 0) {
            queueBookmarkIcons(visibleBookmarkIds);
            visibleBookmarkIds.forEach(id => {
                if (isBookmarkIconQueued(id) || state.iconCache.has(id)) {
                    iconObserver.unobserve(elementsById.get(id));
                }
            });
        }
    }, {
        rootMargin: '400px' // 提前加载（从 200px 增加到 400px）
    });
}

export function observeBookmarkIcons() {
    if (!iconObserver) {
        initIconObserver();
        if (!iconObserver) return; // 不支持则退出
    }

    const bookmarkElements = document.querySelectorAll('.bookmark-card[data-id]');

    // 按元素距离视口的距离排序（优先加载可见的）
    const sorted = Array.from(bookmarkElements).sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();
        const distA = Math.abs(rectA.top);
        const distB = Math.abs(rectB.top);
        return distA - distB;
    });

    sorted.forEach(el => {
        if (!observedElements.has(el)) {
            iconObserver.observe(el);
            observedElements.add(el);
        }
    });
}

function updateBookmarkIcon(bookmarkId, iconInfo) {
    const card = document.querySelector(`.bookmark-card[data-id="${CSS.escape(String(bookmarkId))}"]`);
    if (!card || !iconInfo || !iconInfo.icon_data) return;

    const iconContainer = card.querySelector('.bookmark-icon');
    const iconUrl = toIconDisplayUrl(iconInfo.icon_data, iconInfo.icon_type);
    if (iconContainer && iconUrl) {
        const existingImg = iconContainer.querySelector('img');
        if (existingImg) {
            existingImg.src = iconUrl;
            existingImg.dataset.originalSrc = iconInfo.icon_data;
            if (!existingImg.dataset.fallbackIcon) existingImg.dataset.fallbackIcon = '🌐';
        } else {
            iconContainer.innerHTML = iconImageHtml({
                iconData: iconInfo.icon_data,
                iconType: iconInfo.icon_type,
                fallbackIcon: '🌐',
                alt: '图标',
                loading: 'lazy'
            });
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

export async function loadTodos() {
    try {
        const result = await apiRequest('/api/todos?status=all', { cache: 'no-store' }, { toast: false });
        state.setTodos(result || []);
    } catch (e) {
        console.error('加载 TODO 失败:', e);
    }
}
