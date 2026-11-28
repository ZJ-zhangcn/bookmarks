/**
 * 数据同步模块：WebDAV 上传/下载、本地 JSON 导入导出、浏览器书签导入。
 * 从 settings.js 拆出，保持原有导出供延迟加载入口使用。
 */
import { DOM } from './dom.js';
import { loadData } from './api.js';
import { renderAll } from './render.js';
import { refreshIconLibraryCache } from './icon-library.js';
import { showToast, showConfirm } from './ux.js';
import { apiRequest, runWithButton } from './api-client.js';
import webdavHelpers from './webdav-helpers.cjs';
import { loadPersonalization } from './personalization.js';

const { buildWebdavStatusPanel } = webdavHelpers;

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
        const mode = DOM.webdavDownloadMode?.value === 'restore' ? 'restore' : 'merge';
        if (mode === 'restore') {
            const ok = await showConfirm({
                title: '完整恢复 WebDAV 备份？',
                message: '远端备份会替换当前书签、分类、搜索引擎、TODO、图标库和个性化设置。恢复前服务器会自动创建快照。',
                confirmText: '完整恢复',
                danger: true
            });
            if (!ok) return;
        }
        const data = await apiRequest('/api/webdav?action=download', {
            method: 'POST',
            json: { url, username: user, password: pass, path: filePath },
            timeoutMs: 60000
        }, { toast: false });
        if (!data) throw new Error('下载内容为空');
        await apiRequest(`/api/data?mode=${mode}`, {
                method: 'POST',
                json: data,
                timeoutMs: 60000
        }, { toast: false });
        await loadData();
        renderAll();
        await loadPersonalization();
        refreshIconLibraryCache();
        showWebdavStatus(mode === 'restore' ? '下载成功：已完整恢复！' : '下载成功：已合并导入！', 'success', { operation: '下载', path: filePath, includeIcons });
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
