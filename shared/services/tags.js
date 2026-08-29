const { normalizeTagList } = require('./bookmarks');

function parseTags(value) {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? normalizeTagList(parsed) : [];
    } catch {
        return [];
    }
}

async function listTags(db) {
    const rows = await db.queryAll('SELECT tags FROM bookmark_ai WHERE tags IS NOT NULL AND tags <> \'\'');
    const counts = new Map();
    for (const row of rows) {
        for (const tag of parseTags(row.tags)) {
            const key = tag.toLocaleLowerCase();
            const entry = counts.get(key) || { tag, count: 0 };
            entry.count += 1;
            counts.set(key, entry);
        }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-CN'));
}

async function updateTag(db, { tag, replacement = '' }) {
    const source = String(tag || '').trim();
    const target = String(replacement || '').trim();
    if (!source) throw new Error('标签不能为空');
    if (target.length > 40) throw new Error('标签长度不能超过 40');
    const rows = await db.queryAll('SELECT bookmark_id, tags FROM bookmark_ai WHERE tags IS NOT NULL');
    let changed = 0;
    await db.transaction(async conn => {
        for (const row of rows) {
            const current = parseTags(row.tags);
            const hasSource = current.some(item => item.toLocaleLowerCase() === source.toLocaleLowerCase());
            if (!hasSource) continue;
            const next = target
                ? normalizeTagList(current.map(item => item.toLocaleLowerCase() === source.toLocaleLowerCase() ? target : item))
                : current.filter(item => item.toLocaleLowerCase() !== source.toLocaleLowerCase());
            await conn.execute('UPDATE bookmark_ai SET tags = ?, updated_at = CURRENT_TIMESTAMP WHERE bookmark_id = ?', [JSON.stringify(next), row.bookmark_id]);
            changed += 1;
        }
    });
    return { tag: source, replacement: target, changed };
}

module.exports = { listTags, updateTag };
