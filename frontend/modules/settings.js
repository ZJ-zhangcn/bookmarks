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
import { apiRequest, runWithButton } from './api-client.js';
import webdavHelpers from './webdav-helpers.cjs';

const { buildWebdavStatusPanel } = webdavHelpers;

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

function formatReleaseTime(value) {
    if (!value) return '未知';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}

export async function loadReleaseInfo() {
    if (!DOM.aboutVersion || !DOM.aboutBuildInfo) return;
    try {
        const health = await apiRequest('/api/health', { cache: 'no-store' }, { toast: false });
        const release = health?.release || {};
        const database = health?.database || {};
        DOM.aboutVersion.textContent = `版本 ${release.version || '未知'}`;
        DOM.aboutBuildInfo.innerHTML = `
            <span>Commit</span><strong>${release.commit ? String(release.commit).slice(0, 12) : '未知'}</strong>
            <span>构建时间</span><strong>${formatReleaseTime(release.buildTime)}</strong>
            <span>数据库</span><strong>SQLite schema v${database.schemaVersion ?? '未知'}</strong>
            <span>最近备份</span><strong>${formatReleaseTime(database.latestBackup?.createdAt)}</strong>
        `;
    } catch (error) {
        DOM.aboutVersion.textContent = '版本信息加载失败';
        DOM.aboutBuildInfo.textContent = error.message;
    }
}

