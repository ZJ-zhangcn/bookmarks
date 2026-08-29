import { DOM } from './dom.js';
import * as state from './state.js';
import { apiRequest, runWithButton } from './api-client.js';
import { loadData } from './api.js';
import { renderAll, renderBookmarks } from './render.js';
import { showToast, showConfirm } from './ux.js';

function visibleBookmarks() {
    const search = state.currentSearch.toLowerCase().trim();
    return state.bookmarks.filter(bookmark => {
        if (state.currentCategory !== 'all' && bookmark.category_id !== state.currentCategory) return false;
        if (!search) return true;
        const tags = Array.isArray(bookmark.tags) ? bookmark.tags.join(' ') : String(bookmark.tags || '');
        return [bookmark.name, bookmark.description, bookmark.url, tags]
            .some(value => String(value || '').toLowerCase().includes(search));
    });
}

function updateCategoryOptions() {
    if (!DOM.batchCategorySelect) return;
    DOM.batchCategorySelect.innerHTML = '<option value="">移动到分类...</option>' + state.categories
        .map(category => `<option value="${String(category.id).replace(/"/g, '&quot;')}">${String(category.name).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])}</option>`)
        .join('');
}

export function updateBatchUi() {
    if (!DOM.batchToolbar) return;
    DOM.batchToolbar.hidden = !state.batchMode;
    DOM.batchModeBtn?.classList.toggle('active', state.batchMode);
    if (DOM.batchSelectionCount) DOM.batchSelectionCount.textContent = `已选 ${state.batchSelectedIds.size}`;
    if (DOM.batchCategorySelect && state.batchMode && DOM.batchCategorySelect.options.length <= 1) updateCategoryOptions();
    document.querySelectorAll('.batch-select').forEach(input => {
        input.checked = state.batchSelectedIds.has(input.dataset.id);
    });
}

export function toggleBatchMode(force) {
    state.setBatchMode(force === undefined ? !state.batchMode : force);
    if (state.batchMode) updateCategoryOptions();
    updateBatchUi();
    renderBookmarks();
}

export function toggleBatchSelection(id, checked) {
    if (!id) return;
    if (checked) state.batchSelectedIds.add(id);
    else state.batchSelectedIds.delete(id);
    updateBatchUi();
    requestAnimationFrame(updateBatchUi);
}

function selectAllVisible() {
    const ids = visibleBookmarks().map(bookmark => bookmark.id);
    const allSelected = ids.length > 0 && ids.every(id => state.batchSelectedIds.has(id));
    ids.forEach(id => allSelected ? state.batchSelectedIds.delete(id) : state.batchSelectedIds.add(id));
    updateBatchUi();
}

async function executeBatch(button, action, payload = {}) {
    const ids = [...state.batchSelectedIds];
    if (ids.length === 0) {
        showToast('请先选择书签', 'info');
        return;
    }
    if (action === 'trash' && !await showConfirm({
        title: '批量移入回收站？',
        message: `确定将 ${ids.length} 个书签移入回收站吗？`,
        confirmText: '移入回收站',
        danger: true
    })) return;

    await runWithButton(button, async () => {
        const result = await apiRequest('/api/bookmarks/batch', {
            method: 'POST',
            json: { ids, action, payload }
        }, { errorPrefix: '批量整理失败' });
        await loadData();
        state.batchSelectedIds.clear();
        renderAll();
        updateBatchUi();
        const skipped = result?.skipped ? `，跳过 ${result.skipped}` : '';
        showToast(`已处理 ${result?.processed || 0} 个书签${skipped}`, 'success');
    }, '处理中...').catch(() => {});
}

export function bindBatchEvents() {
    DOM.batchModeBtn?.addEventListener('click', () => toggleBatchMode());
    DOM.batchCancelBtn?.addEventListener('click', () => toggleBatchMode(false));
    DOM.batchSelectAllBtn?.addEventListener('click', selectAllVisible);
    DOM.batchMoveBtn?.addEventListener('click', () => {
        const categoryId = DOM.batchCategorySelect?.value;
        if (!categoryId) return showToast('请选择目标分类', 'warning');
        executeBatch(DOM.batchMoveBtn, 'move', { category_id: categoryId });
    });
    DOM.batchAddTagsBtn?.addEventListener('click', () => {
        const tags = DOM.batchTagsInput?.value.trim();
        if (!tags) return showToast('请输入要添加的标签', 'warning');
        executeBatch(DOM.batchAddTagsBtn, 'add-tags', { tags });
    });
    DOM.batchRemoveTagsBtn?.addEventListener('click', () => {
        const tags = DOM.batchTagsInput?.value.trim();
        if (!tags) return showToast('请输入要删除的标签', 'warning');
        executeBatch(DOM.batchRemoveTagsBtn, 'remove-tags', { tags });
    });
    DOM.batchRefreshIconsBtn?.addEventListener('click', () => executeBatch(DOM.batchRefreshIconsBtn, 'refresh-icons'));
    DOM.batchTrashBtn?.addEventListener('click', () => executeBatch(DOM.batchTrashBtn, 'trash'));
}
