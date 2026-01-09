/**
 * 设置模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData } from './api.js';
import { renderAll } from './render.js';
import { renderCategoryList } from './category.js';
import { preloadImage } from './utils.js';
import { refreshIconLibraryCache } from './icon-library.js';

const WALLPAPER_HINT_KEY = 'wallpaper:lastOkUrl';
let wallpaperLoadSeq = 0;

// 主题管理
export function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    applyTheme(saved);
    if (DOM.themeSelect) {
        DOM.themeSelect.value = saved;
    }
}

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

export function openSettingsModal() {
    renderCategoryList();
    loadPersonalization();
    if (window.i18n) {
        DOM.languageSelect.value = window.i18n.getLanguage();
    }
    DOM.settingsModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeSettingsModal() {
    DOM.settingsModal.classList.remove('open');
    document.body.style.overflow = '';
}

export function closeAllModals() {
    [DOM.engineModal, DOM.bookmarkModal, DOM.categoryModal, DOM.settingsModal, DOM.bookmarkSearchOverlay].forEach(m => m?.classList.remove('open'));
    document.body.style.overflow = '';
}

export async function loadPersonalization() {
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
            await applyPersonalization(config);
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
        alert('保存成功！');
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

export async function applyPersonalization(config) {
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
        const seq = ++wallpaperLoadSeq;

        wallpaperLayer.classList.add('active');

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
            wallpaperImage.style.backgroundImage = `url(${url})`;
            if (bgDecoration) bgDecoration.style.display = 'none';
            localStorage.setItem(WALLPAPER_HINT_KEY, url);
        };
        const applyFailure = () => {
            if (seq !== wallpaperLoadSeq) return;
            wallpaperImage.style.backgroundImage = '';
            if (bgDecoration) bgDecoration.style.display = '';
        };

        if (hinted) {
            applySuccess();
            const img = new Image();
            img.onload = applySuccess;
            img.onerror = applyFailure;
            img.src = url;
        } else {
            const ok = await preloadImage(url, 1500);
            if (ok) {
                applySuccess();
            } else {
                applyFailure();
                const img = new Image();
                img.onload = applySuccess;
                img.onerror = applyFailure;
                img.src = url;
            }
        }

        document.body.style.backgroundImage = '';
    } else {
        wallpaperLayer.classList.remove('active');
        wallpaperImage.style.backgroundImage = '';

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

export async function loadDockerContainers() {
    DOM.dockerList.innerHTML = '<div class="docker-loading">加载中...</div>';
    try {
        const res = await fetch(`${state.API_BASE}/api/docker/containers`);
        const result = await res.json();

        if (!result.success || !result.data || result.data.length === 0) {
            DOM.dockerList.innerHTML = `<div class="docker-loading">${result.error || '没有找到容器'}</div>`;
            return;
        }

        DOM.dockerList.innerHTML = result.data.map(c => `
            <div class="docker-item" data-id="${c.id}">
                <div class="docker-item-info">
                    <div class="docker-item-name">${c.name}</div>
                    <div class="docker-item-image">${c.image}</div>
                </div>
                <span class="docker-status ${c.status === 'running' ? 'running' : 'stopped'}">
                    ${c.status === 'running' ? '运行中' : '已停止'}
                </span>
                <div class="docker-actions">
                    <label class="switch">
                        <input type="checkbox" ${c.status === 'running' ? 'checked' : ''} onchange="toggleContainer('${c.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                    <button class="btn btn-secondary btn-sm" onclick="restartContainer('${c.id}')">🔄</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        DOM.dockerList.innerHTML = '<div class="docker-loading">无法连接 Docker</div>';
    }
}

window.toggleContainer = async function(id, start) {
    const action = start ? 'start' : 'stop';
    try {
        await fetch(`${state.API_BASE}/api/docker/containers/${id}/${action}`, { method: 'POST' });
        setTimeout(loadDockerContainers, 1000);
    } catch (e) {
        alert('操作失败: ' + e.message);
    }
};

window.restartContainer = async function(id) {
    try {
        await fetch(`${state.API_BASE}/api/docker/containers/${id}/restart`, { method: 'POST' });
        setTimeout(loadDockerContainers, 1000);
    } catch (e) {
        alert('重启失败: ' + e.message);
    }
};

export function saveWebdavSettings() {
    localStorage.setItem('webdavUrl', DOM.webdavUrl.value);
    localStorage.setItem('webdavUser', DOM.webdavUser.value);
    localStorage.setItem('webdavPass', DOM.webdavPass.value);
    localStorage.setItem('webdavPath', DOM.webdavPath.value);
    showWebdavStatus('设置已保存', 'success');
}

export async function webdavUpload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();
    const includeIcons = DOM.includeIconsWebdav?.checked ?? true;

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error'); return; }

    try {
        showWebdavStatus('正在上传...', 'success');
        const exportRes = await fetch(`${state.API_BASE}/api/data?includeIcons=${includeIcons}`);
        const data = await exportRes.json();

        const response = await fetch(`${state.API_BASE}/api/webdav?action=upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, username: user, password: pass, path: filePath, data })
        });

        const result = await response.json();
        if (result.success) {
            showWebdavStatus('上传成功！' + (includeIcons ? '' : '（不含图标）'), 'success');
        } else {
            showWebdavStatus(result.error || '上传失败', 'error');
        }
    } catch (err) {
        showWebdavStatus('上传错误: ' + err.message, 'error');
    }
}

export async function webdavDownload() {
    const url = DOM.webdavUrl.value.trim();
    const user = DOM.webdavUser.value.trim();
    const pass = DOM.webdavPass.value;
    const filePath = DOM.webdavPath.value.trim();

    if (!url || !user || !pass) { showWebdavStatus('请填写完整配置', 'error'); return; }

    try {
        showWebdavStatus('正在下载...', 'success');

        const response = await fetch(`${state.API_BASE}/api/webdav?action=download`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, username: user, password: pass, path: filePath })
        });

        const result = await response.json();
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
            showWebdavStatus('下载成功！', 'success');
        } else {
            showWebdavStatus(result.error || '下载失败', 'error');
        }
    } catch (err) {
        showWebdavStatus('下载错误: ' + err.message, 'error');
    }
}

export function showWebdavStatus(msg, type) {
    DOM.webdavStatus.textContent = msg;
    DOM.webdavStatus.className = 'webdav-status ' + type;
    setTimeout(() => { DOM.webdavStatus.className = 'webdav-status'; }, 5000);
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
        alert('导出失败: ' + e.message);
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
                const choice = confirm(
                    `导入文件较大 (${sizeInMB.toFixed(1)}MB)，超出 Vercel 免费版 4.5MB 限制。\n\n` +
                    `点击"确定"：清理 base64 图标后导入（URL 和 emoji 图标会保留）\n` +
                    `点击"取消"：取消导入\n\n` +
                    `提示：导入后可使用"批量获取图标"功能重新获取被清理的图标`
                );

                if (!choice) {
                    alert('导入已取消');
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
                    alert(`清理后仍然较大 (${cleanedSize.toFixed(1)}MB)，请减少书签数量或联系管理员`);
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
            alert('导入成功！');
        } catch (err) {
            alert('导入失败：' + err.message);
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
            alert(`导入成功！\n分类: ${result.data.categories} 个\n书签: ${result.data.bookmarks} 个`);
        } catch (err) {
            alert('导入失败：' + err.message);
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}
