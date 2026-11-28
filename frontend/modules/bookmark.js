/**
 * 书签管理模块（CRUD 与交互调度）
 *
 * 拆分出去的功能：
 * - bookmark-sort.js  排序与拖拽
 * - bookmark-ai.js    AI 生成与分类推荐
 * 这里通过 re-export 保持 events.js 等调用方的导入路径不变。
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
import { apiRequest, runWithButton } from './api-client.js';
import { toggleBatchSelection } from './batch.js';
import { hideCategoryRecommendations, refreshAiUiVisibility } from './bookmark-ai.js';
import { toggleBookmarkSorting } from './bookmark-sort.js';

export {
    toggleBookmarkSorting,
    moveSelectedBookmark,
    enableBookmarkDrag,
    saveBookmarkOrder
} from './bookmark-sort.js';
export {
    handleAiGenerate,
    showCategoryRecommendations,
    hideCategoryRecommendations,
    handleCategoryRecChipClick
} from './bookmark-ai.js';

export function handleBookmarkClick(e) {
    const batchSelect = e.target.closest('.batch-select');
    if (batchSelect) {
        e.preventDefault();
        e.stopPropagation();
        toggleBatchSelection(batchSelect.dataset.id, !state.batchSelectedIds.has(batchSelect.dataset.id));
        return;
    }
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

export function openBookmarkModal(bookmarkId = null, categoryId = null, prefill = {}) {
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
        DOM.bookmarkInputName.value = String(prefill.name || '');
        DOM.bookmarkInputUrl.value = String(prefill.url || '');
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
