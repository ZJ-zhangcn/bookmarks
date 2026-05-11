/**
 * AI 功能模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { showToast } from './ux.js';

export function getAiClientSettings() {
    return {
        apiBaseUrl: localStorage.getItem(state.AI_CLIENT_STORAGE.apiBaseUrl) || '',
        apiKey: localStorage.getItem(state.AI_CLIENT_STORAGE.apiKey) || '',
        model: localStorage.getItem(state.AI_CLIENT_STORAGE.model) || '',
        provider: localStorage.getItem(state.AI_CLIENT_STORAGE.provider) || ''
    };
}

export function loadAiClientSettingsToUi() {
    const cfg = getAiClientSettings();
    if (DOM.aiApiBaseUrl) DOM.aiApiBaseUrl.value = cfg.apiBaseUrl;
    if (DOM.aiProvider) DOM.aiProvider.value = cfg.provider;
    if (DOM.aiApiKey) DOM.aiApiKey.value = cfg.apiKey;
    if (DOM.aiModel) DOM.aiModel.value = cfg.model;
}

export function saveAiClientSettingsFromUi() {
    if (!DOM.aiApiBaseUrl || !DOM.aiApiKey || !DOM.aiModel || !DOM.aiProvider) return;
    localStorage.setItem(state.AI_CLIENT_STORAGE.apiBaseUrl, DOM.aiApiBaseUrl.value.trim());
    localStorage.setItem(state.AI_CLIENT_STORAGE.apiKey, DOM.aiApiKey.value.trim());
    localStorage.setItem(state.AI_CLIENT_STORAGE.model, DOM.aiModel.value.trim());
    localStorage.setItem(state.AI_CLIENT_STORAGE.provider, DOM.aiProvider.value.trim());
    updateAiSettingsServerHint();
    showToast('AI 设置已保存到当前浏览器', 'success');
}

export function clearAiClientSettings() {
    localStorage.removeItem(state.AI_CLIENT_STORAGE.apiBaseUrl);
    localStorage.removeItem(state.AI_CLIENT_STORAGE.apiKey);
    localStorage.removeItem(state.AI_CLIENT_STORAGE.model);
    localStorage.removeItem(state.AI_CLIENT_STORAGE.provider);
    loadAiClientSettingsToUi();
    updateAiSettingsServerHint();
    showToast('AI 设置已清除', 'success');
}

export function updateAiSettingsServerHint() {
    if (!DOM.aiSettingsServerHint) return;

    const enabled = Boolean(state.aiStatus && state.aiStatus.enabled);
    const provider = state.aiStatus?.provider ? String(state.aiStatus.provider).toUpperCase() : 'AI';
    const serverModel = state.aiStatus?.model ? String(state.aiStatus.model) : '';
    const allowKey = Boolean(state.aiStatus?.allowClientKey);
    const allowBaseUrl = Boolean(state.aiStatus?.allowClientBaseUrl);
    const allowProvider = Boolean(state.aiStatus?.allowClientProvider);
    const hasServerKey = Boolean(state.aiStatus?.hasServerKey);

    if (!enabled) {
        DOM.aiSettingsServerHint.textContent = '服务器未开启 AI（AI_ENABLED!=true）';
        return;
    }

    const lines = [];
    lines.push(`${provider}${serverModel ? ` · 默认模型 ${serverModel}` : ''}`);
    lines.push(hasServerKey ? '服务器已配置 Key' : '服务器未配置 Key');
    lines.push(allowKey ? '允许前端传入 Key' : '不允许前端传入 Key');
    lines.push(allowBaseUrl ? '允许前端覆盖 API 地址' : '不允许前端覆盖 API 地址');
    lines.push(allowProvider ? '允许前端覆盖 Provider' : '不允许前端覆盖 Provider');
    DOM.aiSettingsServerHint.textContent = lines.join('\n');
}

export function updateAiUiVisibility() {
    if (!DOM.bookmarkAiActions || !DOM.aiStatusHint) return;
    const enabled = Boolean(state.aiStatus && state.aiStatus.enabled);
    DOM.bookmarkAiActions.style.display = enabled ? '' : 'none';
    if (enabled) {
        const provider = state.aiStatus.provider ? String(state.aiStatus.provider).toUpperCase() : 'AI';
        const model = state.aiStatus.model ? ` · ${state.aiStatus.model}` : '';
        DOM.aiStatusHint.textContent = `${provider}${model}`;
    } else {
        DOM.aiStatusHint.textContent = '';
    }
}

export function setAiButtonsDisabled(disabled) {
    if (DOM.aiGenerateBtn) DOM.aiGenerateBtn.disabled = Boolean(disabled);
    if (DOM.aiRefineBtn) DOM.aiRefineBtn.disabled = Boolean(disabled);
}

export function buildLocalFallbackSummary({ name, url, tags }) {
    const safeName = String(name || '').trim();
    const safeUrl = String(url || '').trim();
    const tag0 = Array.isArray(tags) && tags[0] ? String(tags[0]).trim() : '';

    let host = '';
    try { host = new URL(safeUrl).hostname.replace(/^www\./, ''); } catch {}

    const subject = safeName || host || '该站点';
    if (tag0) return `${subject}：${tag0}相关站点`.slice(0, 40);
    return `${subject}：常用网站`.slice(0, 40);
}
