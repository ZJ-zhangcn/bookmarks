import { toPreferredIconImageUrl, toSafeDataImageUrl, escapeHtml, escapeHtmlAttribute, bindImageFallbacks } from './utils.js';

export function toIconDisplayUrl(iconData, iconType = 'url') {
    const data = String(iconData || '').trim();
    if (!data) return '';
    if (iconType === 'base64' || data.startsWith('data:')) return toSafeDataImageUrl(data);
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
    const displayUrl = toIconDisplayUrl(iconData, iconType);
    if (!displayUrl) return `<span>${escapeHtml(fallbackIcon || '🌐')}</span>`;

    const loadingAttr = loading ? ` loading="${escapeHtmlAttribute(loading)}"` : '';
    const classAttr = className ? ` class="${escapeHtmlAttribute(className)}"` : '';
    const originalSrcAttr = iconType === 'url' || !String(iconData || '').startsWith('data:')
        ? ` data-original-src="${escapeHtmlAttribute(iconData)}"`
        : '';
    return `<img src="${escapeHtmlAttribute(displayUrl)}"${originalSrcAttr}${classAttr} alt="${escapeHtmlAttribute(alt)}"${loadingAttr} data-fallback-icon="${escapeHtmlAttribute(fallbackIcon || '🌐')}">`;
}

export function bindIconImageFallbacks(root = document) {
    return bindImageFallbacks(root);
}
