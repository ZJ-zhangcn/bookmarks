/**
 * 书签导航网站 - 前端 JavaScript
 * 模块化入口文件
 */

import { cacheDOMElements } from './modules/dom.js';
import { loadCoreData, loadTodoCategories, loadTodos, loadAiStatus, loadCollapsedState } from './modules/api.js';

import { renderAll } from './modules/render.js';
import { bindAllEvents } from './modules/events.js';
import { hideLoadingOverlay } from './modules/utils.js';
import { loadAiClientSettingsToUi, updateAiSettingsServerHint, updateAiUiVisibility } from './modules/ai.js';
import { loadPersonalization, initTheme } from './modules/settings.js';

async function init() {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    cacheDOMElements();
    initTheme();
    loadAiClientSettingsToUi();
    loadCollapsedState();

    // 完全不闪：首屏等待个性化（壁纸）和核心数据就绪后再揭开遮罩
    const core = await loadCoreData();

    // 向后兼容：旧后端未合并 TODO 数据时，再单独请求
    const todoInitTasks = [];
    if (!core?.hasTodoCategories) todoInitTasks.push(loadTodoCategories());
    if (!core?.hasTodos) todoInitTasks.push(loadTodos());

    await Promise.all([
        loadPersonalization({ waitForWallpaper: true, avoidLateWallpaperSwap: true }),
        Promise.all(todoInitTasks)
    ]);

    renderAll();
    bindAllEvents();
    hideLoadingOverlay();

    // 后台加载次要功能（不阻塞用户）
    Promise.all([
        loadAiStatus().then(() => {
            updateAiUiVisibility();
            updateAiSettingsServerHint();
        }),
        loadPersonalization()
    ]).catch(e => console.error('后台加载失败:', e));
}

document.addEventListener('DOMContentLoaded', init);
