/**
 * 搜索引擎管理模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData } from './api.js';
import { renderEngineDropdown, updateEngineDisplay } from './render.js';
import { loadIconLibrary } from './icon-library.js';
import { toSafeDataImageUrl, toSafeImageUrl, escapeHtml, escapeHtmlAttribute } from './utils.js';

export function openEngineModal() {
    renderEngineList();
    resetEngineForm();
    DOM.engineModal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

export function closeEngineModal() {
    DOM.engineModal.classList.remove('open');
    document.body.style.overflow = '';
}

export function renderEngineList() {
    DOM.engineList.innerHTML = state.engines.map((e, index) => {
        const iconHtml = e.icon && (e.icon.startsWith('http') || e.icon.startsWith('data:'))
            ? `<img src="${toSafeImageUrl(e.icon)}" style="width:20px;height:20px;">`
            : escapeHtml(e.icon || '🔍');
        return `
        <div class="engine-list-item" draggable="true" data-id="${escapeHtmlAttribute(e.id)}" data-index="${index}">
            <div class="engine-drag-handle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/>
                    <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                    <circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>
                </svg>
            </div>
            <div class="engine-list-icon">${iconHtml}</div>
            <div class="engine-list-info">
                <div class="engine-list-name">${escapeHtml(e.name)}${index === 0 ? ' <span class="engine-default-badge">默认</span>' : ''}</div>
                <div class="engine-list-url">${escapeHtml(e.url)}</div>
            </div>
            <div class="engine-list-actions">
                <button class="engine-action-btn edit" data-id="${escapeHtmlAttribute(e.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                <button class="engine-action-btn delete" data-id="${escapeHtmlAttribute(e.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
        </div>
    `;
    }).join('');

    initEngineDragSort();
}

export function handleEngineListClick(e) {
    const editBtn = e.target.closest('.engine-action-btn.edit');
    const deleteBtn = e.target.closest('.engine-action-btn.delete');
    if (editBtn) editEngine(editBtn.dataset.id);
    if (deleteBtn) deleteEngine(deleteBtn.dataset.id);
}

export function editEngine(id) {
    const engine = state.engines.find(e => e.id === id);
    if (!engine) return;
    state.setEditingEngineId(id);
    DOM.engineInputName.value = engine.name;
    DOM.engineInputUrl.value = engine.url;

    if (engine.icon && engine.icon.startsWith('http')) {
        DOM.engineIconPreview.innerHTML = `<img src="${toSafeImageUrl(engine.icon)}">`;
        DOM.engineInputIconUrl.value = engine.icon;
    } else if (engine.icon && engine.icon.startsWith('data:')) {
        DOM.engineIconPreview.innerHTML = `<img src="${toSafeDataImageUrl(engine.icon)}">`;
        DOM.engineInputIconUrl.value = '';
    } else {
        DOM.engineIconPreview.innerHTML = `<span>${escapeHtml(engine.icon || '🔍')}</span>`;
        DOM.engineInputIconUrl.value = '';
    }

    DOM.formTitle.textContent = '编辑搜索引擎';
    DOM.saveEngineBtnText.textContent = '保存';
    DOM.cancelEditBtn.style.display = 'inline-flex';
}

export async function saveEngine() {
    const name = DOM.engineInputName.value.trim();
    const url = DOM.engineInputUrl.value.trim();
    let icon = DOM.engineInputIconUrl.value.trim();
    if (!icon && DOM.engineIconPreview.dataset.iconUrl) {
        icon = DOM.engineIconPreview.dataset.iconUrl;
    }
    icon = icon || '🔍';

    if (!name || !url) { alert('请填写名称和 URL'); return; }

    try {
        await fetch(`${state.API_BASE}/api/engines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.editingEngineId, name, icon, url })
        });
        await loadData();
        renderEngineDropdown();
        renderEngineList();
        resetEngineForm();
        DOM.engineIconLibrary.style.display = 'none';
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

export async function deleteEngine(id) {
    if (!confirm('确定删除？')) return;
    try {
        await fetch(`${state.API_BASE}/api/engines?id=${id}`, { method: 'DELETE' });
        await loadData();
        renderEngineDropdown();
        renderEngineList();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

export function resetEngineForm() {
    state.setEditingEngineId(null);
    DOM.engineInputName.value = '';
    DOM.engineInputIconUrl.value = '';
    DOM.engineInputUrl.value = '';
    DOM.engineIconPreview.innerHTML = '<span>🔍</span>';
    delete DOM.engineIconPreview.dataset.iconUrl;
    DOM.formTitle.textContent = '添加搜索引擎';
    DOM.saveEngineBtnText.textContent = '添加';
    DOM.cancelEditBtn.style.display = 'none';
    DOM.engineIconLibrary.style.display = 'none';
}

export function initEngineDragSort() {
    const items = DOM.engineList.querySelectorAll('.engine-list-item');
    let draggedItem = null;

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
            saveEngineOrder();
        });

        item.addEventListener('dragover', (e) => {
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

export async function saveEngineOrder() {
    const items = DOM.engineList.querySelectorAll('.engine-list-item');
    const orders = [];

    items.forEach((item, index) => {
        orders.push({ id: item.dataset.id, sort_order: index });
    });

    try {
        await fetch(`${state.API_BASE}/api/engines`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orders })
        });

        await loadData();
        renderEngineDropdown();
        renderEngineList();
        updateEngineDisplay();
    } catch (e) {
        console.error('保存排序失败:', e);
    }
}

export function toggleEngineIconLibrary() {
    const isVisible = DOM.engineIconLibrary.style.display !== 'none';
    if (isVisible) {
        DOM.engineIconLibrary.style.display = 'none';
    } else {
        DOM.engineIconLibrary.style.display = 'block';
        loadIconLibrary('engine');
    }
}
