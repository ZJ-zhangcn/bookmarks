/**
 * 图标库管理模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';

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

        gridElement.innerHTML = state.iconLibraryCache.map((icon, index) => `
            <div class="icon-library-item" data-index="${index}" data-icon="${encodeURIComponent(icon.data)}" title="${icon.source || '未知来源'}">
                <img src="${icon.data}" alt="图标" onerror="this.parentElement.style.display='none'">
            </div>
        `).join('');

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
                    DOM.engineIconPreview.innerHTML = `<img src="${iconData}">`;
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
                icon.id = `temp_${index}_${Date.now()}`;
                icon.isTemp = true;
            }
        });

        DOM.settingsIconLibraryGrid.innerHTML = state.iconLibraryCache.map((icon, index) => `
            <div class="icon-library-item ${state.selectedIcons.has(icon.id) ? 'selected' : ''}"
                 data-index="${index}"
                 data-id="${icon.id}"
                 data-icon="${encodeURIComponent(icon.data)}"
                 data-temp="${icon.isTemp || false}"
                 title="${icon.source || '未知来源'}${icon.uploaded ? ' (已上传)' : ' (来自书签)'}">
                <input type="checkbox" class="icon-checkbox" data-id="${icon.id}" ${state.selectedIcons.has(icon.id) ? 'checked' : ''} onchange="handleIconCheckboxChange(event, '${icon.id}')">
                <img src="${icon.data}" alt="图标" onclick="handleIconItemClick(event)" onerror="this.parentElement.style.display='none'">
                <button type="button" class="icon-delete-btn" title="删除" onclick="handleIconDelete('${icon.id}', ${icon.isTemp || false})"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
        `).join('');
    } catch (err) {
        console.error('加载图标库失败:', err);
        DOM.settingsIconLibraryGrid.innerHTML = '<div class="icon-library-empty">加载图标库失败</div>';
    }
}

window.handleIconCheckboxChange = function(event, iconId) {
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
};

window.handleIconDelete = async function(iconId, isTemp) {
    if (!iconId) return;

    if (isTemp) {
        if (!confirm('此图标来自书签，删除后将清除使用此图标的书签的图标数据。确定要删除吗？')) {
            return;
        }
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
                alert('删除失败: ' + data.error);
            }
        } catch (e) {
            alert('删除失败: ' + e.message);
        }
    } else {
        if (!confirm('确定要删除此图标吗？')) {
            return;
        }
        state.selectedIcons.delete(iconId);
        await deleteIconFromLibrary(iconId);
        updateBatchDeleteButton();
    }
};

window.handleIconItemClick = async function(event) {
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
};

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
            alert('删除失败: ' + data.error);
        }
    } catch (e) {
        alert('删除失败: ' + e.message);
    }
}

export async function batchDeleteIcons() {
    if (state.selectedIcons.size === 0) return;

    if (!confirm(`确定要删除选中的 ${state.selectedIcons.size} 个图标吗？`)) return;

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
                alert('删除图标库图标失败: ' + data.error);
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
                alert('清除书签图标失败: ' + data.error);
            }
        }

        if (!hasError) {
            state.selectedIcons.clear();
            await renderIconLibrary();
            updateBatchDeleteButton();
        }
    } catch (e) {
        alert('删除失败: ' + e.message);
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
    try {
        const res = await fetch(`${state.API_BASE}/api/icons?action=from-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.success) {
            return data.data;
        } else {
            throw new Error(data.error);
        }
    } catch (e) {
        throw e;
    }
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
                alert('上传失败: ' + err.message);
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
                alert('请输入图标 URL');
                return;
            }

            urlBtn.disabled = true;
            urlBtn.textContent = '添加中...';

            try {
                await uploadIconFromUrl(url);
                urlInput.value = '';
                await renderIconLibrary();
            } catch (err) {
                alert('添加失败: ' + err.message);
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
