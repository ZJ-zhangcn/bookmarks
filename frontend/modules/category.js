/**
 * 分类管理模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData, saveCollapsedState } from './api.js';
import { renderAll, renderCategoryNav, renderBookmarks } from './render.js';
import { escapeHtml, escapeHtmlAttribute } from './utils.js';
import { showToast, showConfirm } from './ux.js';
import { apiRequest, runWithButton } from './api-client.js';

export function openCategoryModal(categoryId = null) {
    state.setEditingCategoryId(categoryId);

    if (categoryId) {
        DOM.categoryModalTitle.textContent = '编辑分类';
        const cat = state.categories.find(c => c.id === categoryId);
        if (cat) {
            DOM.categoryInputName.value = cat.name;
        }
    } else {
        DOM.categoryModalTitle.textContent = '添加分类';
        DOM.categoryInputName.value = '';
    }

    DOM.categoryModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeCategoryModal() {
    DOM.categoryModal.classList.remove('open');
    document.body.style.overflow = '';
    state.setEditingCategoryId(null);
}

export async function saveCategory() {
    const name = DOM.categoryInputName.value.trim();
    const icon = '📁';

    if (!name) { showToast('请填写分类名称', 'warning'); return; }

    try {
        await runWithButton(DOM.saveCategoryBtn, () => apiRequest('/api/categories', {
            method: 'POST',
            json: { id: state.editingCategoryId, name, icon }
        }, { errorPrefix: '保存分类失败' }), '保存中...');
        await loadData();
        renderAll();
        renderCategoryList();
        closeCategoryModal();
        showToast('分类已保存', 'success');
    } catch {
        // apiRequest 已统一提示
    }
}

export async function deleteCategory(id) {
    const ok = await showConfirm({
        title: '删除分类？',
        message: '确定删除此分类？分类下的书签也将被删除。',
        confirmText: '删除',
        danger: true
    });
    if (!ok) return;

    try {
        await apiRequest(`/api/categories?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, { errorPrefix: '删除分类失败' });
        await loadData();
        renderAll();
        renderCategoryList();
    } catch {
        // apiRequest 已统一提示
    }
}

export function renderCategoryList() {
    DOM.categoryList.innerHTML = state.categories.map((c, index) => `
        <div class="category-list-item" data-id="${escapeHtmlAttribute(c.id)}" data-index="${index}" draggable="true">
            <span class="drag-handle" title="拖拽排序">⋮⋮</span>
            <span class="category-list-name">${escapeHtml(c.name)}</span>
            <button class="engine-action-btn edit" data-id="${escapeHtmlAttribute(c.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
            <button class="engine-action-btn delete" data-id="${escapeHtmlAttribute(c.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
    `).join('');

    DOM.categoryList.onclick = e => {
        const editBtn = e.target.closest('.engine-action-btn.edit');
        const deleteBtn = e.target.closest('.engine-action-btn.delete');
        if (editBtn) openCategoryModal(editBtn.dataset.id);
        if (deleteBtn) deleteCategory(deleteBtn.dataset.id);
    };

    let draggedItem = null;

    DOM.categoryList.querySelectorAll('.category-list-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
            saveCategoryOrder();
        });

        item.addEventListener('dragover', e => {
            e.preventDefault();
            if (!draggedItem || draggedItem === item) return;

            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;

            if (e.clientY < midY) {
                item.parentNode.insertBefore(draggedItem, item);
            } else {
                item.parentNode.insertBefore(draggedItem, item.nextSibling);
            }
        });
    });
}

export async function saveCategoryOrder() {
    const items = DOM.categoryList.querySelectorAll('.category-list-item');
    const order = Array.from(items).map((item, index) => ({
        id: item.dataset.id,
        sort_order: index
    }));

    try {
        await apiRequest('/api/categories', {
            method: 'PUT',
            json: { order }
        }, { errorPrefix: '保存分类排序失败' });
        await loadData();
        renderCategoryNav();
        renderBookmarks();
    } catch {
        // apiRequest 已统一提示
    }
}

export function toggleCategoryCollapse(categoryId) {
    const section = document.querySelector(`.category-section[data-category-id="${categoryId}"]`);
    if (!section) return;

    const grid = section.querySelector('.bookmarks-grid');
    const collapseBtn = section.querySelector('.collapse-btn');
    const isCollapsed = state.collapsedCategories.has(categoryId);

    if (isCollapsed) {
        state.collapsedCategories.delete(categoryId);
        section.classList.remove('collapsed');
        grid.style.display = '';
        collapseBtn.title = '折叠';
    } else {
        state.collapsedCategories.add(categoryId);
        section.classList.add('collapsed');
        grid.style.display = 'none';
        collapseBtn.title = '展开';
    }

    saveCollapsedState();
}

export async function createCategoryForBookmark(name) {
    try {
        const category = await apiRequest('/api/categories', {
            method: 'POST',
            json: { name, icon: '📁' }
        }, { errorPrefix: '创建分类失败' });
        if (category) {
            state.categories.push(category);
            renderCategoryNav();
            DOM.bookmarkInputCategory.innerHTML = state.categories.map(c =>
                `<option value="${escapeHtmlAttribute(c.id)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`
            ).join('') + '<option value="__new__">+ 新建分类...</option>';
            DOM.bookmarkInputCategory.value = category.id;
            return category;
        }
    } catch {
        // apiRequest 已统一提示
    }
    return null;
}
