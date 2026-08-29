/**
 * 书签管理模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { loadData } from './api.js';
import { renderAll, renderBookmarks } from './render.js';
import { toSafeDataImageUrl, toSafeImageUrl, escapeHtml, escapeHtmlAttribute } from './utils.js';
import { refreshIconLibraryCache } from './icon-library.js';
import { getSelectedIconUrl } from './icon-picker.js';
import { toggleCategoryCollapse, createCategoryForBookmark } from './category.js';
import { showToast, showActionToast, showConfirm, showPrompt } from './ux.js';
import sortHelpers from './sort-helpers.cjs';
import { apiRequest, runWithButton } from './api-client.js';

const { moveItemInList } = sortHelpers;

async function loadAiModule() {
    return import('./ai.js');
}

function refreshAiUiVisibility() {
    loadAiModule()
        .then(ai => ai.updateAiUiVisibility())
        .catch(() => {});
}

export function handleBookmarkClick(e) {
    const editBtn = e.target.closest('.bookmark-action-btn.edit');
    const deleteBtn = e.target.closest('.bookmark-action-btn.delete');
    const addBtn = e.target.closest('.header-action-btn.add-btn');
    const sortBtn = e.target.closest('.header-action-btn.sort-btn');
    const collapseBtn = e.target.closest('.collapse-btn');
    const bookmarkCard = e.target.closest('.bookmark-card[data-id]');

    if (collapseBtn) { e.preventDefault(); e.stopPropagation(); toggleCategoryCollapse(collapseBtn.dataset.category); }
    else if (editBtn) { e.preventDefault(); e.stopPropagation(); openBookmarkModal(editBtn.dataset.id); }
    else if (deleteBtn) { e.preventDefault(); e.stopPropagation(); deleteBookmark(deleteBtn.dataset.id); }
    else if (addBtn) { e.preventDefault(); openBookmarkModal(null, addBtn.dataset.category); }
    else if (sortBtn) { e.preventDefault(); toggleBookmarkSorting(sortBtn.dataset.category); }
    else if (bookmarkCard) { recordBookmarkVisit(bookmarkCard.dataset.id); }
}

export function recordBookmarkVisit(bookmarkId) {
    if (!bookmarkId) return;
    const bookmark = state.bookmarks.find(item => item.id === bookmarkId);
    if (bookmark) {
        bookmark.visit_count = (Number(bookmark.visit_count) || 0) + 1;
        bookmark.last_visited_at = new Date().toISOString();
    }
    apiRequest(`/api/bookmarks/${encodeURIComponent(bookmarkId)}/visit`, {
        method: 'POST',
        keepalive: true
    }, { toast: false }).catch(() => {});
}

export function openBookmarkModal(bookmarkId = null, categoryId = null) {
    state.setEditingBookmarkId(bookmarkId);
    const existingBookmark = bookmarkId ? state.bookmarks.find(b => b.id === bookmarkId) : null;

    DOM.bookmarkInputCategory.innerHTML = state.categories.map(c =>
        `<option value="${escapeHtmlAttribute(c.id)}" ${c.id === categoryId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
    ).join('') + '<option value="__new__">+ 新建分类...</option>';

    if (bookmarkId) {
        DOM.bookmarkModalTitle.textContent = '编辑书签';
        const bookmark = existingBookmark;
        if (bookmark) {
            state.setEditingBookmark(bookmark);
            DOM.bookmarkInputName.value = bookmark.name;
            DOM.bookmarkInputUrl.value = bookmark.url;
            DOM.bookmarkInputDesc.value = bookmark.description || '';
            if (DOM.bookmarkInputTags) {
                const tags = Array.isArray(bookmark.tags)
                    ? bookmark.tags.map(t => String(t || '').trim()).filter(Boolean)
                    : String(bookmark.tags || '').split(/[,\n，;；|/]+/g).map(t => t.trim()).filter(Boolean);
                DOM.bookmarkInputTags.value = tags.join(',');
            }
            DOM.bookmarkInputCategory.value = bookmark.category_id;

            const originalIconType = bookmark.icon_type || 'auto';
            state.setCurrentIconType((originalIconType === 'base64') ? 'auto' : originalIconType);
            state.setCurrentIconData(bookmark.icon_data || '');

            if (originalIconType === 'emoji') {
                DOM.bookmarkInputEmoji.value = bookmark.icon_data || '';
            } else {
                DOM.bookmarkInputEmoji.value = '';
            }
            if (originalIconType === 'url') {
                DOM.bookmarkInputIconUrl.value = bookmark.icon_data || '';
            } else {
                DOM.bookmarkInputIconUrl.value = '';
            }

            if (bookmark.icon_data) {
                if (originalIconType === 'base64' || originalIconType === 'url') {
                    const displayUrl = originalIconType === 'url'
                        ? toSafeImageUrl(bookmark.icon_data)
                        : toSafeDataImageUrl(bookmark.icon_data);
                    DOM.iconPreviewAuto.innerHTML = `<img src="${displayUrl}" class="selected">`;
                } else if (originalIconType === 'emoji') {
                    DOM.iconPreviewAuto.innerHTML = `<span>${escapeHtml(bookmark.icon_data)}</span>`;
                }
            } else {
                DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
                delete DOM.iconPreviewAuto.dataset.hasCandidates;
            }
            DOM.iconPreviewUpload.innerHTML = '';
        }
    } else {
        state.setEditingBookmark(null);
        DOM.bookmarkModalTitle.textContent = '添加书签';
        DOM.bookmarkInputName.value = '';
        DOM.bookmarkInputUrl.value = '';
        DOM.bookmarkInputDesc.value = '';
        if (DOM.bookmarkInputTags) DOM.bookmarkInputTags.value = '';
        state.setCurrentIconType('auto');
        state.setCurrentIconData('');
        DOM.bookmarkInputEmoji.value = '';
        DOM.bookmarkInputIconUrl.value = '';
        DOM.iconPreviewAuto.innerHTML = '<span>🌐</span>';
        delete DOM.iconPreviewAuto.dataset.hasCandidates;
        DOM.iconPreviewUpload.innerHTML = '';
    }

    document.querySelectorAll('.icon-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.icon-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`[data-type="${state.currentIconType}"]`)?.classList.add('active');
    DOM.bookmarkModal.querySelector(`[data-panel="${state.currentIconType}"]`)?.classList.add('active');

    hideCategoryRecommendations();
    DOM.bookmarkModal.classList.add('open');
    document.body.style.overflow = 'hidden';
    refreshAiUiVisibility();
    if (DOM.bookmarkInputTags) {
        loadBookmarkAi(bookmarkId);
    }

    DOM.bookmarkInputCategory.onchange = async function () {
        if (this.value === '__new__') {
            const newCatName = await showPrompt({
                title: '新建分类',
                message: '输入新分类名称，创建后会自动选中。',
                inputLabel: '分类名称',
                inputPlaceholder: '例如：开发社区',
                confirmText: '创建'
            });
            if (newCatName && newCatName.trim()) {
                createCategoryForBookmark(newCatName.trim());
            } else {
                this.value = state.categories[0]?.id || '';
            }
        }
    };
}

export async function loadBookmarkAi(bookmarkId) {
    if (!DOM.bookmarkInputTags) return;
    if (!bookmarkId) return;
    try {
        const result = await apiRequest(`/api/ai?action=bookmark&id=${encodeURIComponent(bookmarkId)}`, {}, { toast: false });
        if (result) {
            const tags = Array.isArray(result.tags) ? result.tags : [];
            if (tags.length > 0 || !DOM.bookmarkInputTags.value.trim()) {
                DOM.bookmarkInputTags.value = tags.join(',');
            }
            if (result.summary && !DOM.bookmarkInputDesc.value) {
                DOM.bookmarkInputDesc.value = result.summary;
            }
        }
    } catch (e) {}
}

export async function saveBookmarkAi(bookmarkId) {
    if (!DOM.bookmarkInputTags) return null;
    const tagsText = DOM.bookmarkInputTags.value.trim();
    try {
        await apiRequest('/api/ai?action=bookmark', {
            method: 'POST',
            json: { bookmarkId, tags: tagsText }
        }, { toast: false });
        return tagsText.split(/[,\n，;；|/]+/g).map(tag => tag.trim()).filter(Boolean);
    } catch (e) {}
    return null;
}

export function closeBookmarkModal() {
    DOM.bookmarkModal.classList.remove('open');
    document.body.style.overflow = '';
    state.setEditingBookmarkId(null);
}

export async function saveBookmark() {
    const name = DOM.bookmarkInputName.value.trim();
    const url = DOM.bookmarkInputUrl.value.trim();
    const description = DOM.bookmarkInputDesc.value.trim();
    const category_id = DOM.bookmarkInputCategory.value;

    if (!name) { showToast('请填写名称', 'warning'); return; }
    if (!url) { showToast('请填写网址', 'warning'); return; }

    let icon_type = state.currentIconType;
    let icon_data = '';
    let icon = '🌐';

    if (state.currentIconType === 'library') {
        if (state.currentIconData) {
            icon_type = state.currentIconData.startsWith('data:') ? 'base64' : 'url';
            icon_data = state.currentIconData;
        } else if (state.editingBookmark && state.editingBookmark.icon_data) {
            icon_type = state.editingBookmark.icon_type;
            icon_data = state.editingBookmark.icon_data;
        }
    } else if (state.currentIconType === 'emoji') {
        icon_data = DOM.bookmarkInputEmoji.value.trim() || '🌐';
        icon = icon_data;
    } else if (state.currentIconType === 'url') {
        const iconUrl = DOM.bookmarkInputIconUrl.value.trim();
        if (iconUrl) {
            icon_type = 'url';
            icon_data = iconUrl;
        } else if (state.editingBookmark && state.editingBookmark.icon_data) {
            icon_type = state.editingBookmark.icon_type;
            icon_data = state.editingBookmark.icon_data;
        }
    } else if (state.currentIconType === 'upload') {
        if (state.currentIconData) {
            icon_type = 'base64';
            icon_data = state.currentIconData;
        } else if (state.editingBookmark && state.editingBookmark.icon_data) {
            icon_type = state.editingBookmark.icon_type;
            icon_data = state.editingBookmark.icon_data;
        }
    } else if (state.currentIconType === 'auto') {
        const selectedIconUrl = getSelectedIconUrl(DOM.iconPreviewAuto);
        if (selectedIconUrl) {
            if (selectedIconUrl.startsWith('data:')) {
                icon_type = 'base64';
                icon_data = selectedIconUrl;
            } else {
                icon_type = 'url';
                icon_data = selectedIconUrl;
            }
        } else if (state.editingBookmark && state.editingBookmark.icon_data) {
            icon_type = state.editingBookmark.icon_type;
            icon_data = state.editingBookmark.icon_data;
        }
    }

    try {
        const nameForSave = DOM.bookmarkInputName.value.trim();
        const result = await runWithButton(DOM.saveBookmarkBtn, () => apiRequest('/api/bookmarks', {
            method: 'POST',
            json: {
                id: state.editingBookmarkId,
                category_id, name: nameForSave, url, description, icon, icon_type, icon_data
            }
        }, { errorPrefix: '保存书签失败' }), '保存中...');

        if (result) {
            const savedId = result?.id || state.editingBookmarkId;

            // 清除该书签的图标缓存，确保显示最新图标
            if (savedId) {
                state.iconCache.delete(savedId);
                const tags = await saveBookmarkAi(savedId);
                if (tags) {
                    result.tags = tags;
                    result.ai_summary = '';
                }
            }

            if (!result?.category_id || !state.categories.some(category => category.id === result.category_id)) {
                await loadData();
                renderAll();
            } else {
                state.upsertBookmark(result);
                renderBookmarks();
            }
            refreshIconLibraryCache();
            closeBookmarkModal();
            showToast('书签已保存', 'success');
        }
    } catch {
        // apiRequest 已统一提示
    }
}

export async function deleteBookmark(id) {
    const ok = await showConfirm({
        title: '删除书签？',
        message: '删除后将无法从当前页面撤销。',
        confirmText: '删除',
        danger: true
    });
    if (!ok) return;

    try {
        const removed = await apiRequest(`/api/bookmarks?id=${encodeURIComponent(id)}`, { method: 'DELETE' }, { errorPrefix: '删除书签失败' });
        state.removeBookmark(id);
        renderBookmarks();
        showActionToast('书签已移入回收站', '撤销', async toast => {
            try {
                const restored = await apiRequest(`/api/bookmarks/${encodeURIComponent(removed?.trashId || id)}/restore`, {
                    method: 'POST'
                }, { toast: false });
                if (restored) {
                    state.upsertBookmark(restored);
                    renderBookmarks();
                    toast.remove();
                    showToast('书签已恢复', 'success');
                }
            } catch (error) {
                showToast('撤销失败：' + error.message, 'error');
            }
        }, { type: 'success', timeoutMs: 8000 });
    } catch {
        // apiRequest 已统一提示
    }
}

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

export function handleIconUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        state.setCurrentIconData(reader.result);
        DOM.iconPreviewUpload.innerHTML = `<img src="${toSafeDataImageUrl(reader.result)}">`;
    };
    reader.readAsDataURL(file);
}

export async function handleAiGenerate({ mode }) {
    if (!state.aiStatus || !state.aiStatus.enabled) {
        showToast('AI 功能未启用（建议仅在 Docker 主站开启）', 'warning');
        return;
    }

    const now = Date.now();
    if (state.aiRequestInFlight) {
        if (DOM.aiStatusHint) DOM.aiStatusHint.textContent = 'AI 正在处理中，请稍候...';
        return;
    }
    if (now - state.aiLastActionAt < state.AI_CLICK_COOLDOWN_MS) {
        const left = Math.ceil((state.AI_CLICK_COOLDOWN_MS - (now - state.aiLastActionAt)) / 1000);
        if (DOM.aiStatusHint) DOM.aiStatusHint.textContent = `操作太频繁，请 ${left}s 后再试`;
        return;
    }

    const name = DOM.bookmarkInputName.value.trim();
    const url = DOM.bookmarkInputUrl.value.trim();
    const description = DOM.bookmarkInputDesc.value.trim();
    if (!name && !url) {
        showToast('请先填写名称或网址', 'warning');
        return;
    }

    const ai = await loadAiModule();
    state.setAiRequestInFlight(true);
    state.setAiLastActionAt(now);
    ai.setAiButtonsDisabled(true);
    if (DOM.aiStatusHint) DOM.aiStatusHint.textContent = mode === 'refine' ? '精炼中...' : '生成中...';
    try {
        const clientCfg = ai.getAiClientSettings();
        const payload = { name, url, description };
        if (mode === 'refine') {
            payload.mode = 'refine';
            const tagsHint = DOM.bookmarkInputTags ? DOM.bookmarkInputTags.value.trim() : '';
            if (tagsHint) payload.tagsHint = tagsHint;
        }

        const provider = String(clientCfg.provider || '').trim();
        if (provider && state.aiStatus.allowClientProvider) payload.provider = provider;

        const model = String(clientCfg.model || '').trim();
        if (model) payload.model = model;

        const baseUrl = String(clientCfg.apiBaseUrl || '').trim();
        if (baseUrl && state.aiStatus.allowClientBaseUrl) payload.apiBaseUrl = baseUrl;

        const apiKey = String(clientCfg.apiKey || '').trim();
        if (apiKey && state.aiStatus.allowClientKey) payload.apiKey = apiKey;

        payload.categories = state.categories.map(c => c.name);

        const data = await apiRequest('/api/ai?action=generate', {
            method: 'POST',
            json: payload
        }, { errorPrefix: 'AI 生成失败' });
        const tags = Array.isArray(data.tags) ? data.tags : [];
        const summary = String(data.summary || '').trim();

        if (summary) {
            if (!DOM.bookmarkInputDesc.value) {
                DOM.bookmarkInputDesc.value = summary;
            } else {
                const ok = await showConfirm({
                    title: '覆盖描述？',
                    message: 'AI 已生成摘要，是否覆盖当前“描述”？',
                    confirmText: '覆盖'
                });
                if (ok) DOM.bookmarkInputDesc.value = summary;
            }
        } else if (mode !== 'refine') {
            if (!DOM.bookmarkInputDesc.value && tags.length > 0) {
                DOM.bookmarkInputDesc.value = ai.buildLocalFallbackSummary({ name, url, tags });
            }
        }

        if (DOM.bookmarkInputTags && tags.length > 0) {
            const next = tags.join(',');
            if (!DOM.bookmarkInputTags.value.trim()) {
                DOM.bookmarkInputTags.value = next;
            } else {
                const ok = await showConfirm({
                    title: '覆盖标签？',
                    message: 'AI 已生成标签，是否覆盖当前“标签”？',
                    confirmText: '覆盖'
                });
                if (ok) DOM.bookmarkInputTags.value = next;
            }
        }

        const recommendedCategory = String(data.category || '').trim();
        const suggestedNewCategory = String(data.newCategory || '').trim();
        console.log('[AI] category recommendation:', { recommendedCategory, suggestedNewCategory, allCategories: state.categories.map(c => c.name) });
        showCategoryRecommendations(recommendedCategory, suggestedNewCategory);
    } catch {
        // apiRequest 已统一提示
    } finally {
        state.setAiRequestInFlight(false);
        ai.setAiButtonsDisabled(false);
        ai.updateAiUiVisibility();
    }
}

export function showCategoryRecommendations(recommendedCategory, suggestedNewCategory) {
    if (!DOM.categoryRecommendations || !DOM.categoryRecChips) return;

    DOM.categoryRecChips.innerHTML = '';
    let hasContent = false;

    if (recommendedCategory) {
        const matchedCat = state.categories.find(c => c.name === recommendedCategory);
        if (matchedCat && DOM.bookmarkInputCategory.value !== matchedCat.id) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rec-chip existing';
            btn.dataset.categoryId = matchedCat.id;
            btn.textContent = `${matchedCat.icon || '📁'} ${matchedCat.name}`;
            DOM.categoryRecChips.appendChild(btn);
            hasContent = true;
        }
    }

    if (suggestedNewCategory) {
        const normalizedNew = suggestedNewCategory.trim().toLowerCase();
        const existingCat = state.categories.find(c => c.name.toLowerCase() === normalizedNew);
        if (!existingCat) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rec-chip new-category';
            btn.dataset.newCategory = suggestedNewCategory;
            const icon = document.createElement('span');
            icon.className = 'chip-icon';
            icon.textContent = '+';
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode(suggestedNewCategory));
            DOM.categoryRecChips.appendChild(btn);
            hasContent = true;
        }
    }

    DOM.categoryRecommendations.style.display = hasContent ? 'flex' : 'none';
}

export function hideCategoryRecommendations() {
    if (DOM.categoryRecommendations) {
        DOM.categoryRecommendations.style.display = 'none';
    }
}

export async function handleCategoryRecChipClick(e) {
    const chip = e.target.closest('.rec-chip');
    if (!chip) return;

    if (chip.classList.contains('existing')) {
        const categoryId = chip.dataset.categoryId;
        if (categoryId && DOM.bookmarkInputCategory) {
            DOM.bookmarkInputCategory.value = categoryId;
        }
        hideCategoryRecommendations();
    } else if (chip.classList.contains('new-category')) {
        const newCategoryName = chip.dataset.newCategory;
        if (newCategoryName) {
            const normalizedNew = newCategoryName.trim().toLowerCase();
            const existingCat = state.categories.find(c => c.name.toLowerCase() === normalizedNew);
            if (existingCat) {
                DOM.bookmarkInputCategory.value = existingCat.id;
                hideCategoryRecommendations();
            } else {
                const created = await createCategoryForBookmark(newCategoryName);
                if (created) {
                    hideCategoryRecommendations();
                }
            }
        }
    }
}
