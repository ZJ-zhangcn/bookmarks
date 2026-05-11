/**
 * Lightweight UX helpers: toast notifications, confirm dialog, and mobile category switcher data.
 */
import { escapeHtml, escapeHtmlAttribute } from './utils.js';

export function buildCategorySheetItems({ categories = [], bookmarks = [] } = {}) {
    const countByCategory = new Map();
    for (const bookmark of bookmarks || []) {
        const categoryId = bookmark?.category_id;
        if (!categoryId) continue;
        countByCategory.set(categoryId, (countByCategory.get(categoryId) || 0) + 1);
    }

    return [
        {
            id: 'all',
            name: '全部',
            icon: '📚',
            count: Array.isArray(bookmarks) ? bookmarks.length : 0
        },
        ...(categories || []).map(category => ({
            id: category.id,
            name: category.name,
            icon: category.icon || '📁',
            count: countByCategory.get(category.id) || 0
        }))
    ];
}

export function buildCategoryFabLabel(items, currentCategory = 'all') {
    const current = items.find(item => String(item.id) === String(currentCategory)) || items[0] || {
        icon: '📚',
        name: '全部',
        count: 0
    };
    return `${current.icon || ''} ${current.name} · ${current.count}个`.trim();
}

export function createNotifier({ container, document: doc = document, maxToasts = 4, timeoutMs = 2600 } = {}) {
    function trimQueue() {
        let nodes = Array.from(container.querySelectorAll ? container.querySelectorAll('.toast-message') : []);
        while (nodes.length > maxToasts) {
            const node = nodes.shift();
            node?.remove?.();
        }
    }

    function showToast(message, type = 'info', options = {}) {
        if (!container || !doc) return null;
        const toast = doc.createElement('div');
        toast.className = `toast-message toast-${type}`;
        toast.dataset.type = type;
        toast.textContent = String(message || '');
        container.appendChild(toast);
        trimQueue();

        const duration = options.timeoutMs ?? timeoutMs;
        if (duration > 0) {
            setTimeout(() => {
                toast.classList?.add?.('leaving');
                setTimeout(() => toast.remove?.(), 180);
            }, duration);
        }
        return toast;
    }

    return { showToast };
}

let notifier = null;

export function initUxFeedback() {
    const toastContainer = document.getElementById('toastContainer');
    if (toastContainer) notifier = createNotifier({ container: toastContainer });
}

export function showToast(message, type = 'info', options = {}) {
    if (!notifier) initUxFeedback();
    return notifier?.showToast(message, type, options) || null;
}

export function showConfirm({
    title = '确认操作',
    message = '',
    confirmText = '确认',
    cancelText = '取消',
    danger = false,
    input = false,
    inputLabel = '输入内容',
    inputPlaceholder = '',
    inputValue = ''
} = {}) {
    const overlay = document.getElementById('confirmOverlay');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmAccept');
    const cancelBtn = document.getElementById('confirmCancel');
    const inputWrap = document.getElementById('confirmInputWrap');
    const inputEl = document.getElementById('confirmInput');
    const inputLabelEl = document.getElementById('confirmInputLabel');
    if (!overlay || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
        return Promise.resolve(window.confirm(message || title));
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;
    confirmBtn.classList.toggle('btn-danger', danger);
    confirmBtn.classList.toggle('btn-primary', !danger);
    if (inputWrap && inputEl) {
        inputWrap.style.display = input ? '' : 'none';
        inputEl.value = inputValue || '';
        inputEl.placeholder = inputPlaceholder || '';
        if (inputLabelEl) inputLabelEl.textContent = inputLabel;
    }
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    return new Promise(resolve => {
        let settled = false;
        const cleanup = value => {
            if (settled) return;
            settled = true;
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            overlay.removeEventListener('click', onOverlayClick);
            document.removeEventListener('keydown', onKeydown);
            resolve(value);
        };
        const onConfirm = () => cleanup(input && inputEl ? inputEl.value : true);
        const onCancel = () => cleanup(input ? null : false);
        const onOverlayClick = event => { if (event.target === overlay) cleanup(input ? null : false); };
        const onKeydown = event => {
            if (event.key === 'Escape') cleanup(input ? null : false);
            if (input && event.key === 'Enter' && document.activeElement === inputEl) cleanup(inputEl.value);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        overlay.addEventListener('click', onOverlayClick);
        document.addEventListener('keydown', onKeydown);
        setTimeout(() => (input && inputEl ? inputEl : confirmBtn).focus(), 0);
    });
}

export function showPrompt(options = {}) {
    return showConfirm({
        title: options.title || '输入内容',
        message: options.message || '',
        confirmText: options.confirmText || '确认',
        cancelText: options.cancelText || '取消',
        input: true,
        inputLabel: options.inputLabel || options.label || '输入内容',
        inputPlaceholder: options.inputPlaceholder || options.placeholder || '',
        inputValue: options.inputValue || options.defaultValue || ''
    });
}

export function getReadableError(error, fallback = '操作失败') {
    if (!error) return fallback;
    return error.message ? `${fallback}: ${error.message}` : `${fallback}: ${String(error)}`;
}

export function renderCategorySheet({ grid, categories, bookmarks, currentCategory }) {
    if (!grid) return [];
    const items = buildCategorySheetItems({ categories, bookmarks });
    grid.innerHTML = items.map(item => `
        <button type="button" class="category-sheet-btn${String(item.id) === String(currentCategory) ? ' active' : ''}" data-category="${escapeHtmlAttribute(item.id)}">
            <span class="category-sheet-icon">${escapeHtml(item.icon || '')}</span>
            <span class="category-sheet-name">${escapeHtml(item.name)}</span>
            <span class="category-sheet-count">${item.count}个</span>
        </button>
    `).join('');
    return items;
}
