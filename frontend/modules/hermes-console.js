import { DOM } from './dom.js';
import * as state from './state.js';
import {
    buildServiceDiagnoseInput,
    buildBookmarkOrganizeInput,
    renderHermesAnswer,
    escapeHtml
} from './hermes-console-helpers.js';

let pollTimer = null;
let currentContext = {};

function adminHeaders() {
    const token = DOM.hermesAdminToken?.value?.trim() || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function setStatus(text) {
    if (DOM.hermesStatusText) DOM.hermesStatusText.textContent = text || '';
}

function setResult(job) {
    if (DOM.hermesResult) DOM.hermesResult.innerHTML = renderHermesAnswer(job);
}

function normalizeAction(action) {
    const actions = state.hermesStatus?.actions || [];
    const allowed = new Set(actions.map(item => item.id));
    if (action && allowed.has(action)) return action;
    if (action) return action;
    return allowed.has('service_diagnose') ? 'service_diagnose' : 'command_panel';
}

export async function loadHermesStatus() {
    try {
        const res = await fetch(`${state.API_BASE}/api/hermes/status`, { cache: 'no-store' });
        const result = await res.json();
        if (result.success) state.setHermesStatus(result.data || {});
    } catch (e) {
        state.setHermesStatus({ configured: false, transport: null, model: null, actions: [] });
    }
    return state.hermesStatus;
}

export async function openHermesConsole(context = {}) {
    currentContext = context || {};
    if (!state.hermesStatus?.actions?.length) await loadHermesStatus();
    if (DOM.hermesAction) {
        const actions = state.hermesStatus?.actions || [];
        const options = actions.length ? actions : [
            { id: 'command_panel', label: '控制台提问' },
            { id: 'service_diagnose', label: '服务诊断' },
            { id: 'bookmark_organize', label: '整理书签' }
        ];
        DOM.hermesAction.innerHTML = options.map(action => `<option value="${escapeHtml(action.id)}">${escapeHtml(action.label || action.id)}</option>`).join('');
        DOM.hermesAction.value = normalizeAction(context.action || 'service_diagnose');
    }
    if (DOM.hermesQuestion) {
        DOM.hermesQuestion.value = context.note || '';
        DOM.hermesQuestion.placeholder = context.server?.id
            ? `例如：${context.server.name || context.server.id} 最近 502/离线，帮我判断先查什么`
            : '描述你想让 Hermes 分析的问题...';
    }
    setStatus(state.hermesStatus?.configured ? `已连接：${state.hermesStatus.transport || 'Hermes'} · ${state.hermesStatus.model || ''}` : 'Hermes 后端代理未配置');
    setResult(null);
    DOM.hermesModal?.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.hermesQuestion?.focus();
}

export function closeHermesConsole() {
    DOM.hermesModal?.classList.remove('open');
    document.body.style.overflow = '';
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function buildPayload(action) {
    const note = DOM.hermesQuestion?.value?.trim() || '';
    if (action === 'service_diagnose' || currentContext.server || currentContext.card) {
        return buildServiceDiagnoseInput({
            server: currentContext.server || {},
            card: currentContext.card || {},
            note
        });
    }
    if (action === 'bookmark_organize') {
        return buildBookmarkOrganizeInput({
            bookmarks: state.bookmarks || [],
            categories: state.categories || [],
            note
        });
    }
    return {
        kind: action,
        note,
        page: { href: window.location.href, origin: window.location.origin, title: document.title }
    };
}

async function pollJob(jobId) {
    const res = await fetch(`${state.API_BASE}/api/hermes/jobs/${encodeURIComponent(jobId)}`, {
        headers: adminHeaders(),
        cache: 'no-store'
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.error || `HTTP ${res.status}`);
    const job = result.data;
    state.setHermesCurrentJob(job);
    setResult(job);
    if (job.status === 'queued' || job.status === 'running') {
        pollTimer = setTimeout(() => pollJob(jobId).catch(handleHermesError), 1200);
    } else {
        setStatus(job.status === 'succeeded' ? '分析完成' : '分析失败');
        if (DOM.hermesRunBtn) DOM.hermesRunBtn.disabled = false;
    }
}

function handleHermesError(e) {
    setStatus('Hermes 调用失败');
    setResult({ status: 'failed', error: e.message || '未知错误' });
    if (DOM.hermesRunBtn) DOM.hermesRunBtn.disabled = false;
}

export async function runHermesConsole() {
    if (!DOM.hermesRunBtn) return;
    const action = normalizeAction(DOM.hermesAction?.value || 'command_panel');
    const input = buildPayload(action);
    const actionConfig = (state.hermesStatus?.actions || []).find(item => item.id === action);
    if (actionConfig?.requiresConfirmation && !confirm('该操作会把请求发送到 Hermes 控制台，确认继续？')) return;

    DOM.hermesRunBtn.disabled = true;
    setStatus('正在提交给 Hermes...');
    setResult({ status: 'running' });
    try {
        const res = await fetch(`${state.API_BASE}/api/hermes/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...adminHeaders() },
            body: JSON.stringify({ action, input, confirm: true })
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || `HTTP ${res.status}`);
        const job = result.data;
        state.setHermesCurrentJob(job);
        setResult(job);
        pollTimer = setTimeout(() => pollJob(job.id).catch(handleHermesError), 600);
    } catch (e) {
        handleHermesError(e);
    }
}

export function openServiceDiagnoseFromElement(el) {
    const slot = el?.closest?.('.server-monitor-slot');
    if (!slot) return;
    const serverId = slot.dataset.serverId || '';
    const server = window.__bookmarkMonitorServersById?.get?.(serverId) || state.monitorServerConfigs.find(item => item.id === serverId) || { id: serverId };
    const cardId = slot.dataset.id || slot.dataset.bookmarkId || '';
    const card = state.bookmarks.find(item => item.id === cardId) || { id: cardId, name: server.name || serverId, component_type: `server:${serverId}` };
    openHermesConsole({ action: 'service_diagnose', server, card });
}