export async function loadPersonalization(options = {}) {
    try {
        let config;
        if (state.personalizationConfig !== undefined) {
            config = state.personalizationConfig;
        } else {
            config = await apiRequest('/api/config', {}, { toast: false });
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

    return runWithButton(DOM.savePersonalization, async () => {
        try {
            await apiRequest('/api/config', {
                method: 'POST',
                json: config
            }, { toast: false });
            state.setPersonalizationConfig(config);
            await applyPersonalization(config);
            showToast('保存成功', 'success');
        } catch (e) {
            showToast('保存失败: ' + e.message, 'error');
        }
    }, '保存中...');
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

    return runWithButton(DOM.webdavUploadBtn, async () => {
      try {
        showWebdavStatus('正在上传...', 'info', { operation: '上传', path: filePath, includeIcons });
        const data = await apiRequest(`/api/data?includeIcons=${includeIcons}`, {
            timeoutMs: 30000
        }, { toast: false });
        await apiRequest('/api/webdav?action=upload', {
            method: 'POST',
            json: { url, username: user, password: pass, path: filePath, data },
            timeoutMs: 60000
        }, { toast: false });
        showWebdavStatus('上传成功！' + (includeIcons ? '' : '（不含图标）'), 'success', { operation: '上传', path: filePath, includeIcons });
      } catch (err) {
          showWebdavStatus('上传错误: ' + err.message, 'error', { operation: '上传', path: filePath, includeIcons });
      }
    }, '上传中...');
}

export async function webdavDownload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();
    const includeIcons = DOM.includeIconsWebdav?.checked ?? true;

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error', { operation: '下载', path: filePath, includeIcons }); return; }

    return runWithButton(DOM.webdavDownloadBtn, async () => {
      try {
        showWebdavStatus('正在下载...', 'info', { operation: '下载', path: filePath, includeIcons });
        const data = await apiRequest('/api/webdav?action=download', {
            method: 'POST',
            json: { url, username: user, password: pass, path: filePath },
            timeoutMs: 60000
        }, { toast: false });
        if (!data) throw new Error('下载内容为空');
        await apiRequest('/api/data', {
                method: 'POST',
                json: data,
                timeoutMs: 60000
        }, { toast: false });
        await loadData();
        renderAll();
        await loadPersonalization();
        refreshIconLibraryCache();
        showWebdavStatus('下载成功！', 'success', { operation: '下载', path: filePath, includeIcons });
      } catch (err) {
          showWebdavStatus('下载错误: ' + err.message, 'error', { operation: '下载', path: filePath, includeIcons });
      }
    }, '下载中...');
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
    return runWithButton(DOM.exportBtn, async () => {
        try {
            const includeIcons = DOM.includeIconsExport?.checked ?? true;
            const data = await apiRequest(`/api/data?includeIcons=${includeIcons}`, {
                timeoutMs: 30000
            }, { toast: false });
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
    }, '导出中...');
}

export async function importConfig(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => runWithButton(DOM.importBtn, async () => {
        try {
            const data = JSON.parse(reader.result);
            const importMode = DOM.importMode?.value === 'restore' ? 'restore' : 'merge';

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

            if (importMode === 'restore') {
                const confirmed = await showConfirm({
                    title: '完整恢复当前数据？',
                    message: '完整恢复会用备份替换现有书签、分类、搜索引擎、TODO、图标库和个性化设置。服务器会先自动创建恢复前备份。',
                    confirmText: '完整恢复',
                    cancelText: '取消',
                    danger: true
                });
                if (!confirmed) {
                    showToast('恢复已取消', 'info');
                    return;
                }
            }

            const result = await apiRequest(`/api/data?mode=${importMode}`, {
                method: 'POST',
                json: data,
                timeoutMs: 60000
            }, { toast: false });
            await loadData();
            renderAll();
            await loadPersonalization();
            refreshIconLibraryCache();
            const restoredCounts = result?.counts;
            const bookmarkCount = restoredCounts?.bookmarks;
            const message = importMode === 'restore'
                ? `完整恢复成功${Number.isFinite(bookmarkCount) ? `：${bookmarkCount} 个书签` : ''}`
                : '合并导入成功';
            showToast(message, 'success');
        } catch (err) {
            showToast('导入失败：' + err.message, 'error');
        }
    }, '导入中...');
    reader.readAsText(file);
    e.target.value = '';
}

export async function importBrowserBookmarks(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => runWithButton(DOM.browserImportBtn, async () => {
        try {
            const html = reader.result;
            const duplicateMode = DOM.browserImportMode?.value === 'update' ? 'update' : 'skip';
            const preview = await apiRequest(`/api/data/browser-import?preview=true&duplicates=${duplicateMode}`, {
                method: 'POST',
                json: { html },
                timeoutMs: 30000
            }, { toast: false });
            const duplicateAction = duplicateMode === 'update' ? '更新' : '跳过';
            const duplicateSamples = (preview.sampleDuplicates || [])
                .slice(0, 3)
                .map(item => item.existingName || item.name)
                .filter(Boolean);
            const duplicateHint = duplicateSamples.length > 0
                ? ` 重复示例：${duplicateSamples.join('、')}。`
                : '';
            const confirmed = await showConfirm({
                title: '确认导入浏览器书签？',
                message: `解析到 ${preview.parsedBookmarks} 个书签，其中新增 ${preview.newBookmarks} 个、重复 ${preview.duplicateBookmarks} 个（将${duplicateAction}）、文件内重复 ${preview.duplicateInFile} 个；将新建 ${preview.newCategories} 个分类并复用 ${preview.reusedCategories} 个分类。${duplicateHint}`,
                confirmText: '开始导入',
                cancelText: '取消'
            });
            if (!confirmed) {
                showToast('导入已取消', 'info');
                return;
            }

            const data = await apiRequest(`/api/data/browser-import?duplicates=${duplicateMode}`, {
                method: 'POST',
                json: { html },
                timeoutMs: 30000
            }, { toast: false });
            await loadData();
            renderAll();
            showToast(
                `导入成功：新增 ${data.bookmarksAdded} 个，更新 ${data.bookmarksUpdated} 个，跳过 ${data.bookmarksSkipped + data.duplicateInFile} 个`,
                'success',
                { timeoutMs: 4600 }
            );
        } catch (err) {
            showToast('导入失败：' + err.message, 'error');
        }
    }, '导入中...');
    reader.readAsText(file);
    e.target.value = '';
}
