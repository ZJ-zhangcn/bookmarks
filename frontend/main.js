/**
 * 书签导航网站 - 前端 JavaScript
 * 模块化入口文件 - 首屏优化版本
 */

import { cacheDOMElements } from './modules/dom.js';
import { loadCoreData, loadCollapsedState, loadAiStatus } from './modules/api.js';

import { renderAll } from './modules/render.js';
import { bindAllEvents } from './modules/events.js';
import { hideLoadingOverlay } from './modules/utils.js';
import { initTheme } from './modules/theme.js';
import { registerServiceWorker } from './modules/pwa.js';
import { openBookmarkModal } from './modules/bookmark.js';

function openBookmarkFromUrlParams() {
    const params = new URLSearchParams(window.location.search);
    if (!['add', 'share'].includes(params.get('action'))) return;
    const sharedUrl = params.get('url') || (/^https?:\/\//i.test(params.get('text') || '') ? params.get('text') : '');
    const title = params.get('title') || '';
    if (!sharedUrl) return;
    requestAnimationFrame(() => {
        openBookmarkModal(null, null, { name: title, url: sharedUrl });
        window.history.replaceState({}, document.title, window.location.pathname);
    });
}

async function init() {
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);

    cacheDOMElements();
    initTheme();
    loadCollapsedState();

    // 首屏核心：只加载书签数据
    await loadCoreData();

    renderAll();
    bindAllEvents();
    hideLoadingOverlay();
    registerServiceWorker();
    openBookmarkFromUrlParams();

    // 延迟加载：设置相关功能（壁纸、AI 状态）
    setTimeout(async () => {
        try {
            const [settings, ai] = await Promise.all([
                import('./modules/settings.js'),
                import('./modules/ai.js')
            ]);

            ai.loadAiClientSettingsToUi();
            await Promise.all([
                settings.loadPersonalization(),
                loadAiStatus()
            ]);

            ai.updateAiUiVisibility();
            ai.updateAiSettingsServerHint();
        } catch (e) {
            console.error('延迟加载失败:', e);
        }
    }, 100);
}

document.addEventListener('DOMContentLoaded', init);
