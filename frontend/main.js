/**
 * 书签导航网站 - 前端 JavaScript
 * 模块化入口文件
 */

import { cacheDOMElements } from './modules/dom.js';
import { loadData, loadAiStatus, loadCollapsedState } from './modules/api.js';
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

    await Promise.all([
        loadAiStatus().then(() => {
            updateAiUiVisibility();
            updateAiSettingsServerHint();
        }),
        loadData(),
        loadPersonalization()
    ]);
    renderAll();
    bindAllEvents();
    hideLoadingOverlay();
}

document.addEventListener('DOMContentLoaded', init);
