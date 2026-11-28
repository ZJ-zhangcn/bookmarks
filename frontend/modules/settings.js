/**
 * 设置模块（调度入口）
 *
 * 具体功能拆分到独立模块：
 * - personalization.js  个性化配置、壁纸与时钟
 * - data-sync.js        WebDAV 与本地数据导入导出
 * 这里保留弹窗控制、异地备份状态与发布信息，并重新导出各模块 API，
 * 以便现有延迟加载入口（events.js / main.js）无需修改。
 */
import { DOM } from './dom.js';
import { renderCategoryList } from './category.js';
import { apiRequest, runWithButton } from './api-client.js';
import { showToast } from './ux.js';
import { loadPersonalization } from './personalization.js';

export { initTheme, applyTheme, setTheme } from './theme.js';
export {
    getWallpaperToneFromLuminance,
    loadPersonalization,
    savePersonalization,
    applyPersonalization,
    startClock
} from './personalization.js';
export {
    saveWebdavSettings,
    webdavUpload,
    webdavDownload,
    showWebdavStatus,
    exportConfig,
    importConfig,
    importBrowserBookmarks
} from './data-sync.js';

export function openSettingsModal() {
    renderCategoryList();
    loadPersonalization();
    loadOffsiteStatus();
    bindOffsiteBackupEvents();
    DOM.settingsModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export async function loadOffsiteStatus() {
    if (!DOM.offsiteBackupStatus) return;
    try {
        const status = await apiRequest('/api/backup/offsite', { cache: 'no-store' }, { toast: false });
        if (!status?.enabled) {
            DOM.offsiteBackupStatus.textContent = '未启用（在服务端 .env 配置 DB_OFFSITE_* 后生效）';
        } else if (!status.configured) {
            DOM.offsiteBackupStatus.textContent = '已启用但配置不完整，请检查 WebDAV 环境变量';
        } else if (status.state === 'ok') {
            DOM.offsiteBackupStatus.textContent = `最近成功：${formatDate(status.lastSuccessAt)} · ${status.fileName || ''} · ${status.size || 0} 字节`;
        } else if (status.state === 'error') {
            DOM.offsiteBackupStatus.textContent = `最近失败：${status.lastError || '未知错误'}`;
        } else {
            DOM.offsiteBackupStatus.textContent = '已配置，尚未执行';
        }
    } catch (error) {
        DOM.offsiteBackupStatus.textContent = `状态读取失败：${error.message}`;
    }
}

function bindOffsiteBackupEvents() {
    if (DOM.offsiteBackupBtn?.dataset.bound === 'true') return;
    if (DOM.offsiteBackupBtn) DOM.offsiteBackupBtn.dataset.bound = 'true';
    DOM.offsiteBackupBtn?.addEventListener('click', async () => {
        await runWithButton(DOM.offsiteBackupBtn, async () => {
            try {
                await apiRequest('/api/backup/offsite', { method: 'POST' }, { errorPrefix: '异地备份失败' });
                await loadOffsiteStatus();
                showToast('异地备份完成', 'success');
            } catch {}
        }, '备份中...');
    });
}

function formatDate(value) {
    if (!value) return '未知时间';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN');
}

export function closeSettingsModal() {
    DOM.settingsModal.classList.remove('open');
    document.body.style.overflow = '';
}

export function closeAllModals() {
    [DOM.engineModal, DOM.bookmarkModal, DOM.categoryModal, DOM.settingsModal, DOM.todoModal].forEach(m => m?.classList.remove('open'));
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
