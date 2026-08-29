/**
 * 状态管理模块
 */
export const API_BASE = window.location.origin;

export let categories = [];
export let bookmarks = [];
export let todos = [];
export let engines = [];
export let currentCategory = 'all';
export let currentSearch = '';
export let currentEngine = { name: 'Google', icon: '🌐', url: 'https://www.google.com/search?q=' };
export let editingBookmarkId = null;
export let editingCategoryId = null;
export let editingEngineId = null;
export let currentIconType = 'auto';
export let currentIconData = '';
export let editingBookmark = null;
export let aiRequestInFlight = false;
export let aiLastActionAt = 0;
export const AI_CLICK_COOLDOWN_MS = 2500;
export let collapsedCategories = new Set();
export let aiStatus = { enabled: false, provider: null, model: null, note: null };
export let sortingCategory = null;
export let batchMode = false;
export const batchSelectedIds = new Set();
export let personalizationConfig = undefined;
export let editingTodoId = null;
export let todoShowCompleted = true; // 是否显示已完成区域

export const AI_CLIENT_STORAGE = {
    apiBaseUrl: 'aiApiBaseUrl',
    apiKey: 'aiApiKey',
    model: 'aiModel',
    provider: 'aiProvider'
};

// 图标缓存
export const iconCache = new Map();
export let availableIcons = [];
export let iconLibraryCache = null;
export let selectedLibraryIcon = null;
export const selectedIcons = new Set();

// 时钟
export let clockInterval = null;

export let dataVersion = 0;

// 滚动位置记忆（按分类ID存储）
export const scrollPositions = new Map();

// 状态更新函数
export function setCategories(val) { categories = val; dataVersion++; }
function normalizeSearchText(bookmark) {
    return [bookmark?.name, bookmark?.description, bookmark?.url, bookmark?.tags, bookmark?.category_name]
        .map(value => Array.isArray(value) ? value.join(' ') : String(value || ''))
        .join(' ')
        .toLocaleLowerCase();
}

export function setBookmarks(val) {
    bookmarks = (Array.isArray(val) ? val : []).map(bookmark => ({
        ...bookmark,
        searchText: normalizeSearchText(bookmark)
    }));
    dataVersion++;
}
export function setTodos(val) { todos = val; dataVersion++; }
export function setEngines(val) { engines = val; }
export function setCurrentCategory(val) { currentCategory = val; }
export function setCurrentSearch(val) { currentSearch = val; }
export function setCurrentEngine(val) { currentEngine = val; }
export function setEditingBookmarkId(val) { editingBookmarkId = val; }
export function setEditingCategoryId(val) { editingCategoryId = val; }
export function setEditingEngineId(val) { editingEngineId = val; }
export function setCurrentIconType(val) { currentIconType = val; }
export function setCurrentIconData(val) { currentIconData = val; }
export function setEditingBookmark(val) { editingBookmark = val; }
export function setAiRequestInFlight(val) { aiRequestInFlight = val; }
export function setAiLastActionAt(val) { aiLastActionAt = val; }
export function setAiStatus(val) { aiStatus = val; }
export function setSortingCategory(val) { sortingCategory = val; }
export function setBatchMode(val) {
    batchMode = Boolean(val);
    if (!batchMode) batchSelectedIds.clear();
    dataVersion++;
}
export function setPersonalizationConfig(val) { personalizationConfig = val; }
export function setEditingTodoId(val) { editingTodoId = val; }
export function setTodoShowCompleted(val) { todoShowCompleted = val; }
export function setAvailableIcons(val) { availableIcons = val; }
export function setIconLibraryCache(val) { iconLibraryCache = val; }
export function setSelectedLibraryIcon(val) { selectedLibraryIcon = val; }
export function setClockInterval(val) { clockInterval = val; }
export function setCollapsedCategories(val) { collapsedCategories = val; }

function compareBookmarks(a, b) {
    const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
    const categoryDiff = (categoryOrder.get(a.category_id) ?? Number.MAX_SAFE_INTEGER)
        - (categoryOrder.get(b.category_id) ?? Number.MAX_SAFE_INTEGER);
    if (categoryDiff !== 0) return categoryDiff;
    const sortDiff = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    if (sortDiff !== 0) return sortDiff;
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

export function upsertBookmark(bookmark) {
    if (!bookmark?.id) return null;
    const index = bookmarks.findIndex(item => item.id === bookmark.id);
    const nextBookmark = { ...bookmark, searchText: normalizeSearchText(bookmark) };
    if (index >= 0) bookmarks = bookmarks.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextBookmark } : item);
    else bookmarks = [...bookmarks, nextBookmark];
    bookmarks.sort(compareBookmarks);
    dataVersion++;
    return bookmarks.find(item => item.id === bookmark.id) || null;
}

export function removeBookmark(id) {
    const next = bookmarks.filter(item => item.id !== id);
    if (next.length === bookmarks.length) return false;
    bookmarks = next;
    iconCache.delete(id);
    dataVersion++;
    return true;
}
