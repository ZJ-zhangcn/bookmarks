import helpers from './insights-helpers.cjs';
import { escapeHtml, escapeHtmlAttribute, toSafeExternalUrl } from './utils.js';

const { getFrequentBookmarks, getRecentBookmarks } = helpers;

function renderInsightCard(item, badge) {
    return `
        <a class="insight-card" href="${toSafeExternalUrl(item.url)}" target="_blank" rel="noopener" data-id="${escapeHtmlAttribute(item.id)}">
            <span class="insight-icon">${escapeHtml(item.icon || '🌐')}</span>
            <span class="insight-text">
                <strong>${escapeHtml(item.name || '未命名')}</strong>
                <small>${escapeHtml(badge)}</small>
            </span>
        </a>
    `;
}

function formatVisitBadge(item, type) {
    if (type === 'frequent') return `${Number(item.visit_count) || 0} 次访问`;
    const date = item.last_visited_at ? new Date(item.last_visited_at) : null;
    if (!date || Number.isNaN(date.getTime())) return '刚刚访问';
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}

export function renderBookmarkInsights({ container, bookmarks }) {
    if (!container) return;
    const frequent = getFrequentBookmarks(bookmarks, 6);
    const recent = getRecentBookmarks(bookmarks, 6);
    if (!frequent.length && !recent.length) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = `
        ${frequent.length ? `
            <section class="insight-section">
                <div class="insight-heading">🔥 常用书签</div>
                <div class="insight-grid">${frequent.map(item => renderInsightCard(item, formatVisitBadge(item, 'frequent'))).join('')}</div>
            </section>` : ''}
        ${recent.length ? `
            <section class="insight-section">
                <div class="insight-heading">🕘 最近访问</div>
                <div class="insight-grid">${recent.map(item => renderInsightCard(item, formatVisitBadge(item, 'recent'))).join('')}</div>
            </section>` : ''}
    `;
}

export { getFrequentBookmarks, getRecentBookmarks };
