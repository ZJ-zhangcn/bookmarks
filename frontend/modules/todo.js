/**
 * TODO 待办管理模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadTodos } from './api.js';
import { renderAll } from './render.js';

export function handleTodoClick(e) {
    const checkBtn = e.target.closest('.todo-check');
    const editBtn = e.target.closest('.todo-action-btn.edit');
    const deleteBtn = e.target.closest('.todo-action-btn.delete');

    if (checkBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleTodoStatus(checkBtn.dataset.id);
    } else if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        openTodoModal(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        deleteTodo(deleteBtn.dataset.id);
    }
}

export function openTodoModal(todoId = null, categoryId = null) {
    state.setEditingTodoId(todoId);

    // 填充分类下拉框
    DOM.todoInputCategory.innerHTML = '<option value="">无分类</option>' +
        state.categories.map(c =>
            `<option value="${c.id}" ${c.id === categoryId ? 'selected' : ''}>${c.name}</option>`
        ).join('');

    if (todoId) {
        DOM.todoModalTitle.textContent = '编辑待办';
        const todo = state.todos.find(t => t.id === todoId);
        if (todo) {
            DOM.todoInputTitle.value = todo.title || '';
            DOM.todoInputNotes.value = todo.notes || '';
            DOM.todoInputCategory.value = todo.category_id || '';
            DOM.todoInputPriority.value = todo.priority || 0;
            DOM.todoInputDueAt.value = todo.due_at ? formatDatetimeLocal(todo.due_at) : '';
        }
    } else {
        DOM.todoModalTitle.textContent = '添加待办';
        DOM.todoInputTitle.value = '';
        DOM.todoInputNotes.value = '';
        DOM.todoInputCategory.value = categoryId || '';
        DOM.todoInputPriority.value = '0';
        DOM.todoInputDueAt.value = '';
    }

    DOM.todoModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.todoInputTitle.focus();
}

export function closeTodoModal() {
    DOM.todoModal.classList.remove('open');
    document.body.style.overflow = '';
    state.setEditingTodoId(null);
}

export async function saveTodo() {
    const title = DOM.todoInputTitle.value.trim();
    if (!title) {
        alert('请填写待办标题');
        return;
    }

    const category_id = DOM.todoInputCategory.value || null;
    const notes = DOM.todoInputNotes.value.trim();
    const priority = parseInt(DOM.todoInputPriority.value, 10) || 0;
    const due_at = DOM.todoInputDueAt.value || null;

    try {
        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: state.editingTodoId,
                category_id,
                title,
                notes,
                priority,
                due_at
            })
        });
        const result = await res.json().catch(() => null);

        if (res.ok && result && result.success) {
            await loadTodos();
            renderAll();
            closeTodoModal();
        } else {
            const errMsg = result?.error || `HTTP ${res.status}`;
            alert('保存失败: ' + errMsg);
        }
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

export async function toggleTodoStatus(id) {
    const todo = state.todos.find(t => t.id === id);
    if (!todo) return;

    const newIsDone = todo.is_done ? 0 : 1;

    try {
        await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: todo.id,
                is_done: newIsDone
            })
        });
        await loadTodos();
        renderAll();
    } catch (e) {
        console.error('切换状态失败:', e);
    }
}

export async function deleteTodo(id) {
    if (!confirm('确定删除此待办？')) return;

    try {
        await fetch(`${state.API_BASE}/api/todos?id=${id}`, { method: 'DELETE' });
        await loadTodos();
        renderAll();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

function formatDatetimeLocal(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    // 格式: YYYY-MM-DDTHH:MM
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
