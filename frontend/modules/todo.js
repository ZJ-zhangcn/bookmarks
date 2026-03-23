/**
 * TODO 待办管理模块（简化版）
 * 仅支持：添加、编辑标题、完成/取消完成、删除、拖拽排序
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
    const completedHeader = e.target.closest('#todosCompletedHeader');
    const clearBtn = e.target.closest('#todosClearCompleted');

    if (checkBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleTodoComplete(checkBtn.dataset.id);
    } else if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        openTodoModal(editBtn.dataset.id);
    } else if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        deleteTodo(deleteBtn.dataset.id);
    } else if (clearBtn) {
        e.preventDefault();
        e.stopPropagation();
        clearCompletedTodos();
    } else if (completedHeader && !clearBtn) {
        e.preventDefault();
        toggleCompletedSection();
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
 * 打开编辑弹窗（简化版 - 仅标题）
 */
export function openTodoModal(todoId = null) {
    state.setEditingTodoId(todoId);

    if (todoId) {
        DOM.todoModalTitle.textContent = '编辑待办';
        const todo = state.todos.find(t => t.id === todoId);
        if (todo) {
            DOM.todoInputTitle.value = todo.title || '';
        }
    } else {
        DOM.todoModalTitle.textContent = '添加待办';
        DOM.todoInputTitle.value = '';
    }

    DOM.todoModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.todoInputTitle.focus();
    if (todoId) DOM.todoInputTitle.select();
}

export function closeTodoModal() {
    DOM.todoModal.classList.remove('open');
    document.body.style.overflow = '';
    state.setEditingTodoId(null);
}

/**
 * 保存待办（简化版 - 仅标题）
 */
export async function saveTodo() {
    const title = DOM.todoInputTitle.value.trim();
    if (!title) {
        alert('请填写待办标题');
        return;
    }

    const data = { title };

    if (state.editingTodoId) {
        data.id = state.editingTodoId;
    }

    try {
        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
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
 * 勾选切换完成状态
 */
async function toggleTodoComplete(id) {
    const todo = state.todos.find(t => t.id === id);
    if (!todo) return;

    const newIsDone = todo.is_done ? 0 : 1;

    try {
        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, is_done: newIsDone })
        });

        if (res.ok) {
            await loadTodos();
            renderTodos();
            bindQuickInputEvent();
            bindTodoDragEvents();
        }
    } catch (e) {
        console.error('更新失败:', e);
    }
}

/**
 * 切换已完成区域展开/折叠
 */
function toggleCompletedSection() {
    state.setTodoShowCompleted(!state.todoShowCompleted);
    const list = document.getElementById('todosCompletedList');
    const icon = document.querySelector('#todosCompletedHeader .toggle-icon');
    if (list) {
        list.classList.toggle('collapsed', !state.todoShowCompleted);
    }
    if (icon) {
        icon.classList.toggle('expanded', state.todoShowCompleted);
    }
}

/**
 * 清除所有已完成待办
 */
async function clearCompletedTodos() {
    const completedCount = state.todos.filter(t => t.is_done).length;
    if (completedCount === 0) return;

    if (!confirm(`确定清除 ${completedCount} 条已完成待办？此操作不可恢复。`)) return;

    try {
        const res = await fetch(`${state.API_BASE}/api/todos/completed/all`, { method: 'DELETE' });
        const result = await res.json().catch(() => null);

        if (res.ok && result && result.success) {
            await loadTodos();
            renderTodos();
            bindQuickInputEvent();
            bindTodoDragEvents();
        } else {
            alert('清除失败: ' + (result?.error || `HTTP ${res.status}`));
        }
    } catch (e) {
        alert('清除失败: ' + e.message);
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
    const todosList = document.querySelector('.todos-list[data-status="pending"]');
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
    
    const todosList = document.querySelector('.todos-list[data-status="pending"]');
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
