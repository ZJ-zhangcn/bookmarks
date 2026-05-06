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
export const iconLoadQueue = [];
export let isLoadingIcons = false;
export let availableIcons = [];
export let iconLibraryCache = null;
export let selectedLibraryIcon = null;
export const selectedIcons = new Set();

// 时钟
export let clockInterval = null;
export let systemStatsInterval = null;

export let dataVersion = 0;

// 状态更新函数
export function setCategories(val) { categories = val; dataVersion++; }
export function setBookmarks(val) { bookmarks = val; dataVersion++; }
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
export function setPersonalizationConfig(val) { personalizationConfig = val; }
export function setEditingTodoId(val) { editingTodoId = val; }
export function setTodoShowCompleted(val) { todoShowCompleted = val; }
export function setIsLoadingIcons(val) { isLoadingIcons = val; }
export function setAvailableIcons(val) { availableIcons = val; }
export function setIconLibraryCache(val) { iconLibraryCache = val; }
export function setSelectedLibraryIcon(val) { selectedLibraryIcon = val; }
export function setClockInterval(val) { clockInterval = val; }
export function setSystemStatsInterval(val) { systemStatsInterval = val; }
export function setCollapsedCategories(val) { collapsedCategories = val; }
