/**
 * 书签服务
 */
const { newId } = require('./ids');

function isMysql(db) {
    return db.USE_MYSQL || db.getDatabaseType?.() === 'mysql';
}


async function attachBookmarkAi(db, bookmarks) {
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) return;
    const ids = bookmarks.map(b => b.id).filter(Boolean);
    if (ids.length === 0) return;

    const placeholders = ids.map(() => '?').join(',');
    const rows = await db.queryAll(
        `SELECT bookmark_id, tags, summary FROM bookmark_ai WHERE bookmark_id IN (${placeholders})`,
        ids
    );

    const aiMap = new Map(rows.map(row => {
        let tags = [];
        try { tags = JSON.parse(row.tags || '[]'); } catch {}
        return [row.bookmark_id, { tags: Array.isArray(tags) ? tags : [], summary: row.summary || '' }];
    }));

    bookmarks.forEach(b => {
        const ai = aiMap.get(b.id);
        b.tags = ai?.tags || [];
        b.ai_summary = ai?.summary || '';
    });
}

async function getAllBookmarks(db, { includeIcons = false } = {}) {
    const sql = includeIcons
        ? `SELECT b.*, c.name as category_name, c.icon as category_icon
           FROM bookmarks b LEFT JOIN categories c ON b.category_id = c.id
           ORDER BY c.sort_order, b.sort_order, b.created_at`
        : `SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                  CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
                  b.item_type, b.component_type, b.sort_order, b.created_at,
                  c.name as category_name, c.icon as category_icon
           FROM bookmarks b LEFT JOIN categories c ON b.category_id = c.id
           ORDER BY c.sort_order, b.sort_order, b.created_at`;

    const bookmarks = await db.queryAll(sql);

    try {
        await attachBookmarkAi(db, bookmarks);
    } catch {
        bookmarks.forEach(b => {
            b.tags = b.tags || [];
            b.ai_summary = b.ai_summary || '';
        });
    }

    return bookmarks;
}

async function getGroupedBookmarks(db) {
    const categories = await db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at');
    const bookmarks = await db.queryAll('SELECT * FROM bookmarks ORDER BY sort_order, created_at');

    try {
        await attachBookmarkAi(db, bookmarks);
    } catch {}

    return categories.map(cat => ({
        ...cat,
        items: bookmarks.filter(b => b.category_id === cat.id)
    }));
}

async function getBookmarkIcon(db, id) {
    return db.queryOne('SELECT icon_data, icon_type FROM bookmarks WHERE id = ?', [id]);
}

async function getBatchIcons(db, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return {};

    const placeholders = ids.map(() => '?').join(',');
    const bookmarks = await db.queryAll(
        `SELECT id, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders})`,
        ids
    );

    return Object.fromEntries(
        bookmarks.filter(b => b.icon_data).map(b => [b.id, { icon_data: b.icon_data, icon_type: b.icon_type }])
    );
}

async function saveBookmark(db, { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type }) {
    const bookmarkId = id || newId('bm');
    const isNewBookmark = !id;

    let finalCategoryId = category_id;
    const existingCat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (!existingCat) {
        const newCatId = newId('cat');
        const maxCatOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories');
        const catSortOrder = (maxCatOrder?.max_order ?? -1) + 1;
        await db.execute('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', [newCatId, category_id, '📁', catSortOrder]);
        finalCategoryId = newCatId;
    }

    let sortOrder = 0;
    if (isNewBookmark) {
        const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM bookmarks WHERE category_id = ?', [finalCategoryId]);
        sortOrder = (maxOrder?.max_order ?? -1) + 1;
    } else {
        const existing = await db.queryOne('SELECT sort_order FROM bookmarks WHERE id = ?', [bookmarkId]);
        sortOrder = existing?.sort_order ?? 0;
    }

    const params = [bookmarkId, finalCategoryId, (name || '').trim(), url || '', description || '', icon || '🌐', icon_type || 'auto', icon_data || '', item_type || 'bookmark', component_type || null, sortOrder];

    if (isMysql(db)) {
        await db.execute(
            `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url), description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type), icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type), sort_order = VALUES(sort_order)`,
            params
        );
    } else {
        await db.execute(
            `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               category_id = excluded.category_id,
               name = excluded.name,
               url = excluded.url,
               description = excluded.description,
               icon = excluded.icon,
               icon_type = excluded.icon_type,
               icon_data = excluded.icon_data,
               item_type = excluded.item_type,
               component_type = excluded.component_type,
               sort_order = excluded.sort_order`,
            params
        );
    }

    return { id: bookmarkId };
}

async function deleteBookmark(db, id) {
    await db.execute('DELETE FROM bookmarks WHERE id = ?', [id]);
}

async function sortBookmarks(db, order) {
    await db.transaction(async (conn) => {
        for (const item of order) {
            if (item.id && typeof item.sort_order === 'number') {
                await conn.execute('UPDATE bookmarks SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
        }
    });
}

module.exports = {
    attachBookmarkAi,
    getAllBookmarks,
    getGroupedBookmarks,
    getBookmarkIcon,
    getBatchIcons,
    saveBookmark,
    deleteBookmark,
    sortBookmarks
};
