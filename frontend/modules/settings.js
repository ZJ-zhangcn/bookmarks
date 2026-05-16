/**
 * 设置模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData } from './api.js';
import { renderAll } from './render.js';
import { renderCategoryList } from './category.js';
import { preloadImage, toSafeImageUrl, escapeHtmlAttribute } from './utils.js';
import { refreshIconLibraryCache } from './icon-library.js';
import { getMonitorServerConfigs } from './monitor.js';
import { showToast, showConfirm } from './ux.js';
import webdavHelpers from './webdav-helpers.cjs';

const { buildWebdavStatusPanel, parseJsonResponse } = webdavHelpers;

function buildMonitorEndpoint(origin = '', apiBase = '') {
    const base = String(apiBase || '').trim();
    const root = String(origin || '').trim().replace(/\/+$/, '');
    if (/^https?:\/\//i.test(base)) {
        return `${base.replace(/\/+$/, '')}/api/system/report`;
    }
    const path = base ? `/${base.replace(/^\/+|\/+$/g, '')}` : '';
    return `${root}${path}/api/system/report`;
}

const WALLPAPER_HINT_KEY = 'wallpaper:lastOkUrl';
let wallpaperLoadSeq = 0;
const INITIAL_WALLPAPER_WAIT_MS = 5000;

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
    loadMonitorServers();
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

const MONITOR_SERVER_CONFIGS_KEY = 'monitor:serverConfigs';

function defaultMonitorEndpoint() {
    return buildMonitorEndpoint(window.location.origin, state.API_BASE || '');
}

function renderMonitorServers(servers = []) {
    if (!DOM.monitorServerList) return;
    if (DOM.monitorEndpointInput && !DOM.monitorEndpointInput.value) {
        DOM.monitorEndpointInput.value = defaultMonitorEndpoint();
    }
    if (!servers.length) {
        DOM.monitorServerList.innerHTML = '<div class="server-empty">还没有服务器资料。先在上面添加一台服务器。</div>';
        renderBookmarkServerOptions();
        return;
    }
    DOM.monitorServerList.innerHTML = servers.map(server => `
        <div class="monitor-server-config compact" data-monitor-server-row data-server-id="${escapeHtmlAttribute(server.id || '')}">
            <div class="monitor-server-summary">
                <strong>${escapeHtmlAttribute(server.name || server.id || '')}</strong>
                <span>${escapeHtmlAttribute([server.id, server.region, server.role].filter(Boolean).join(' · '))}</span>
            </div>
            <button type="button" class="btn btn-danger btn-sm" data-action="remove-monitor-server">删除</button>
        </div>
    `).join('');
    DOM.monitorServerList.querySelectorAll('[data-action="remove-monitor-server"]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.closest('[data-monitor-server-row]')?.dataset.serverId;
            if (!id) return;
            const ok = await showConfirm({
                title: '删除服务器资料？',
                message: `删除 ${id} 的服务器资料。首页已添加的卡片不会自动删除。`,
                confirmText: '删除',
                danger: true
            });
            if (!ok) return;
            const next = getMonitorServerConfigs().filter(server => server.id !== id);
            await persistMonitorServers(next);
        });
    });
    renderBookmarkServerOptions();
}

export function renderBookmarkServerOptions() {
    if (!DOM.bookmarkServerId) return;
    const servers = getMonitorServerConfigs();
    if (!servers.length) {
        DOM.bookmarkServerId.innerHTML = '<option value="">请先在设置里添加服务器</option>';
        return;
    }
    DOM.bookmarkServerId.innerHTML = servers.map(server => `
        <option value="${escapeHtmlAttribute(server.id)}">${escapeHtmlAttribute(server.name || server.id)}${server.region ? ` · ${escapeHtmlAttribute(server.region)}` : ''}</option>
    `).join('');
}

function readMonitorForm() {
    return {
        id: DOM.monitorServerIdInput?.value.trim() || '',
        name: DOM.monitorServerNameInput?.value.trim() || '',
        region: DOM.monitorServerRegionInput?.value.trim() || '',
        role: DOM.monitorServerRoleInput?.value.trim() || '',
        enabled: true
    };
}

function clearMonitorForm() {
    if (DOM.monitorServerIdInput) DOM.monitorServerIdInput.value = '';
    if (DOM.monitorServerNameInput) DOM.monitorServerNameInput.value = '';
    if (DOM.monitorServerRegionInput) DOM.monitorServerRegionInput.value = '';
    if (DOM.monitorServerRoleInput) DOM.monitorServerRoleInput.value = '';
}

function escapeShellSingleQuote(value) {
    return String(value || '').replace(/'/g, `'"'"'`);
}

function buildInstallCommand(server, token, endpoint) {
    return `cd /root && curl -fsSL https://raw.githubusercontent.com/ZJ-zhangcn/bookmarks/main/scripts/monitor-agent.sh -o monitor-agent.sh && chmod +x monitor-agent.sh && MONITOR_ENDPOINT='${escapeShellSingleQuote(endpoint)}' MONITOR_AGENT_TOKEN='${escapeShellSingleQuote(token)}' MONITOR_SERVER_ID='${escapeShellSingleQuote(server.id)}' MONITOR_SERVER_NAME='${escapeShellSingleQuote(server.name || server.id)}' MONITOR_SERVER_REGION='${escapeShellSingleQuote(server.region || '')}' MONITOR_SERVER_ROLE='${escapeShellSingleQuote(server.role || '')}' nohup /root/monitor-agent.sh >/var/log/bookmarks-monitor-agent.log 2>&1 &`;
}

async function persistMonitorServers(servers) {
    const res = await fetch(`${state.API_BASE}/api/system/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || '保存失败');
    const saved = result.data?.servers || servers;
    state.setMonitorServerConfigs(saved);
    sessionStorage.setItem(MONITOR_SERVER_CONFIGS_KEY, JSON.stringify(saved));
    renderMonitorServers(saved);
    return true;
}

function existingMonitorServersFromRows() {
    return getMonitorServerConfigs();
}

export async function loadMonitorServers() {
    if (!DOM.monitorServerList) return;
    DOM.monitorServerList.innerHTML = '<div class="server-empty">加载中...</div>';
    try {
        const res = await fetch(`${state.API_BASE}/api/system/config`);
        const result = await res.json();
        const saved = result.success ? (result.data?.servers || []) : [];
        state.setMonitorServerConfigs(saved);
        sessionStorage.setItem(MONITOR_SERVER_CONFIGS_KEY, JSON.stringify(saved));
        renderMonitorServers(saved);
    } catch (e) {
        console.error('加载监控配置失败:', e);
        const cached = sessionStorage.getItem(MONITOR_SERVER_CONFIGS_KEY);
        let fallback = [];
        try { fallback = cached ? JSON.parse(cached) : []; } catch {}
        state.setMonitorServerConfigs(fallback);
        renderMonitorServers(fallback);
    }
}

export async function registerMonitorServer() {
    try {
        const server = readMonitorForm();
        if (!server.id || !server.name) {
            showToast('请填写服务器 ID 和显示名称', 'warning');
            return;
        }
        const next = [...existingMonitorServersFromRows().filter(item => item.id !== server.id), server];
        const saved = await persistMonitorServers(next);
        if (saved) {
            clearMonitorForm();
            showToast('服务器资料已保存。下一步：生成并在目标服务器执行 Agent 安装命令，然后在“添加书签 → 探针”里添加这台服务器卡片。', 'success', { timeoutMs: 5200 });
        }
    } catch (e) {
        showToast('保存服务器资料失败: ' + e.message, 'error');
    }
}

export function generateMonitorInstallCommand() {
    const server = readMonitorForm();
    const token = DOM.monitorAgentTokenInput?.value.trim() || '';
    const endpoint = DOM.monitorEndpointInput?.value.trim() || defaultMonitorEndpoint();
    if (!server.id || !server.name) {
        showToast('请先填写服务器 ID 和显示名称', 'warning');
        return;
    }
    if (!token) {
        showToast('请输入上报 Token。Token 必须是服务端 MONITOR_AGENT_TOKEN，不是服务器 ID；只用于生成命令，不会保存。', 'warning', { timeoutMs: 5200 });
        return;
    }
    if (token === server.id) {
        showToast('上报 Token 不能填服务器 ID。请填写 bookmarks 服务端 .env 中的 MONITOR_AGENT_TOKEN。', 'warning', { timeoutMs: 5200 });
        return;
    }
    if (DOM.monitorInstallCommand) {
        DOM.monitorInstallCommand.textContent = buildInstallCommand(server, token, endpoint);
    }
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
        };
        const applyFailure = () => {
            if (seq !== wallpaperLoadSeq) return;
            wallpaperLayer.classList.remove('active');
            wallpaperImage.style.backgroundImage = '';
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
