/**
 * 书签 AI 辅助模块：AI 生成标签/摘要与分类推荐。
 * 从 bookmark.js 拆出，保持原有导出供 bookmark.js 重新导出。
 */
import { DOM } from './dom.js';
import * as state from './state.js';
import { createCategoryForBookmark } from './category.js';
import { showToast, showConfirm } from './ux.js';
import { apiRequest } from './api-client.js';

async function loadAiModule() {
    return import('./ai.js');
}

export function refreshAiUiVisibility() {
    loadAiModule()
        .then(ai => ai.updateAiUiVisibility())
        .catch(() => {});
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
