function normalizeUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        parsed.protocol = parsed.protocol.toLowerCase();
        parsed.hostname = parsed.hostname.toLowerCase();
        if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
            parsed.port = '';
        }
        parsed.hash = '';
        return parsed.toString().replace(/\/$/, '');
    } catch {
        return '';
    }
}

async function runLocalHealthChecks(db, { staleDays = 180 } = {}) {
    const now = Date.now();
    const staleBefore = new Date(now - Math.max(1, Number(staleDays) || 180) * 24 * 60 * 60 * 1000).toISOString();
    const bookmarks = await db.queryAll(`
        SELECT b.id, b.name, b.url, b.icon_type, b.icon_data, b.visit_count, b.last_visited_at,
               b.category_id, c.name AS category_name, ba.tags
        FROM bookmarks b
        LEFT JOIN categories c ON c.id = b.category_id
        LEFT JOIN bookmark_ai ba ON ba.bookmark_id = b.id
        WHERE COALESCE(b.item_type, 'bookmark') <> 'component'
        ORDER BY b.created_at, b.id
    `);
    const duplicateMap = new Map();
    const result = {
        checkedAt: new Date(now).toISOString(),
        staleDays: Math.max(1, Number(staleDays) || 180),
        counts: { bookmarks: bookmarks.length, categories: 0, tagged: 0, missingIcons: 0 },
        duplicateUrls: [],
        invalidUrls: [],
        missingCategories: [],
        missingIcons: [],
        untagged: [],
        stale: []
    };

    for (const bookmark of bookmarks) {
        const label = { id: bookmark.id, name: bookmark.name, url: bookmark.url || '' };
        const normalized = normalizeUrl(bookmark.url);
        if (!normalized) result.invalidUrls.push(label);
        else {
            const group = duplicateMap.get(normalized) || [];
            group.push(label);
            duplicateMap.set(normalized, group);
        }
        if (!bookmark.category_id || !bookmark.category_name) result.missingCategories.push(label);
        const hasIcon = Boolean(bookmark.icon_data) || bookmark.icon_type === 'emoji';
        if (!hasIcon) result.missingIcons.push(label);
        let tags = [];
        try {
            const parsedTags = JSON.parse(bookmark.tags || '[]');
            tags = Array.isArray(parsedTags) ? parsedTags : [];
        } catch {}
        if (tags.length > 0) result.counts.tagged += 1;
        else result.untagged.push(label);
        if (!bookmark.last_visited_at || bookmark.last_visited_at < staleBefore) result.stale.push(label);
    }
    result.duplicateUrls = [...duplicateMap.entries()]
        .filter(([, items]) => items.length > 1)
        .map(([url, items]) => ({ url, items }));
    result.counts.categories = Number((await db.queryOne("SELECT COUNT(*) AS count FROM categories WHERE COALESCE(type, 'bookmark') = 'bookmark'")).count) || 0;
    result.counts.missingIcons = result.missingIcons.length;
    const connection = db.getSqliteDb?.();
    if (connection) result.integrity = connection.pragma('integrity_check', { simple: true });
    return result;
}

module.exports = { normalizeUrl, runLocalHealthChecks };
