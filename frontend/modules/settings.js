/**
 * 设置模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData } from './api.js';
import { renderAll } from './render.js';
import { renderCategoryList } from './category.js';
import { preloadImage, toSafeImageUrl } from './utils.js';
import { refreshIconLibraryCache } from './icon-library.js';
import { showToast, showConfirm } from './ux.js';
import webdavHelpers from './webdav-helpers.cjs';

const { buildWebdavStatusPanel, parseJsonResponse } = webdavHelpers;

const WALLPAPER_HINT_KEY = 'wallpaper:lastOkUrl';
const WALLPAPER_TONE_ATTR = 'data-wallpaper-tone';
let wallpaperLoadSeq = 0;
const INITIAL_WALLPAPER_WAIT_MS = 5000;

export function getWallpaperToneFromLuminance(luminance, dimPercent = 30) {
    const value = Number(luminance);
    if (!Number.isFinite(value)) return '';
    const dim = Math.min(0.85, Math.max(0, Number(dimPercent) || 0) / 100);
    const perceived = Math.max(0, Math.min(1, value)) * (1 - dim);
    return perceived >= 0.48 ? 'light' : 'dark';
}

function sampleImageLuminance(img) {
    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    let total = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3] / 255;
        if (alpha <= 0.05) continue;
        total += ((0.2126 * data[i]) + (0.7152 * data[i + 1]) + (0.0722 * data[i + 2])) / 255;
        count += 1;
    }
    return count ? total / count : null;
}

function setWallpaperTone(tone, luminance) {
    const root = document.documentElement;
    if (!tone) {
        root.removeAttribute(WALLPAPER_TONE_ATTR);
        root.style.removeProperty('--wallpaper-luminance');
        return;
    }
    root.setAttribute(WALLPAPER_TONE_ATTR, tone);
    if (Number.isFinite(luminance)) {
        root.style.setProperty('--wallpaper-luminance', luminance.toFixed(3));
    }
}

function detectWallpaperTone(displayUrl, dimPercent, seq) {
    const fallbackTone = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    setWallpaperTone(fallbackTone, NaN);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
        if (seq !== wallpaperLoadSeq) return;
        try {
            const luminance = sampleImageLuminance(img);
            const tone = getWallpaperToneFromLuminance(luminance, dimPercent);
            if (tone) setWallpaperTone(tone, luminance);
        } catch {
            // 跨域图片如果不允许 canvas 采样，就保留主题 fallback，避免闪烁。
        }
    };
    img.onerror = () => {
        if (seq === wallpaperLoadSeq) setWallpaperTone('', NaN);
    };
    img.src = displayUrl;
}

function loadImageAndDecode(url, timeoutMs) {
    const src = String(url || '').trim();
    if (!src) return Promise.resolve(false);
    return new Promise(resolve => {
        const img = new Image();
        let done = false;
        const finish = (ok) => {
            if (done) return;
            done = true;
            resolve(ok);
        };
        const timer = setTimeout(() => finish(false), timeoutMs);
        img.onload = () => {
            const maybeDecode = typeof img.decode === 'function' ? img.decode() : null;
            Promise.resolve(maybeDecode)
                .catch(() => { })
                .finally(() => {
                    clearTimeout(timer);
                    finish(true);
                });
        };
        img.onerror = () => {
            clearTimeout(timer);
            finish(false);
        };
        img.src = src;
    });
}

// 主题管理（由轻量 theme 模块承载，避免首屏加载完整设置模块）
export { initTheme, applyTheme, setTheme } from './theme.js';

export function openSettingsModal() {
    renderCategoryList();
    loadPersonalization();
    DOM.settingsModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeSettingsModal() {
    DOM.settingsModal.classList.remove('open');
    document.body.style.overflow = '';
}

export function closeAllModals() {
    [DOM.engineModal, DOM.bookmarkModal, DOM.categoryModal, DOM.settingsModal, DOM.bookmarkSearchOverlay, DOM.todoModal].forEach(m => m?.classList.remove('open'));
    document.body.style.overflow = '';
}

export async function loadPersonalization(options = {}) {
    try {
        let config;
        if (state.personalizationConfig !== undefined) {
            config = state.personalizationConfig;
        } else {
            const res = await fetch(`${state.API_BASE}/api/config`);
            const result = await res.json();
            config = result && result.success ? (result.data ?? null) : null;
            state.setPersonalizationConfig(config);
        }

        if (config) {
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
            await applyPersonalization(config, options);
        }
    } catch (e) {
        console.error('加载个性化设置失败:', e);
    }
}

export async function savePersonalization() {
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
        await fetch(`${state.API_BASE}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        await applyPersonalization(config);
        showToast('保存成功', 'success');
    } catch (e) {
        showToast('保存失败: ' + e.message, 'error');
    }
}

export async function applyPersonalization(config, options = {}) {
    const logo = document.querySelector('.site-title');
    if (logo) {
        logo.style.display = config.logoShow ? '' : 'none';
        logo.textContent = config.logoText || '书签导航';
    }

    const searchForm = document.querySelector('.web-search-form');
    if (searchForm) searchForm.style.display = config.searchBarShow ? '' : 'none';

    if (DOM.searchContainer) {
        DOM.searchContainer.style.display = config.bookmarkFilterShow !== false ? '' : 'none';
    }

    if (DOM.clockContainer) {
        DOM.clockContainer.style.display = config.clockShow ? 'block' : 'none';
        if (config.clockShow) {
            startClock();
        }
    }

    const wallpaperLayer = document.getElementById('wallpaperLayer');
    const wallpaperImage = document.getElementById('wallpaperImage');
    const wallpaperOverlay = document.getElementById('wallpaperOverlay');
    const bgDecoration = document.getElementById('bgDecoration');

    if (config.wallpaperUrl) {
        const url = String(config.wallpaperUrl || '').trim();
        const displayUrl = toSafeImageUrl(url, { preferProxyHosts: false });
        const seq = ++wallpaperLoadSeq;

        const blur = config.wallpaperBlur || 0;
        wallpaperOverlay.style.backdropFilter = `blur(${blur}px)`;
        wallpaperOverlay.style.webkitBackdropFilter = `blur(${blur}px)`;

        const dim = config.wallpaperDim || 30;
        wallpaperOverlay.style.background = `rgba(0, 0, 0, ${dim / 100})`;

        if (bgDecoration) bgDecoration.style.display = '';

        const hinted = (localStorage.getItem(WALLPAPER_HINT_KEY) || '') === url;
        const applySuccess = () => {
            if (seq !== wallpaperLoadSeq) return;
            wallpaperLayer.classList.add('active');
            wallpaperImage.style.backgroundImage = `url(${displayUrl})`;
            if (bgDecoration) bgDecoration.style.display = 'none';
            localStorage.setItem(WALLPAPER_HINT_KEY, url);
            detectWallpaperTone(displayUrl, dim, seq);
        };
        const applyFailure = () => {
            if (seq !== wallpaperLoadSeq) return;
            wallpaperLayer.classList.remove('active');
            wallpaperImage.style.backgroundImage = '';
            setWallpaperTone('', NaN);
            if (bgDecoration) bgDecoration.style.display = '';
        };

        const waitForWallpaper = options && options.waitForWallpaper === true;
        const avoidLateSwap = options && options.avoidLateWallpaperSwap === true;

        if (waitForWallpaper) {
            const ok = await loadImageAndDecode(displayUrl, hinted ? 1500 : INITIAL_WALLPAPER_WAIT_MS);
            if (ok) {
                applySuccess();
            } else {
                applyFailure();
                if (!avoidLateSwap) {
                    const img = new Image();
                    img.onload = applySuccess;
                    img.onerror = applyFailure;
                    img.src = displayUrl;
                } else {
                    // 背景加载成功则仅写入 hint，避免本次加载出现“后到的壁纸”闪切
                    const img = new Image();
                    img.onload = () => {
                        if (seq !== wallpaperLoadSeq) return;
                        localStorage.setItem(WALLPAPER_HINT_KEY, url);
                    };
                    img.src = displayUrl;
                }
            }
        } else if (hinted) {
            applySuccess();
            const img = new Image();
            img.onload = applySuccess;
            img.onerror = applyFailure;
            img.src = displayUrl;
        } else {
            const ok = await preloadImage(displayUrl, 1500);
            if (ok) {
                applySuccess();
            } else {
                applyFailure();
                const img = new Image();
                img.onload = applySuccess;
                img.onerror = applyFailure;
                img.src = displayUrl;
            }
        }

        document.body.style.backgroundImage = '';
    } else {
        wallpaperLayer.classList.remove('active');
        wallpaperImage.style.backgroundImage = '';
        setWallpaperTone('', NaN);

        if (bgDecoration) bgDecoration.style.display = '';

        document.body.style.backgroundImage = '';
    }

    const container = document.querySelector('.container');
    if (container) container.style.maxWidth = (config.contentMaxWidth || 1200) + 'px';

    if (DOM.footer) {
        DOM.footer.style.display = config.footerShow !== false ? '' : 'none';
        const footerP = DOM.footer.querySelector('p');
        if (footerP) {
            footerP.textContent = config.footerText || '© 2024 书签导航 · 快捷访问常用网站';
        }
    }
}

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

export function startClock() {
    if (state.clockInterval) return;
    updateClock();
    state.setClockInterval(setInterval(updateClock, 1000));
}

export function saveWebdavSettings() {
    localStorage.setItem('webdavUrl', DOM.webdavUrl.value);
    localStorage.setItem('webdavUser', DOM.webdavUser.value);
    localStorage.setItem('webdavPass', DOM.webdavPass.value);
    localStorage.setItem('webdavPath', DOM.webdavPath.value);
    showWebdavStatus('设置已保存', 'success', { operation: '保存设置', includeIcons: DOM.includeIconsWebdav?.checked ?? true });
}

export async function webdavUpload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();
    const includeIcons = DOM.includeIconsWebdav?.checked ?? true;

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error', { operation: '上传', path: filePath, includeIcons }); return; }

    try {
        showWebdavStatus('正在上传...', 'info', { operation: '上传', path: filePath, includeIcons });
        const exportRes = await fetch(`${state.API_BASE}/api/data?includeIcons=${includeIcons}`);
        const data = await exportRes.json();

        const response = await fetch(`${state.API_BASE}/api/webdav?action=upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, username: user, password: pass, path: filePath, data })
        });

        const result = await parseJsonResponse(response, '上传失败，服务器返回了非 JSON 响应');
        if (result.success) {
            showWebdavStatus('上传成功！' + (includeIcons ? '' : '（不含图标）'), 'success', { operation: '上传', path: filePath, includeIcons });
        } else {
            showWebdavStatus(result.error || '上传失败', 'error', { operation: '上传', path: filePath, includeIcons });
        }
    } catch (err) {
        showWebdavStatus('上传错误: ' + err.message, 'error', { operation: '上传', path: filePath, includeIcons });
    }
}

export async function webdavDownload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();
    const includeIcons = DOM.includeIconsWebdav?.checked ?? true;

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error', { operation: '下载', path: filePath, includeIcons }); return; }

    try {
        showWebdavStatus('正在下载...', 'info', { operation: '下载', path: filePath, includeIcons });

        const response = await fetch(`${state.API_BASE}/api/webdav?action=download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, username: user, password: pass, path: filePath })
        });

        const result = await parseJsonResponse(response, '下载失败，服务器返回了非 JSON 响应');
        if (result.success && result.data) {
            await fetch(`${state.API_BASE}/api/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result.data)
            });
            await loadData();
            renderAll();
            await loadPersonalization();
            refreshIconLibraryCache();
            showWebdavStatus('下载成功！', 'success', { operation: '下载', path: filePath, includeIcons });
        } else {
            showWebdavStatus(result.error || '下载失败', 'error', { operation: '下载', path: filePath, includeIcons });
        }
    } catch (err) {
        showWebdavStatus('下载错误: ' + err.message, 'error', { operation: '下载', path: filePath, includeIcons });
    }
}

function getWebdavMeta(operation, message, status) {
    return {
        status,
        operation,
        path: DOM.webdavPath?.value.trim() || '',
        includeIcons: DOM.includeIconsWebdav?.checked ?? true,
        message,
        at: new Date().toISOString()
    };
}

export function showWebdavStatus(msg, type = 'info', details = {}) {
    if (!DOM.webdavStatus) return;
    const meta = {
        ...getWebdavMeta(details.operation || '同步', msg, type),
        ...details,
        status: type,
        message: msg,
        at: details.at || new Date().toISOString()
    };
    DOM.webdavStatus.innerHTML = buildWebdavStatusPanel(meta);
    DOM.webdavStatus.className = 'webdav-status ' + type;
}

export async function exportConfig() {
    try {
        const includeIcons = DOM.includeIconsExport?.checked ?? true;
        const res = await fetch(`${state.API_BASE}/api/data?includeIcons=${includeIcons}`);
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
        showToast('导出失败: ' + e.message, 'error');
    }
}

export async function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const data = JSON.parse(reader.result);

            const jsonStr = JSON.stringify(data);
            const sizeInMB = new Blob([jsonStr]).size / (1024 * 1024);

            if (sizeInMB > 4) {
                const choice = await showConfirm({
                    title: '导入文件较大',
                    message: `导入文件较大 (${sizeInMB.toFixed(1)}MB)，可能影响导入性能。继续后会清理 base64 图标再导入，URL 和 emoji 图标会保留。导入后可使用“批量获取图标”重新获取。`,
                    confirmText: '清理并导入',
                    cancelText: '取消'
                });

                if (!choice) {
                    showToast('导入已取消', 'info');
                    return;
                }

                if (data.bookmarks) {
                    data.bookmarks = data.bookmarks.map(b => {
                        if (b.icon_type === 'base64' || (b.icon_data && b.icon_data.startsWith('data:'))) {
                            return {
                                ...b,
                                icon: b.icon || '🌐',
                                icon_type: 'auto',
                                icon_data: ''
                            };
                        }
                        return b;
                    });
                }
                if (data.engines) {
                    data.engines = data.engines.map(e => {
                        if (e.icon && e.icon.startsWith('data:')) {
                            return {
                                ...e,
                                icon: '🔍'
                            };
                        }
                        return e;
                    });
                }

                const cleanedSize = new Blob([JSON.stringify(data)]).size / (1024 * 1024);
                if (cleanedSize > 4) {
                    showToast(`清理后仍然较大 (${cleanedSize.toFixed(1)}MB)，请减少书签数量或联系管理员`, 'error', { timeoutMs: 5200 });
                    return;
                }
            }

            const res = await fetch(`${state.API_BASE}/api/data`, {
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
            await loadPersonalization();
            refreshIconLibraryCache();
            showToast('导入成功', 'success');
        } catch (err) {
            showToast('导入失败：' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

export async function importBrowserBookmarks(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const html = reader.result;
            const res = await fetch(`${state.API_BASE}/api/data/browser-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ html })
            });
            const result = await res.json();
            if (!res.ok || !result.success) {
                throw new Error(result.error || `HTTP ${res.status}`);
            }
            await loadData();
            renderAll();
            showToast(`导入成功：分类 ${result.data.categories} 个，书签 ${result.data.bookmarks} 个`, 'success', { timeoutMs: 4200 });
        } catch (err) {
            showToast('导入失败：' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}
