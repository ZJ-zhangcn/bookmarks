/**
 * 首屏主题模块
 * 保持主题切换逻辑轻量，避免为了首屏主题加载完整设置模块。
 */
import { DOM } from './dom.js';

export function applyTheme(theme) {
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

export function setTheme(theme) {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
}

export function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    applyTheme(saved);
    if (DOM.themeSelect) {
        DOM.themeSelect.value = saved;
    }
}
