import * as state from './state.js';
import apiClientCore from './api-client-core.cjs';
import { showToast } from './ux.js';
import { isAuthRequiredError } from './auth.js';

const { requestJson, withButtonPending } = apiClientCore;

export async function apiRequest(path, options = {}, feedback = {}) {
    try {
        return await requestJson(path, {
            baseUrl: state.API_BASE,
            ...options
        });
    } catch (error) {
        if (isAuthRequiredError(error)) {
            globalThis.dispatchEvent?.(new CustomEvent('bookmark-nav-auth-required'));
        }
        if (feedback.toast !== false) {
            const prefix = feedback.errorPrefix || '操作失败';
            showToast(`${prefix}：${error.message}`, 'error', { timeoutMs: 4800 });
        }
        throw error;
    }
}

export function runWithButton(button, task, pendingText) {
    return withButtonPending(button, task, { pendingText });
}
