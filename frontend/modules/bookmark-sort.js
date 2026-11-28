/**
 * 书签排序模块：排序模式切换、移动与拖拽、保存顺序。
 * 从 bookmark.js 拆出，保持原有导出供 bookmark.js 重新导出。
 */
import * as state from './state.js';
import { loadData } from './api.js';
import { renderAll } from './render.js';
import { showToast } from './ux.js';
import sortHelpers from './sort-helpers.cjs';
import { apiRequest } from './api-client.js';

const { moveItemInList } = sortHelpers;

export function toggleBookmarkSorting(categoryId) {
    const section = document.querySelector(`.category-section[data-category-id="${categoryId}"]`);
    if (!section) return;

    const grid = section.querySelector('.bookmarks-grid');
    const sortBtn = section.querySelector('.sort-btn');
    const moveToolbar = section.querySelector('.mobile-sort-toolbar');

    if (state.sortingCategory === categoryId) {
        state.setSortingCategory(null);
        grid.classList.remove('sorting-mode');
        sortBtn.classList.remove('active');
        const saveBtn = section.querySelector('.save-sort-btn');
        if (saveBtn) saveBtn.remove();
        if (moveToolbar) moveToolbar.remove();
    } else {
        state.setSortingCategory(categoryId);
        grid.classList.add('sorting-mode');
        sortBtn.classList.add('active');

        const header = section.querySelector('.category-header');
        if (!section.querySelector('.save-sort-btn')) {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn btn-primary save-sort-btn';
            saveBtn.textContent = '💾 保存排序';
            saveBtn.onclick = () => saveBookmarkOrder(categoryId);
            header.insertAdjacentElement('afterend', saveBtn);
        }
        if (!section.querySelector('.mobile-sort-toolbar')) {
            const toolbar = document.createElement('div');
            toolbar.className = 'mobile-sort-toolbar';
            toolbar.innerHTML = '<button type="button" class="btn btn-secondary btn-sm mobile-move-btn" data-direction="-1">↑ 上移</button><button type="button" class="btn btn-secondary btn-sm mobile-move-btn" data-direction="1">↓ 下移</button><span>先点选卡片，再上移/下移</span>';
            toolbar.addEventListener('click', e => {
                const btn = e.target.closest('.mobile-move-btn');
                if (!btn) return;
                moveSelectedBookmark(grid, Number(btn.dataset.direction));
            });
            header.insertAdjacentElement('afterend', toolbar);
        }

        enableBookmarkDrag(grid, categoryId);
    }
}

export function moveSelectedBookmark(grid, direction) {
    const cards = Array.from(grid.querySelectorAll('.bookmark-card'));
    const selectedIndex = cards.findIndex(card => card.classList.contains('sort-selected'));
    if (selectedIndex < 0) {
        showToast('先选择一个书签卡片', 'info');
        return;
    }
    const reordered = moveItemInList(cards, selectedIndex, direction);
    if (reordered[selectedIndex] === cards[selectedIndex]) return;
    reordered.forEach(card => grid.appendChild(card));
    reordered.forEach(card => card.classList.remove('sort-selected'));
    const newIndex = Math.max(0, Math.min(reordered.length - 1, selectedIndex + direction));
    reordered[newIndex]?.classList.add('sort-selected');
}

export function enableBookmarkDrag(grid, _categoryId) {
    let draggedItem = null;

    const cards = grid.querySelectorAll('.bookmark-card');
    cards.forEach(card => {
        card.draggable = true;
        card.onclick = (e) => {
            if (!grid.classList.contains('sorting-mode')) return;
            e.preventDefault();
            cards.forEach(item => item.classList.remove('sort-selected'));
            card.classList.add('sort-selected');
        };

        card.ondragstart = (e) => {
            draggedItem = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        };

        card.ondragend = () => {
            card.classList.remove('dragging');
            draggedItem = null;
        };

        card.ondragover = (e) => {
            e.preventDefault();
            if (!draggedItem || draggedItem === card) return;

            const rect = card.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            if (e.clientX < midX) {
                grid.insertBefore(draggedItem, card);
            } else {
                grid.insertBefore(draggedItem, card.nextSibling);
            }
        };
    });
}

export async function saveBookmarkOrder(categoryId) {
    const section = document.querySelector(`.category-section[data-category-id="${categoryId}"]`);
    const grid = section.querySelector('.bookmarks-grid');
    const cards = grid.querySelectorAll('.bookmark-card');

    const order = Array.from(cards).map((card, index) => ({
        id: card.dataset.id,
        sort_order: index
    }));

    try {
        await apiRequest('/api/bookmarks', {
            method: 'PUT',
            json: { order }
        }, { errorPrefix: '保存书签排序失败' });

        toggleBookmarkSorting(categoryId);

        await loadData();
        renderAll();
    } catch {
        // apiRequest 已统一提示
    }
}
