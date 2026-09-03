import apiClientCore from './api-client-core.cjs';
import { clearBootstrapCache } from './bootstrap-cache.js';

const { requestJson } = apiClientCore;

export function showAuthOverlay(message = '') {
    const overlay = document.getElementById('authOverlay');
    const error = document.getElementById('authError');
    if (!overlay) return;
    overlay.hidden = false;
    if (error) {
        error.textContent = message;
        error.hidden = !message;
    }
    document.getElementById('authUsername')?.focus();
}

function hideAuthOverlay() {
    const overlay = document.getElementById('authOverlay');
    if (overlay) overlay.hidden = true;
}

export async function checkSession() {
    try {
        const session = await requestJson('/api/auth/session', { cache: 'no-store' });
        const authCard = document.getElementById('authSettingsCard');
        globalThis.__BOOKMARK_NAV_SESSION_MODE__ = session?.required !== false;
        if (authCard) authCard.hidden = session?.required === false;
        if (session?.authenticated !== false) {
            hideAuthOverlay();
            return true;
        }
    } catch (_error) {
        // A missing session is rendered as the login screen below.
    }
    showAuthOverlay();
    return false;
}

export function bindAuthEvents(onAuthenticated) {
    const form = document.getElementById('authForm');
    const submit = document.getElementById('authSubmit');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = 'true';
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const username = document.getElementById('authUsername')?.value || '';
        const passwordInput = document.getElementById('authPassword');
        const password = passwordInput?.value || '';
        const error = document.getElementById('authError');
        if (submit) submit.disabled = true;
        if (error) error.hidden = true;
        try {
            await requestJson('/api/auth/login', { method: 'POST', json: { username, password }, retries: 0 });
            if (passwordInput) passwordInput.value = '';
            hideAuthOverlay();
            await onAuthenticated?.();
        } catch (requestError) {
            showAuthOverlay(requestError.message || '登录失败');
            passwordInput?.focus();
            passwordInput?.select();
        } finally {
            if (submit) submit.disabled = false;
        }
    });
}

export async function logout() {
    await requestJson('/api/auth/logout', { method: 'POST', retries: 0 });
    await clearBootstrapCache();
    showAuthOverlay();
}

export function isAuthRequiredError(error) {
    return error?.status === 401 || error?.code === 'AUTH_REQUIRED';
}
