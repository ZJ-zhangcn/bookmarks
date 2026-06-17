import { toPreferredIconImageUrl, toSafeDataImageUrl, escapeHtml, escapeHtmlAttribute, bindImageFallbacks } from './utils.js';
import iconPolicy from '../../shared/icon-policy.cjs';

function getIconHorseFallbackText(iconData) {
    try {
        const hostname = new URL(String(iconData || '')).pathname.split('/').filter(Boolean).at(-1) || '';
        const first = hostname.replace(/^www\./i, '').charAt(0);
        return first ? first.toUpperCase() : 'A';
    } catch {
        return 'A';
    }
}

export function iconHorseLetterFallbackHtml(iconData, className = '') {
    const classAttr = className ? ` ${escapeHtmlAttribute(className)}` : '';
    return `<span class="icon-letter-fallback saved-icon-letter-fallback${classAttr}">${escapeHtml(getIconHorseFallbackText(iconData))}</span>`;
}

export function toIconDisplayUrl(iconData, iconType = 'url') {
    const data = String(iconData || '').trim();
    if (!data) return '';
    if (iconType === 'base64' || data.startsWith('data:')) return toSafeDataImageUrl(data);
    if (iconPolicy.getIconSource(data) === 'icon-horse') return '';
    return toPreferredIconImageUrl(data);
}

export function iconImageHtml({
    iconData,
    iconType = 'url',
    fallbackIcon = '🌐',
    alt = '',
    loading = 'lazy',
    className = ''
} = {}) {
    const data = String(iconData || '').trim();
    if (iconType !== 'base64' && !data.startsWith('data:') && iconPolicy.getIconSource(data) === 'icon-horse') {
        return iconHorseLetterFallbackHtml(data, className);
    }

    const displayUrl = toIconDisplayUrl(data, iconType);
    if (!displayUrl) return `<span>${escapeHtml(fallbackIcon || '🌐')}</span>`;

    const loadingAttr = loading ? ` loading="${escapeHtmlAttribute(loading)}"` : '';
    const classAttr = className ? ` class="${escapeHtmlAttribute(className)}"` : '';
    const originalSrcAttr = iconType === 'url' || !data.startsWith('data:')
        ? ` data-original-src="${escapeHtmlAttribute(data)}"`
        : '';
    return `<img src="${escapeHtmlAttribute(displayUrl)}"${originalSrcAttr}${classAttr} alt="${escapeHtmlAttribute(alt)}"${loadingAttr} data-fallback-icon="${escapeHtmlAttribute(fallbackIcon || '🌐')}">`;
}

export function bindIconImageFallbacks(root = document) {
    return bindImageFallbacks(root);
}
