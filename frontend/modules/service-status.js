/**
 * 服务状态前端模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { escapeHtml, escapeHtmlAttribute, toSafeExternalUrl } from './utils.js';
import { showToast, showConfirm } from './ux.js';

const POLL_INTERVAL_MS = 30000;

function getStatusMeta(status) {
    if (status === 'ok') return { label: '正常', className: 'ok', dot: '●' };
    if (status === 'down') return { label: '异常', className: 'down', dot: '●' };
    return { label: '未检查', className: 'unchecked', dot: '●' };
}

function formatLatency(latencyMs) {
    const value = Number(latencyMs);
    if (!Number.isFinite(value)) return '—';
    return `${Math.max(0, Math.round(value))} ms`;
}

function formatCheckedAt(value) {
    if (!value) return '尚未检查';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '尚未检查';
    return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getLatestCheckedAt(services) {
    const latest = services
        .map(service => service.checked_at ? new Date(service.checked_at).getTime() : 0)
        .filter(value => Number.isFinite(value) && value > 0)
        .sort((a, b) => b - a)[0];
    return latest ? new Date(latest).toISOString() : null;
}

export function renderServiceStatusCards(services = state.serviceStatuses) {
    if (!DOM.serviceStatusGrid || !DOM.serviceStatusContainer) return;

    if (!services.length) {
        DOM.serviceStatusGrid.innerHTML = `
            <div class="service-status-empty">
                <strong>尚未配置监控服务</strong>
                <span>可在设置 → 高级 → 服务状态中添加健康检查 URL。</span>
            </div>
        `;
        if (DOM.serviceStatusUpdatedAt) DOM.serviceStatusUpdatedAt.textContent = '尚未检查';
        return;
    }

    DOM.serviceStatusGrid.innerHTML = services.map(service => {
        const meta = getStatusMeta(service.status);
        const httpStatus = service.http_status ? `HTTP ${escapeHtml(service.http_status)}` : 'HTTP —';
        const checkedAt = formatCheckedAt(service.checked_at);
        const error = service.error_message
            ? `<div class="service-status-error" title="${escapeHtmlAttribute(service.error_message)}">${escapeHtml(service.error_message)}</div>`
            : '';

        return `
            <article class="service-status-card ${meta.className}">
                <div class="service-status-card-head">
                    <div>
                        <h3>${escapeHtml(service.name)}</h3>
                        <a href="${toSafeExternalUrl(service.url)}" target="_blank" rel="noopener">${escapeHtml(service.url)}</a>
                    </div>
                    <span class="service-status-badge ${meta.className}">${meta.dot} ${meta.label}</span>
                </div>
                <div class="service-status-metrics">
                    <span>${httpStatus}</span>
                    <span>${formatLatency(service.latency_ms)}</span>
                    <span>${escapeHtml(checkedAt)}</span>
                </div>
                ${error}
            </article>
        `;
    }).join('');

    const latest = getLatestCheckedAt(services);
    if (DOM.serviceStatusUpdatedAt) {
        DOM.serviceStatusUpdatedAt.textContent = latest ? `最近检查 ${formatCheckedAt(latest)}` : '尚未检查';
    }
}

export function renderServiceStatusSettings(services = state.serviceStatuses) {
    if (!DOM.serviceStatusList) return;
    if (!services.length) {
        DOM.serviceStatusList.innerHTML = '<div class="service-status-settings-empty">暂无服务</div>';
        return;
    }

    DOM.serviceStatusList.innerHTML = services.map(service => {
        const meta = getStatusMeta(service.status);
        const enabledText = service.enabled ? '已启用' : '已停用';
        return `
            <div class="service-status-setting-item" data-id="${escapeHtmlAttribute(service.id)}">
                <div class="service-status-setting-main">
                    <strong>${escapeHtml(service.name)}</strong>
                    <span>${escapeHtml(service.url)}</span>
                    <small>${enabledText} · ${meta.label} · ${formatLatency(service.latency_ms)}</small>
                </div>
                <div class="service-status-setting-actions">
                    <button class="btn btn-secondary btn-sm service-status-edit" data-id="${escapeHtmlAttribute(service.id)}" type="button">编辑</button>
                    <button class="btn btn-secondary btn-sm service-status-check-one" data-id="${escapeHtmlAttribute(service.id)}" type="button">检查</button>
                    <button class="btn btn-danger btn-sm service-status-delete" data-id="${escapeHtmlAttribute(service.id)}" type="button">删除</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderAllServiceStatus(services = state.serviceStatuses) {
    renderServiceStatusCards(services);
    renderServiceStatusSettings(services);
}

async function parseApiResponse(response) {
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
        throw new Error(result?.error || `HTTP ${response.status}`);
    }
    return result.data;
}

export async function loadServiceStatuses({ silent = true } = {}) {
    try {
        const response = await fetch(`${state.API_BASE}/api/service-status`, { cache: 'no-store' });
        const data = await parseApiResponse(response);
        state.setServiceStatuses(data || []);
        renderAllServiceStatus();
        return state.serviceStatuses;
    } catch (error) {
        if (!silent) showToast(`加载服务状态失败：${error.message}`, 'error');
        renderAllServiceStatus();
        return state.serviceStatuses;
    }
}

export async function checkServiceStatuses(id = null) {
    if (DOM.serviceStatusRefresh) DOM.serviceStatusRefresh.disabled = true;
    try {
        await parseApiResponse(await fetch(`${state.API_BASE}/api/service-status/check`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(id ? { id } : {})
        }));
        await loadServiceStatuses({ silent: false });
        showToast('服务状态已刷新', 'success');
    } catch (error) {
        showToast(`刷新服务状态失败：${error.message}`, 'error');
    } finally {
        if (DOM.serviceStatusRefresh) DOM.serviceStatusRefresh.disabled = false;
    }
}

function resetServiceStatusForm() {
    state.setEditingServiceStatusId(null);
    if (DOM.serviceStatusName) DOM.serviceStatusName.value = '';
    if (DOM.serviceStatusUrl) DOM.serviceStatusUrl.value = '';
    if (DOM.serviceStatusEnabled) DOM.serviceStatusEnabled.checked = true;
    if (DOM.serviceStatusSaveBtn) DOM.serviceStatusSaveBtn.textContent = '添加服务';
    if (DOM.serviceStatusFormHint) DOM.serviceStatusFormHint.textContent = '';
}

function startEditServiceStatus(id) {
    const service = state.serviceStatuses.find(item => String(item.id) === String(id));
    if (!service) return;
    state.setEditingServiceStatusId(service.id);
    if (DOM.serviceStatusName) DOM.serviceStatusName.value = service.name || '';
    if (DOM.serviceStatusUrl) DOM.serviceStatusUrl.value = service.url || '';
    if (DOM.serviceStatusEnabled) DOM.serviceStatusEnabled.checked = service.enabled !== false;
    if (DOM.serviceStatusSaveBtn) DOM.serviceStatusSaveBtn.textContent = '保存服务';
    if (DOM.serviceStatusFormHint) DOM.serviceStatusFormHint.textContent = `正在编辑：${service.name || '未命名服务'}`;
    DOM.serviceStatusName?.focus();
}

export async function saveServiceStatusFromUi() {
    const name = DOM.serviceStatusName?.value.trim() || '';
    const url = DOM.serviceStatusUrl?.value.trim() || '';
    const enabled = DOM.serviceStatusEnabled?.checked ?? true;

    if (!name || !url) {
        if (DOM.serviceStatusFormHint) DOM.serviceStatusFormHint.textContent = '请填写服务名和 URL';
        showToast('请填写服务名和 URL', 'error');
        return;
    }

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        showToast('服务 URL 格式不合法', 'error');
        return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        showToast('服务 URL 仅允许 http/https', 'error');
        return;
    }

    try {
        const payload = { name, url, enabled };
        if (state.editingServiceStatusId) payload.id = state.editingServiceStatusId;
        await parseApiResponse(await fetch(`${state.API_BASE}/api/service-status/services`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }));
        const wasEditing = Boolean(state.editingServiceStatusId);
        resetServiceStatusForm();
        await loadServiceStatuses({ silent: false });
        showToast(wasEditing ? '服务已更新' : '服务已添加', 'success');
    } catch (error) {
        showToast(`保存服务失败：${error.message}`, 'error');
    }
}

export async function handleServiceStatusSettingsClick(event) {
    const editBtn = event.target.closest('.service-status-edit');
    const deleteBtn = event.target.closest('.service-status-delete');
    const checkBtn = event.target.closest('.service-status-check-one');

    if (editBtn) {
        startEditServiceStatus(editBtn.dataset.id);
        return;
    }

    if (checkBtn) {
        await checkServiceStatuses(checkBtn.dataset.id);
        return;
    }

    if (!deleteBtn) return;
    const id = deleteBtn.dataset.id;
    const service = state.serviceStatuses.find(item => String(item.id) === String(id));
    const confirmed = await showConfirm({
        title: '删除监控服务',
        message: `确定删除「${service?.name || '该服务'}」吗？`,
        confirmText: '删除',
        cancelText: '取消'
    });
    if (!confirmed) return;

    try {
        await parseApiResponse(await fetch(`${state.API_BASE}/api/service-status/services/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        }));
        if (String(state.editingServiceStatusId) === String(id)) resetServiceStatusForm();
        await loadServiceStatuses({ silent: false });
        showToast('服务已删除', 'success');
    } catch (error) {
        showToast(`删除服务失败：${error.message}`, 'error');
    }
}

export function initServiceStatusUi() {
    renderAllServiceStatus();
    loadServiceStatuses();

    if (state.serviceStatusInterval) return;
    state.setServiceStatusInterval(setInterval(() => {
        loadServiceStatuses();
    }, POLL_INTERVAL_MS));
}
