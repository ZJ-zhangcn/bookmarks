/**
 * TODO 待办管理模块（简化版 - 只有标题）
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadTodos } from './api.js';
import { renderTodos } from './render.js';

// 拖拽状态
let draggedTodo = null;
let dragOverTodo = null;

export function handleTodoClick(e) {
    const checkBtn = e.target.closest('.todo-check');
    const editBtn = e.target.closest('.todo-action-btn.edit');
    const deleteBtn = e.target.closest('.todo-action-btn.delete');

    if (checkBtn) {
        e.preventDefault();
        e.stopPropagation();
        // 勾选后直接删除
        deleteTodoSilent(checkBtn.dataset.id);
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
            // 重新绑定快速输入事件和拖拽事件
            bindQuickInputEvent();
            bindTodoDragEvents();
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
            bindTodoDragEvents();
        } else {
            const errMsg = result?.error || `HTTP ${res.status}`;
            alert('保存失败: ' + errMsg);
        }
    } catch (e) {
        alert('保存失败: ' + e.message);
    }
}

/**
 * 勾选完成后静默删除（无确认弹窗）
 */
async function deleteTodoSilent(id) {
    try {
        await fetch(`${state.API_BASE}/api/todos?id=${id}`, { method: 'DELETE' });
        await loadTodos();
        renderTodos();
        bindQuickInputEvent();
        bindTodoDragEvents();
    } catch (e) {
        console.error('删除失败:', e);
    }
}

export async function deleteTodo(id) {
    if (!confirm('确定删除此待办？')) return;

    try {
        await fetch(`${state.API_BASE}/api/todos?id=${id}`, { method: 'DELETE' });
        await loadTodos();
        renderTodos();
        bindQuickInputEvent();
        bindTodoDragEvents();
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

/**
 * 绑定 TODO 拖拽事件
 */
export function bindTodoDragEvents() {
    const todosList = document.querySelector('.todos-list');
    if (!todosList) return;

    const todoCards = todosList.querySelectorAll('.todo-card');
    todoCards.forEach(card => {
        card.removeEventListener('dragstart', handleDragStart);
        card.removeEventListener('dragend', handleDragEnd);
        card.removeEventListener('dragover', handleDragOver);
        card.removeEventListener('dragleave', handleDragLeave);
        card.removeEventListener('drop', handleDrop);

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('dragleave', handleDragLeave);
        card.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedTodo = e.target.closest('.todo-card');
    if (!draggedTodo) return;
    
    draggedTodo.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTodo.dataset.id);
}

function handleDragEnd(e) {
    if (draggedTodo) {
        draggedTodo.classList.remove('dragging');
    }
    document.querySelectorAll('.todo-card.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    draggedTodo = null;
    dragOverTodo = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.target.closest('.todo-card');
    if (!target || target === draggedTodo) return;
    
    if (dragOverTodo !== target) {
        if (dragOverTodo) {
            dragOverTodo.classList.remove('drag-over');
        }
        dragOverTodo = target;
        dragOverTodo.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    const target = e.target.closest('.todo-card');
    if (target && !target.contains(e.relatedTarget)) {
        target.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    
    const target = e.target.closest('.todo-card');
    if (!target || !draggedTodo || target === draggedTodo) return;
    
    target.classList.remove('drag-over');
    
    const todosList = document.querySelector('.todos-list');
    if (!todosList) return;
    
    // 获取所有 todo 的 DOM 顺序
    const allCards = Array.from(todosList.querySelectorAll('.todo-card'));
    const draggedIndex = allCards.indexOf(draggedTodo);
    const targetIndex = allCards.indexOf(target);
    
    // 在 DOM 中移动元素
    if (draggedIndex < targetIndex) {
        target.parentNode.insertBefore(draggedTodo, target.nextSibling);
    } else {
        target.parentNode.insertBefore(draggedTodo, target);
    }
    
    // 获取新顺序并保存到服务器
    const newOrder = Array.from(todosList.querySelectorAll('.todo-card')).map((card, index) => ({
        id: card.dataset.id,
        sort_order: index
    }));
    
    await saveTodoOrder(newOrder);
}

/**
 * 保存 TODO 排序到服务器
 */
async function saveTodoOrder(order) {
    try {
        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });
        
        if (res.ok) {
            // 更新本地 state 中的排序
            await loadTodos();
        }
    } catch (e) {
        console.error('保存排序失败:', e);
        // 失败时重新渲染恢复原状
        renderTodos();
        bindQuickInputEvent();
        bindTodoDragEvents();
    }
}
