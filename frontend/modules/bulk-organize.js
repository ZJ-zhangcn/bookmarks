import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData } from './api.js';
import { renderAll } from './render.js';
import { showToast, showPrompt, showConfirm } from './ux.js';
import bulkHelpers from './bulk-helpers.cjs';

const { summarizeBulkSelection } = bulkHelpers;

function updateBulkToolbar() {
    let toolbar = document.querySelector('.bulk-organize-toolbar');
    if (!state.bulkOrganizeMode) {
        toolbar?.remove();
        DOM.bulkOrganizeBtn?.classList.remove('active');
        document.body.classList.remove('bulk-organize-active');
        return;
    }
    document.body.classList.add('bulk-organize-active');
    DOM.bulkOrganizeBtn?.classList.add('active');
    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'bulk-organize-toolbar';
        toolbar.innerHTML = `
            <span class="bulk-summary"></span>
            <button type="button" class="btn btn-secondary btn-sm" data-action="select-visible">选择当前页</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="clear">清空</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="move">移动到分类</button>
            <button type="button" class="btn btn-secondary btn-sm" data-action="exit">退出</button>
        `;
        toolbar.addEventListener('click', handleBulkToolbarClick);
        document.body.appendChild(toolbar);
    }
    toolbar.querySelector('.bulk-summary').textContent = summarizeBulkSelection(state.bulkSelectedIds);
    document.querySelectorAll('.bookmark-card').forEach(card => {
        card.classList.toggle('bulk-selected', state.bulkSelectedIds.has(card.dataset.id));
    });
}

async function handleBulkToolbarClick(e) {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'exit') return setBulkOrganizeMode(false);
    if (action === 'clear') {
        state.clearBulkSelectedIds();
        updateBulkToolbar();
        return;
    }
    if (action === 'select-visible') {
        document.querySelectorAll('.bookmark-card[data-id]').forEach(card => state.bulkSelectedIds.add(card.dataset.id));
        updateBulkToolbar();
        return;
    }
    if (action === 'move') {
        await moveSelectedBookmarksToCategory();
    }
}

export function setBulkOrganizeMode(enabled) {
    state.setBulkOrganizeMode(enabled);
    if (!enabled) state.clearBulkSelectedIds();
    updateBulkToolbar();
    renderAll();
}

export function toggleBulkOrganizeMode() {
    setBulkOrganizeMode(!state.bulkOrganizeMode);
}

export function handleBulkCardClick(card, event) {
    if (!state.bulkOrganizeMode || !card?.dataset.id) return false;
    event.preventDefault();
    event.stopPropagation();
    state.toggleBulkSelectedId(card.dataset.id);
    updateBulkToolbar();
    return true;
}

async function moveSelectedBookmarksToCategory() {
    if (state.bulkSelectedIds.size === 0) {
        showToast('请先选择要整理的书签', 'warning');
        return;
    }
    const categoryList = state.categories.map(c => `${c.name} (${c.id})`).join('\n');
    const target = await showPrompt({
        title: '移动到分类',
        message: `输入目标分类名称或 ID：\n${categoryList}`,
        inputLabel: '目标分类',
        confirmText: '移动'
    });
    if (!target) return;
    const normalized = target.trim().toLowerCase();
    const category = state.categories.find(c => String(c.id).toLowerCase() === normalized || String(c.name).toLowerCase() === normalized);
    if (!category) {
        showToast('没有找到这个分类', 'error');
        return;
    }
    const ok = await showConfirm({
        title: '确认批量移动？',
        message: `将 ${state.bulkSelectedIds.size} 个书签移动到“${category.name}”。`,
        confirmText: '移动'
    });
    if (!ok) return;
    const selected = state.bookmarks.filter(item => state.bulkSelectedIds.has(item.id));
    try {
        for (const item of selected) {
            await fetch(`${state.API_BASE}/api/bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...item, category_id: category.id })
            });
        }
        showToast(`已移动 ${selected.length} 个书签`, 'success');
        state.clearBulkSelectedIds();
        state.setBulkOrganizeMode(false);
        await loadData();
        renderAll();
        updateBulkToolbar();
    } catch (err) {
        showToast('批量移动失败: ' + err.message, 'error');
    }
}

export { updateBulkToolbar };
