import { DOM } from './dom.js';
import * as state from './state.js';
import { toSafeImageUrl, escapeHtml, escapeHtmlAttribute, bindImageFallbacks } from './utils.js';
import iconPolicy from '../../shared/icon-policy.cjs';

function getIconSource(icon, { local = false } = {}) {
    const source = iconPolicy.getIconSource(icon);
    const label = local && source === 'apple'
        ? '本地 Apple'
        : local && !['google', 'faviconim', 'icon-horse'].includes(source)
            ? '本地直连'
            : iconPolicy.getIconLabel(source);
    const className = {
        google: 'source-google',
        faviconim: 'source-faviconim',
        apple: 'source-apple',
        'icon-horse': 'source-site',
        favicon: 'source-site',
        manifest: 'source-site',
        og: 'source-site',
        'site-fallback': 'source-site',
        unknown: 'source-site'
    }[source] || 'source-site';
    return { label, class: className, source };
}

function getIconSourceFamily(icon) {
    return iconPolicy.getIconSourceFamily(icon);
}

function isSameIconSourceFamily(a, b) {
    return getIconSourceFamily(a) === getIconSourceFamily(b);
}

function getLetterFallbackText(icon) {
    try {
        const hostname = new URL(String(icon || '')).pathname.split('/').filter(Boolean).at(-1) || '';
        const first = hostname.replace(/^www\./i, '').charAt(0);
        return first ? first.toUpperCase() : 'A';
    } catch {
        return 'A';
    }
}

function renderIconPreviewImage(icon, source, { local = false } = {}) {
    if (iconPolicy.getIconSource(icon) === 'icon-horse') {
        return `<span class="icon-option-fallback icon-letter-fallback">${escapeHtml(getLetterFallbackText(icon))}</span>`;
    }
    const displayIcon = local ? String(icon || '') : toSafeImageUrl(icon);
    return `<img src="${escapeHtmlAttribute(displayIcon)}" data-url="${escapeHtmlAttribute(icon)}" class="icon-option" data-remove-on-error="true" data-fallback-icon="${escapeHtmlAttribute(source.label)}">`;
}

function getVisibleIconOptions(icons, limit = 6) {
    // 显示所有图标选项（包括 Google、favicon.im、icon.horse）
    // 让用户自己选择最合适的图标，同时按 source family 去重。
    const deduped = [];
    for (const icon of icons) {
        if (!deduped.some(existing => isSameIconSourceFamily(existing, icon))) {
            deduped.push(icon);
        }
    }
    const visible = deduped.slice(0, limit);
    const letterFallback = icons.find(icon => iconPolicy.getIconSource(icon) === 'icon-horse');
    if (!letterFallback || visible.includes(letterFallback) || icons.length <= limit) return visible;
    return [...visible.slice(0, Math.max(0, limit - 1)), letterFallback];
}

function getVisibleLocalIconOptions(icons, limit = 6) {
    // 显示所有本地直连候选，不隐藏任何服务。
    return icons.slice(0, limit);
}

export function clearIconCandidates(container = DOM.iconPreviewAuto, fallback = '🌐') {
    if (!container) return;
    container.innerHTML = `<span>${escapeHtml(fallback)}</span>`;
    delete container.dataset.hasCandidates;
}

function bindCandidateSelection(container) {
    container.querySelectorAll('.icon-option-wrap').forEach(wrap => {
        const selectWrap = (e) => {
            e.preventDefault();
            e.stopPropagation();
            container.querySelectorAll('.icon-option-wrap').forEach(w => {
                w.classList.remove('selected');
                w.setAttribute('aria-pressed', 'false');
            });
            wrap.classList.add('selected');
            wrap.setAttribute('aria-pressed', 'true');
        };
        wrap.onclick = selectWrap;
        wrap.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') selectWrap(e);
        };
    });
}

export function renderIconCandidates(container, icons, options = {}) {
    const target = container || DOM.iconPreviewAuto;
    const normalizedIcons = Array.isArray(icons) ? icons.filter(Boolean) : [];
    const fallbackIcon = options.fallbackIcon || '🌐';
    const local = Boolean(options.local);
    if (normalizedIcons.length === 0) {
        clearIconCandidates(target, fallbackIcon);
        return [];
    }

    const visibleIcons = local
        ? getVisibleLocalIconOptions(normalizedIcons, options.limit || 6)
        : getVisibleIconOptions(normalizedIcons, options.limit || 6);

    if (!local && visibleIcons.length === 1) {
        const icon = visibleIcons[0];
        const source = getIconSource(icon);
        target.innerHTML = `<div class="icon-single" data-url="${escapeHtmlAttribute(icon)}">
            ${renderIconPreviewImage(icon, source)}
            <span class="icon-source-label ${source.class}">${escapeHtml(source.label)}</span>
        </div>`;
    } else {
        target.innerHTML = `<div class="icon-selection">
            ${visibleIcons.map((icon, idx) => {
        const source = getIconSource(icon, { local });
        return `<div class="icon-option-wrap ${idx === 0 ? 'selected' : ''}" data-url="${escapeHtmlAttribute(icon)}" title="${escapeHtmlAttribute(source.label)}" role="button" tabindex="0" aria-label="选择图标：${escapeHtmlAttribute(source.label)}" aria-pressed="${idx === 0 ? 'true' : 'false'}">
                    ${renderIconPreviewImage(icon, source, { local })}
                    <span class="icon-source-label ${source.class}">${escapeHtml(source.label)}</span>
                </div>`;
    }).join('')}
        </div>`;
        bindCandidateSelection(target);
    }

    target.dataset.hasCandidates = 'true';
    bindImageFallbacks(target);
    return visibleIcons;
}

export function renderIconSelection(availableIcons) {
    return renderIconCandidates(DOM.iconPreviewAuto, availableIcons, { local: false, fallbackIcon: '🌐' });
}

export function renderLocalIconSelection(localIcons) {
    const icons = Array.isArray(localIcons) ? localIcons : [];
    const visibleIcons = renderIconCandidates(DOM.iconPreviewAuto, icons, { local: true, fallbackIcon: '🌐' });
    state.setAvailableIcons(visibleIcons);
    return visibleIcons;
}

export function getSelectedIconUrl(container = DOM.iconPreviewAuto) {
    const selected = container?.querySelector?.('.icon-option-wrap.selected');
    if (selected?.dataset?.url) return selected.dataset.url;
    const singleWrap = container?.querySelector?.('.icon-single[data-url]');
    if (singleWrap?.dataset?.url) return singleWrap.dataset.url;
    const single = container?.querySelector?.('.icon-single img[data-url]');
    return single?.dataset?.url || '';
}
