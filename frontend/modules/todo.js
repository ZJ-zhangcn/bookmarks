/**
 * TODO 待办管理模块（完整版）
 * 支持：优先级、截止时间、备注、分类、已完成管理
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadTodos, loadTodoCategories } from './api.js';
import { renderTodos } from './render.js';

// 拖拽状态
let draggedTodo = null;
let dragOverTodo = null;

export function handleTodoClick(e) {
    const checkBtn = e.target.closest('.todo-check');
    const editBtn = e.target.closest('.todo-action-btn.edit');
    const deleteBtn = e.target.closest('.todo-action-btn.delete');
    const notesToggle = e.target.closest('.todo-notes-toggle');
    const completedHeader = e.target.closest('#todosCompletedHeader');
    const clearBtn = e.target.closest('#todosClearCompleted');
    const filterSelect = e.target.closest('#todoFilterCategory');

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
    } else if (notesToggle) {
        e.preventDefault();
        e.stopPropagation();
        toggleTodoNotes(notesToggle.dataset.id);
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
 * 分类筛选变更
 */
export function handleTodoFilterChange(e) {
    const select = e.target;
    if (select && select.id === 'todoFilterCategory') {
        state.setTodoFilterCategory(select.value);
        renderTodos();
        bindQuickInputEvent();
        bindTodoDragEvents();
        bindTodoFilterEvent();
    }
}

/**
 * 绑定分类筛选事件
 */
export function bindTodoFilterEvent() {
    const select = document.getElementById('todoFilterCategory');
    if (select) {
        select.removeEventListener('change', handleTodoFilterChange);
        select.addEventListener('change', handleTodoFilterChange);
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
 * 快速添加待办（只有标题，使用当前筛选分类）
 */
async function quickAddTodo(title) {
    try {
        const categoryId = state.todoFilterCategory === 'all' || state.todoFilterCategory === 'uncategorized' 
            ? null 
            : state.todoFilterCategory;

        const res = await fetch(`${state.API_BASE}/api/todos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, category_id: categoryId })
        });
        const result = await res.json().catch(() => null);

        if (res.ok && result && result.success) {
            await loadTodos();
            renderTodos();
            bindQuickInputEvent();
            bindTodoDragEvents();
            bindTodoFilterEvent();
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
 * 打开编辑弹窗（完整版 - 所有字段）
 */
export function openTodoModal(todoId = null) {
    state.setEditingTodoId(todoId);
    
    // 更新分类 datalist 选项（使用 todoCategories）
    if (DOM.todoCategoryList) {
        DOM.todoCategoryList.innerHTML = state.todoCategories.map(c => 
            `<option value="${c.name}" data-id="${c.id}">${c.icon || '📁'} ${c.name}</option>`
        ).join('');
    }

    if (todoId) {
        DOM.todoModalTitle.textContent = '编辑待办';
        const todo = state.todos.find(t => t.id === todoId);
        if (todo) {
            DOM.todoInputTitle.value = todo.title || '';
            DOM.todoInputNotes.value = todo.notes || '';
            DOM.todoInputPriority.value = todo.priority || '0';
            DOM.todoInputDueAt.value = todo.due_at ? formatDateTimeLocal(todo.due_at) : '';
            // 设置分类输入框
            if (DOM.todoInputCategoryText) {
                DOM.todoInputCategoryText.value = todo.category_name || '';
            }
            if (DOM.todoInputCategory) {
                DOM.todoInputCategory.value = todo.category_id || '';
            }
        }
    } else {
        DOM.todoModalTitle.textContent = '添加待办';
        DOM.todoInputTitle.value = '';
        DOM.todoInputNotes.value = '';
        DOM.todoInputPriority.value = '0';
        DOM.todoInputDueAt.value = '';
        // 默认使用当前筛选分类
        if (DOM.todoInputCategoryText && DOM.todoInputCategory) {
            if (state.todoFilterCategory === 'all' || state.todoFilterCategory === 'uncategorized') {
                DOM.todoInputCategoryText.value = '';
                DOM.todoInputCategory.value = '';
            } else {
                const cat = state.todoCategories.find(c => c.id === state.todoFilterCategory);
                DOM.todoInputCategoryText.value = cat ? cat.name : '';
                DOM.todoInputCategory.value = state.todoFilterCategory;
            }
        }
    }

    DOM.todoModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    DOM.todoInputTitle.focus();
    if (todoId) DOM.todoInputTitle.select();
}

function formatDateTimeLocal(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    // 格式化为 YYYY-MM-DDTHH:mm
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function closeTodoModal() {
    DOM.todoModal.classList.remove('open');
    document.body.style.overflow = '';
    state.setEditingTodoId(null);
}

/**
 * 保存待办
 */
export async function saveTodo() {
    const title = DOM.todoInputTitle.value.trim();
    if (!title) {
        alert('请填写待办标题');
        return;
    }

    // 处理分类：可能是已有分类或新建分类
    let categoryId = null;
    const categoryText = DOM.todoInputCategoryText ? DOM.todoInputCategoryText.value.trim() : '';
    
    if (categoryText) {
        // 查找是否匹配已有分类
        const existingCat = state.todoCategories.find(c => c.name === categoryText);
        if (existingCat) {
            categoryId = existingCat.id;
        } else {
            // 创建新分类
            try {
                const res = await fetch(`${state.API_BASE}/api/categories`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: categoryText, type: 'todo' })
                });
                const result = await res.json().catch(() => null);
                if (res.ok && result && result.success && result.data) {
                    categoryId = result.data.id;
                    // 刷新 todoCategories
                    await loadTodoCategories();
                }
            } catch (e) {
                console.error('创建分类失败:', e);
            }
        }
    }

    const data = {
        title,
        notes: DOM.todoInputNotes.value.trim(),
        priority: parseInt(DOM.todoInputPriority.value, 10) || 0,
        due_at: DOM.todoInputDueAt.value || null,
        category_id: categoryId
    };

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
            await loadTodoCategories();
            await loadTodos();
            renderTodos();
            closeTodoModal();
            bindQuickInputEvent();
            bindTodoDragEvents();
            bindTodoFilterEvent();
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
            bindTodoFilterEvent();
        }
    } catch (e) {
        console.error('更新失败:', e);
    }
}

/**
 * 切换备注展开
 */
function toggleTodoNotes(id) {
    const notesEl = document.getElementById(`todoNotes_${id}`);
    if (notesEl) {
        const isHidden = notesEl.style.display === 'none';
        notesEl.style.display = isHidden ? 'block' : 'none';
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
            bindTodoFilterEvent();
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
        bindTodoFilterEvent();
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
        bindTodoFilterEvent();
    }
}
