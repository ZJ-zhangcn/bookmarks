/**
 * 图标库管理模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { toSafeImageUrl, escapeHtmlAttribute, bindImageFallbacks } from './utils.js';
import { showToast, showConfirm } from './ux.js';

export async function loadIconLibrary(target = 'bookmark') {
    const gridElement = target === 'bookmark' ? DOM.iconLibraryGrid : DOM.engineIconLibraryGrid;

    gridElement.innerHTML = '<div class="icon-library-loading">加载中...</div>';

    try {
        if (!state.iconLibraryCache) {
            const res = await fetch(`${state.API_BASE}/api/icons`);
            const data = await res.json();
            if (data.success) {
                state.setIconLibraryCache(data.data);
            }
        }

        if (!state.iconLibraryCache || state.iconLibraryCache.length === 0) {
            gridElement.innerHTML = '<div class="icon-library-empty">暂无已保存的图标</div>';
            return;
        }

        gridElement.innerHTML = state.iconLibraryCache.map((icon, index) => {
            const displayIcon = toSafeImageUrl(icon.data);
            return `
            <div class="icon-library-item" data-index="${index}" data-icon="${encodeURIComponent(icon.data)}" title="${escapeHtmlAttribute(icon.source || '未知来源')}">
                <img src="${displayIcon}" alt="图标" data-remove-on-error="true">
            </div>
        `;
        }).join('');

        bindImageFallbacks(gridElement);
        gridElement.querySelectorAll('.icon-library-item').forEach(item => {
            item.addEventListener('click', () => {
                gridElement.querySelectorAll('.icon-library-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');

                const iconData = decodeURIComponent(item.dataset.icon);
                state.setSelectedLibraryIcon(iconData);

                if (target === 'bookmark') {
                    state.setCurrentIconType('library');
                    state.setCurrentIconData(iconData);
                } else {
                    DOM.engineIconPreview.innerHTML = `<img src="${toSafeImageUrl(iconData)}">`;
                    DOM.engineInputIconUrl.value = iconData.startsWith('data:') ? '' : iconData;
                    DOM.engineIconPreview.dataset.iconUrl = iconData;
                }
            });
        });

    } catch (e) {
        gridElement.innerHTML = '<div class="icon-library-empty">加载失败</div>';
    }
}

export function refreshIconLibraryCache() {
    state.setIconLibraryCache(null);
}

export async function renderIconLibrary() {
    if (!DOM.settingsIconLibraryGrid) return;

    DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-loading">加载中...</div>';

    try {
        const res = await fetch(`${state.API_BASE}/api/icons`);
        const data = await res.json();
        if (data.success) {
            state.setIconLibraryCache(data.data);
        }

        updateIconLibraryCount();

        if (!state.iconLibraryCache || state.iconLibraryCache.length === 0) {
            DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-empty">暂无图标，请上传或添加书签</div>';
            return;
        }

        state.iconLibraryCache.forEach((icon, index) => {
            if (!icon.id) {
                icon.id = `temp_${index}_${crypto.randomUUID()}`;
                icon.isTemp = true;
            }
        });

        DOM.settingsIconLibraryGrid.innerHTML = state.iconLibraryCache.map((icon, index) => {
            const displayIcon = toSafeImageUrl(icon.data);
            return `
            <div class="icon-library-item ${state.selectedIcons.has(icon.id) ? 'selected' : ''}"
                 data-index="${index}"
                 data-id="${escapeHtmlAttribute(icon.id)}"
                 data-icon="${encodeURIComponent(icon.data)}"
                 data-temp="${icon.isTemp || false}"
                 title="${escapeHtmlAttribute((icon.source || '未知来源') + (icon.uploaded ? ' (已上传)' : ' (来自书签)'))}">
                <input type="checkbox" class="icon-checkbox" data-id="${escapeHtmlAttribute(icon.id)}" ${state.selectedIcons.has(icon.id) ? 'checked' : ''}>
                <img src="${displayIcon}" alt="图标" data-icon-action="copy" data-remove-on-error="true">
                <button type="button" class="icon-delete-btn" data-icon-action="delete" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
        `;
        }).join('');
        bindImageFallbacks(DOM.settingsIconLibraryGrid);
        DOM.settingsIconLibraryGrid.querySelectorAll('.icon-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', event => handleIconCheckboxChange(event, checkbox.dataset.id));
        });
        DOM.settingsIconLibraryGrid.querySelectorAll('[data-icon-action="copy"]').forEach(img => {
            img.addEventListener('click', handleIconItemClick);
        });
        DOM.settingsIconLibraryGrid.querySelectorAll('[data-icon-action="delete"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.icon-library-item');
                handleIconDelete(item?.dataset.id || '', item?.dataset.temp === 'true');
            });
        });
    } catch (err) {
        console.error('加载图标库失败:', err);
        DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-empty">加载图标库失败</div>';
    }
}

function handleIconCheckboxChange(event, iconId) {
    const checkbox = event.target;
    const item = checkbox.closest('.icon-library-item');

    if (iconId) {
        if (checkbox.checked) {
            state.selectedIcons.add(iconId);
            if (item) item.classList.add('selected');
        } else {
            state.selectedIcons.delete(iconId);
            if (item) item.classList.remove('selected');
        }
        updateBatchDeleteButton();
    }
}

async function handleIconDelete(iconId, isTemp) {
    if (!iconId) return;

    if (isTemp) {
        const ok = await showConfirm({
            title: '删除书签来源图标？',
            message: '此图标来自书签，删除后将清除使用此图标的书签图标数据。',
            confirmText: '删除',
            danger: true
        });
        if (!ok) return;
        const item = document.querySelector(`.icon-library-item[data-id="${iconId}"]`);
        if (!item) return;
        const iconData = decodeURIComponent(item.dataset.icon);

        try {
            const res = await fetch(`${state.API_BASE}/api/icons?action=clear-from-bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iconData })
            });
            const data = await res.json();
            if (data.success) {
                state.selectedIcons.delete(iconId);
                await renderIconLibrary();
                updateBatchDeleteButton();
            } else {
                showToast('删除失败: ' + data.error, 'error');
            }
        } catch (e) {
            showToast('删除失败: ' + e.message, 'error');
        }
    } else {
        const ok = await showConfirm({ title: '删除图标？', message: '确定要删除此图标吗？', confirmText: '删除', danger: true });
        if (!ok) return;
        state.selectedIcons.delete(iconId);
        await deleteIconFromLibrary(iconId);
        updateBatchDeleteButton();
    }
}

async function handleIconItemClick(event) {
    const item = event.target.closest('.icon-library-item');
    if (!item) return;

    const iconData = decodeURIComponent(item.dataset.icon);
    try {
        await navigator.clipboard.writeText(iconData);
        item.classList.add('copied');
        setTimeout(() => item.classList.remove('copied'), 1000);
    } catch {
        console.log('复制失败');
    }
}

window.selectAllIcons = function(checked) {
    state.selectedIcons.clear();

    const checkboxes = DOM.settingsIconLibraryGrid?.querySelectorAll('.icon-checkbox');
    if (!checkboxes) return;

    checkboxes.forEach(checkbox => {
        const iconId = checkbox.dataset.id;
        const item = checkbox.closest('.icon-library-item');

        checkbox.checked = checked;

        if (checked && iconId) {
            state.selectedIcons.add(iconId);
            if (item) item.classList.add('selected');
        } else {
            if (item) item.classList.remove('selected');
        }
    });

    updateBatchDeleteButton();
};

export function updateIconLibraryCount() {
    const countEl = document.getElementById('iconLibraryCount');
    if (countEl && state.iconLibraryCache) {
        const uploadedCount = state.iconLibraryCache.filter(i => i.uploaded).length;
        const totalCount = state.iconLibraryCache.length;
        countEl.textContent = `${totalCount} 个图标 (${uploadedCount} 个已上传)`;
    }
}

export function updateBatchDeleteButton() {
    const btn = document.getElementById('iconBatchDeleteBtn');
    if (btn) {
        btn.disabled = state.selectedIcons.size === 0;
        btn.textContent = state.selectedIcons.size > 0 ? `删除选中 (${state.selectedIcons.size})` : '删除选中';
    }
}

export async function deleteIconFromLibrary(iconId) {
    try {
        const res = await fetch(`${state.API_BASE}/api/icons?id=${iconId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            state.selectedIcons.delete(iconId);
            await renderIconLibrary();
        } else {
            showToast('删除失败: ' + data.error, 'error');
        }
    } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
    }
}

export async function batchDeleteIcons() {
    if (state.selectedIcons.size === 0) return;

    const ok = await showConfirm({
        title: '批量删除图标？',
        message: `确定要删除选中的 ${state.selectedIcons.size} 个图标吗？`,
        confirmText: '删除',
        danger: true
    });
    if (!ok) return;

    try {
        const realIds = [];
        const tempIconsData = [];

        for (const iconId of state.selectedIcons) {
            if (iconId.startsWith('temp_')) {
                const item = document.querySelector(`.icon-library-item[data-id="${iconId}"]`);
                if (item) {
                    const iconData = decodeURIComponent(item.dataset.icon);
                    tempIconsData.push(iconData);
                }
            } else {
                realIds.push(iconId);
            }
        }

        let hasError = false;

        if (realIds.length > 0) {
            const res = await fetch(`${state.API_BASE}/api/icons?action=batch-delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: realIds })
            });
            const data = await res.json();
            if (!data.success) {
                hasError = true;
                showToast('删除图标库图标失败: ' + data.error, 'error');
            }
        }

        if (tempIconsData.length > 0) {
            const res = await fetch(`${state.API_BASE}/api/icons?action=batch-clear-from-bookmarks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ iconDataList: tempIconsData })
            });
            const data = await res.json();
            if (!data.success) {
                hasError = true;
                showToast('清除书签图标失败: ' + data.error, 'error');
            }
        }

        if (!hasError) {
            state.selectedIcons.clear();
            await renderIconLibrary();
            updateBatchDeleteButton();
        }
    } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
    }
}

export async function uploadIconToLibrary(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const res = await fetch(`${state.API_BASE}/api/icons`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        data: e.target.result,
                        type: 'base64'
                    })
                });
                const data = await res.json();
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.error));
                }
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

export async function uploadIconFromUrl(url) {
    const res = await fetch(`${state.API_BASE}/api/icons?action=from-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (data.success) {
        return data.data;
    }
    throw new Error(data.error);
}

export function bindIconLibraryManageEvents() {
    const uploadBtn = document.getElementById('iconLibraryUploadBtn');
    const fileInput = document.getElementById('iconLibraryFileInput');

    if (uploadBtn && fileInput) {
        uploadBtn.onclick = () => fileInput.click();
        fileInput.onchange = async (e) => {
            const files = e.target.files;
            if (!files.length) return;

            uploadBtn.disabled = true;
            uploadBtn.textContent = '上传中...';

            try {
                for (const file of files) {
                    await uploadIconToLibrary(file);
                }
                await renderIconLibrary();
            } catch (err) {
                showToast('上传失败: ' + err.message, 'error');
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17,8 12,3 7,8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    上传图片
                `;
                fileInput.value = '';
            }
        };
    }

    const urlInput = document.getElementById('iconLibraryUrlInput');
    const urlBtn = document.getElementById('iconLibraryUrlBtn');

    if (urlInput && urlBtn) {
        urlBtn.onclick = async () => {
            const url = urlInput.value.trim();
            if (!url) {
                showToast('请输入图标 URL', 'warning');
                return;
            }

            urlBtn.disabled = true;
            urlBtn.textContent = '添加中...';

            try {
                await uploadIconFromUrl(url);
                urlInput.value = '';
                await renderIconLibrary();
            } catch (err) {
                showToast('添加失败: ' + err.message, 'error');
            } finally {
                urlBtn.disabled = false;
                urlBtn.textContent = '从 URL 添加';
            }
        };
    }

    const batchDeleteBtn = document.getElementById('iconBatchDeleteBtn');
    if (batchDeleteBtn) {
        batchDeleteBtn.onclick = batchDeleteIcons;
    }
}
