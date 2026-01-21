/**
 * TODO 待办管理模块（简化版 - 只有标题）
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadTodos } from './api.js';
import { renderTodos } from './render.js';

export function handleTodoClick(e) {
    const checkBtn = e.target.closest('.todo-check');
    const editBtn = e.target.closest('.todo-action-btn.edit');
    const deleteBtn = e.target.closest('.todo-action-btn.delete');
    const toggleHeader = e.target.closest('.todos-section-title');

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
    } else if (toggleHeader) {
        e.preventDefault();
        e.stopPropagation();
        state.setCollapsedTodoDone(!state.collapsedTodoDone);
        renderTodos();
    }
}

/**
 * 快速输入框回车添加待办
 */
export function handleQuickInputKeydown(e) {
    if (e.key === 'Enter') {
        const input = e.target;
        const title = input.value.trim();
        if (title) {
            quickAddTodo(title);
            input.value = '';
        }
    }
}

/**
 * 快速添加待办（只有标题）
 */
async function quickAddTodo(title) {
    try {
        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        const result = await res.json().catch(() => null);

        if (res.ok && result && result.success) {
            await loadTodos();
            renderTodos();
            // 重新绑定快速输入事件
            bindQuickInputEvent();
        }
    } catch (e) {
        console.error('添加失败:', e);
    }
}

/**
 * 绑定快速输入框事件（每次渲染后调用）
 */
export function bindQuickInputEvent() {
    const input = document.getElementById('todoQuickInput');
    if (input) {
        input.removeEventListener('keydown', handleQuickInputKeydown);
        input.addEventListener('keydown', handleQuickInputKeydown);
    }
}

/**
 * 打开编辑弹窗（简化版 - 只编辑标题）
 */
export function openTodoModal(todoId) {
    if (!todoId) return;

    state.setEditingTodoId(todoId);
    DOM.todoModalTitle.textContent = '编辑待办';

    const todo = state.todos.find(t => t.id === todoId);
    if (todo) {
        DOM.todoInputTitle.value = todo.title || '';
    }

    DOM.todoModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.todoInputTitle.focus();
    DOM.todoInputTitle.select();
}

export function closeTodoModal() {
    DOM.todoModal.classList.remove('open');
    document.body.style.overflow = '';
    state.setEditingTodoId(null);
}

/**
 * 保存待办（编辑模式）
 */
export async function saveTodo() {
    const title = DOM.todoInputTitle.value.trim();
    if (!title) {
        alert('请填写待办标题');
        return;
    }

    try {
        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: state.editingTodoId,
                title
            })
        });
        const result = await res.json().catch(() => null);

        if (res.ok && result && result.success) {
            await loadTodos();
            renderTodos();
            closeTodoModal();
            bindQuickInputEvent();
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
        renderTodos();
        bindQuickInputEvent();
    } catch (e) {
        console.error('切换状态失败:', e);
    }
}

export async function deleteTodo(id) {
    if (!confirm('确定删除此待办？')) return;

    try {
        await fetch(`${state.API_BASE}/api/todos?id=${id}`, { method: 'DELETE' });
        await loadTodos();
        renderTodos();
        bindQuickInputEvent();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}
