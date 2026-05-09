/**
 * 事件绑定模块
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { debounce } from './utils.js';
import { observeBookmarkIcons } from './api.js';
import { renderBookmarks } from './render.js';
import { handleBookmarkClick, openBookmarkModal, closeBookmarkModal, saveBookmark, handleAiGenerate, handleCategoryRecChipClick, hideCategoryRecommendations, handleIconUpload } from './bookmark.js';
import { openCategoryModal, closeCategoryModal, saveCategory } from './category.js';
import { openEngineModal, closeEngineModal, saveEngine, resetEngineForm, handleEngineListClick, toggleEngineIconLibrary } from './engine.js';
import { fetchFavicon, fetchEngineIcon, updateEngineIconPreviewUrl } from './favicon.js';
import { openSettingsModal, closeSettingsModal, closeAllModals, saveWebdavSettings, webdavUpload, webdavDownload, savePersonalization, exportConfig, importConfig, importBrowserBookmarks, setTheme } from './settings.js';
import { openBookmarkSearch, closeBookmarkSearch, handleBookmarkSearch } from './search.js';
import { saveAiClientSettingsFromUi, clearAiClientSettings } from './ai.js';
import { loadIconLibrary, renderIconLibrary, bindIconLibraryManageEvents } from './icon-library.js';
import { initSearchSuggestions } from './suggest.js';
import { handleTodoClick, closeTodoModal, saveTodo, bindQuickInputEvent, bindTodoDragEvents } from './todo.js';

// 防抖搜索函数
const debouncedSearch = debounce((value) => {
    state.setCurrentSearch(value);
    renderBookmarks();
}, 200);

const debouncedBookmarkSearch = debounce(() => {
    handleBookmarkSearch();
}, 150);

export function bindAllEvents() {
    initSearchSuggestions();
    DOM.searchInput.addEventListener('input', e => debouncedSearch(e.target.value));
    DOM.searchClear.addEventListener('click', () => { DOM.searchInput.value = ''; state.setCurrentSearch(''); renderBookmarks(); });

    DOM.categoryNav.addEventListener('click', e => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;
        DOM.categoryNav.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.setCurrentCategory(btn.dataset.category);
        renderBookmarks();
    });

    DOM.engineBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); DOM.engineSelector.classList.toggle('open'); });
    DOM.engineDropdown.addEventListener('click', e => {
        const opt = e.target.closest('.engine-option');
        if (opt) {
            state.setCurrentEngine({ name: opt.querySelector('span:last-child').textContent, icon: opt.dataset.icon, url: opt.dataset.url });
            import('./render.js').then(m => m.updateEngineDisplay());
            DOM.engineSelector.classList.remove('open');
            DOM.webSearchInput.focus();
        }
    });
    document.addEventListener('click', e => { if (!DOM.engineSelector.contains(e.target)) DOM.engineSelector.classList.remove('open'); });
    DOM.webSearchForm.addEventListener('submit', e => {
        e.preventDefault();
        const q = DOM.webSearchInput.value.trim();
        if (q) {
            window.open(state.currentEngine.url + encodeURIComponent(q), '_blank');
            DOM.webSearchInput.value = '';
        }
    });

    DOM.engineManageBtn.addEventListener('click', e => { e.stopPropagation(); DOM.engineSelector.classList.remove('open'); openEngineModal(); });
    DOM.modalClose.addEventListener('click', closeEngineModal);
    DOM.engineModal.addEventListener('click', e => { if (e.target === DOM.engineModal) closeEngineModal(); });
    DOM.saveEngineBtn.addEventListener('click', saveEngine);
    DOM.cancelEditBtn.addEventListener('click', resetEngineForm);
    DOM.engineList.addEventListener('click', handleEngineListClick);
    DOM.autoFetchEngineIcon.addEventListener('click', fetchEngineIcon);
    DOM.engineInputIconUrl.addEventListener('input', updateEngineIconPreviewUrl);

    DOM.bookmarksContainer.addEventListener('click', handleBookmarkClick);

    DOM.bookmarkModalClose.addEventListener('click', closeBookmarkModal);
    DOM.bookmarkModal.addEventListener('click', e => { if (e.target === DOM.bookmarkModal) closeBookmarkModal(); });
    DOM.cancelBookmarkBtn.addEventListener('click', closeBookmarkModal);
    DOM.saveBookmarkBtn.addEventListener('click', saveBookmark);
    if (DOM.aiGenerateBtn) {
        DOM.aiGenerateBtn.addEventListener('click', () => handleAiGenerate({ mode: 'default' }));
    }
    if (DOM.aiRefineBtn) {
        DOM.aiRefineBtn.addEventListener('click', () => handleAiGenerate({ mode: 'refine' }));
    }

    if (DOM.categoryRecChips) {
        DOM.categoryRecChips.addEventListener('click', handleCategoryRecChipClick);
    }
    if (DOM.categoryRecClose) {
        DOM.categoryRecClose.addEventListener('click', hideCategoryRecommendations);
    }

    document.querySelectorAll('.icon-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.icon-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.icon-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = DOM.bookmarkModal.querySelector(`.icon-panel[data-panel="${tab.dataset.type}"]`);
            if (panel) panel.classList.add('active');
            state.setCurrentIconType(tab.dataset.type);
            if (tab.dataset.type === 'library') {
                loadIconLibrary('bookmark');
            }
        });
    });
    DOM.uploadIconBtn.addEventListener('click', () => DOM.bookmarkInputIconFile.click());
    DOM.bookmarkInputIconFile.addEventListener('change', handleIconUpload);

    DOM.selectFromLibraryBtn.addEventListener('click', toggleEngineIconLibrary);

    if (DOM.bookmarkItemType) {
        DOM.bookmarkItemType.addEventListener('change', () => {
            const isComponent = DOM.bookmarkItemType.value === 'component';
            DOM.componentTypeGroup.style.display = isComponent ? 'block' : 'none';
            DOM.bookmarkOnlyFields.forEach(el => el.style.display = isComponent ? 'none' : 'block');
            if (isComponent) {
                const componentLabels = { cpu: 'CPU 使用率', memory: '内存使用', disk: '磁盘使用', servers: '服务器监控' };
                DOM.bookmarkInputName.value = componentLabels[DOM.bookmarkComponentType.value] || '';
            }
        });
        DOM.bookmarkComponentType.addEventListener('change', () => {
            const componentLabels = { cpu: 'CPU 使用率', memory: '内存使用', disk: '磁盘使用', servers: '服务器监控' };
            DOM.bookmarkInputName.value = componentLabels[DOM.bookmarkComponentType.value] || '';
        });
    }

    DOM.bookmarkInputUrl.addEventListener('blur', fetchFavicon);

    DOM.categoryModalClose.addEventListener('click', closeCategoryModal);
    DOM.categoryModal.addEventListener('click', e => { if (e.target === DOM.categoryModal) closeCategoryModal(); });
    DOM.cancelCategoryBtn.addEventListener('click', closeCategoryModal);
    DOM.saveCategoryBtn.addEventListener('click', saveCategory);

    DOM.settingsBtn.addEventListener('click', openSettingsModal);
    DOM.settingsModalClose.addEventListener('click', closeSettingsModal);
    DOM.settingsModal.addEventListener('click', e => { if (e.target === DOM.settingsModal) closeSettingsModal(); });
    DOM.addCategoryBtn.addEventListener('click', () => openCategoryModal());

    DOM.bookmarkSearchBtn.addEventListener('click', openBookmarkSearch);
    DOM.bookmarkSearchClose.addEventListener('click', closeBookmarkSearch);
    DOM.bookmarkSearchOverlay.addEventListener('click', e => { if (e.target === DOM.bookmarkSearchOverlay) closeBookmarkSearch(); });
    DOM.bookmarkSearchInput.addEventListener('input', debouncedBookmarkSearch);

    if (DOM.emptyAddBookmark) {
        DOM.emptyAddBookmark.addEventListener('click', () => openBookmarkModal());
    }
    if (DOM.emptyAddCategory) {
        DOM.emptyAddCategory.addEventListener('click', () => openCategoryModal());
    }

    DOM.exportBtn.addEventListener('click', exportConfig);
    DOM.importBtn.addEventListener('click', () => DOM.importFile.click());
    DOM.importFile.addEventListener('change', importConfig);

    if (DOM.browserImportBtn) {
        DOM.browserImportBtn.addEventListener('click', () => DOM.browserImportFile.click());
    }
    if (DOM.browserImportFile) {
        DOM.browserImportFile.addEventListener('change', importBrowserBookmarks);
    }

    DOM.webdavSaveBtn.addEventListener('click', saveWebdavSettings);
    DOM.webdavUploadBtn.addEventListener('click', webdavUpload);
    DOM.webdavDownloadBtn.addEventListener('click', webdavDownload);

    if (DOM.aiSaveSettingsBtn) DOM.aiSaveSettingsBtn.addEventListener('click', saveAiClientSettingsFromUi);
    if (DOM.aiClearSettingsBtn) DOM.aiClearSettingsBtn.addEventListener('click', clearAiClientSettings);

    DOM.settingsTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            DOM.settingsTabs.forEach(t => t.classList.remove('active'));
            DOM.settingsPanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.querySelector(`[data-panel="${tab.dataset.tab}"]`);
            if (panel) panel.classList.add('active');
            if (tab.dataset.tab === 'icons') {
                renderIconLibrary();
                bindIconLibraryManageEvents();
            }
        });
    });

    if (DOM.themeSelect) {
        DOM.themeSelect.addEventListener('change', e => setTheme(e.target.value));
    }

    if (DOM.wallpaperBlur) {
        DOM.wallpaperBlur.addEventListener('input', e => {
            if (DOM.wallpaperBlurValue) DOM.wallpaperBlurValue.textContent = e.target.value + 'px';
        });
    }
    if (DOM.wallpaperDim) {
        DOM.wallpaperDim.addEventListener('input', e => {
            if (DOM.wallpaperDimValue) DOM.wallpaperDimValue.textContent = e.target.value + '%';
        });
    }
    if (DOM.savePersonalization) {
        DOM.savePersonalization.addEventListener('click', savePersonalization);
    }

    // TODO 事件绑定
    if (DOM.todosContainer) {
        DOM.todosContainer.addEventListener('click', handleTodoClick);
    }
    if (DOM.todoModalClose) {
        DOM.todoModalClose.addEventListener('click', closeTodoModal);
    }
    if (DOM.todoModal) {
        DOM.todoModal.addEventListener('click', e => { if (e.target === DOM.todoModal) closeTodoModal(); });
    }
    if (DOM.cancelTodoBtn) {
        DOM.cancelTodoBtn.addEventListener('click', closeTodoModal);
    }
    if (DOM.saveTodoBtn) {
        DOM.saveTodoBtn.addEventListener('click', saveTodo);
    }
    
    // 快速输入框和拖拽事件在 renderTodos 后绑定
    bindQuickInputEvent();
    bindTodoDragEvents();

    document.addEventListener('keydown', e => {
        const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

        // Ctrl/Cmd + K: Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            DOM.searchInput.focus();
            return;
        }

        // Ctrl/Cmd + N: Add new bookmark
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'n') {
            e.preventDefault();
            openBookmarkModal();
            return;
        }

        // Ctrl/Cmd + Shift + N: Add new category
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            openCategoryModal();
            return;
        }

        // Ctrl/Cmd + ,: Open settings
        if ((e.ctrlKey || e.metaKey) && e.key === ',') {
            e.preventDefault();
            openSettingsModal();
            return;
        }

        // Ctrl/Cmd + F: Open bookmark search
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            openBookmarkSearch();
            return;
        }

        // Escape: Close all modals
        if (e.key === 'Escape') {
            closeAllModals();
            return;
        }

        // / : Quick search (when not in input)
        if (e.key === '/' && !isInputFocused) {
            e.preventDefault();
            DOM.searchInput.focus();
            return;
        }
    });

    let scrollTimeout = null;
    const backToTopBtn = document.getElementById('backToTop');

    window.addEventListener('scroll', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(observeBookmarkIcons, 100);

        if (backToTopBtn) {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }
    }, { passive: true });

    if (backToTopBtn) {
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    window.addEventListener('resize', () => {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(observeBookmarkIcons, 200);
    }, { passive: true });
}
