/**
 * 书签服务
 */
const { newId } = require('./ids');


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
        ? `SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                  b.icon_data, b.sort_order, b.created_at, b.visit_count, b.last_visited_at,
                  c.name as category_name, c.icon as category_icon
           FROM bookmarks b LEFT JOIN categories c ON b.category_id = c.id
           WHERE COALESCE(b.item_type, 'bookmark') <> 'component'
           ORDER BY c.sort_order, b.sort_order, b.created_at`
        : `SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                  CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
                  b.sort_order, b.created_at, b.visit_count, b.last_visited_at,
                  c.name as category_name, c.icon as category_icon
           FROM bookmarks b LEFT JOIN categories c ON b.category_id = c.id
           WHERE COALESCE(b.item_type, 'bookmark') <> 'component'
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

async function getBookmarkById(db, id) {
    const bookmark = await db.queryOne(
        `SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                b.icon_data, b.sort_order, b.created_at, b.visit_count, b.last_visited_at,
                c.name as category_name, c.icon as category_icon,
                ba.tags, ba.summary as ai_summary
         FROM bookmarks b
         LEFT JOIN categories c ON b.category_id = c.id
         LEFT JOIN bookmark_ai ba ON b.id = ba.bookmark_id
         WHERE b.id = ? AND COALESCE(b.item_type, 'bookmark') <> 'component'`,
        [id]
    );
    if (!bookmark) return null;
    try { bookmark.tags = JSON.parse(bookmark.tags || '[]'); } catch { bookmark.tags = []; }
    if (!Array.isArray(bookmark.tags)) bookmark.tags = [];
    bookmark.ai_summary = bookmark.ai_summary || '';
    bookmark.visit_count = Number(bookmark.visit_count) || 0;
    bookmark.last_visited_at = bookmark.last_visited_at || null;
    return bookmark;
}

async function getGroupedBookmarks(db) {
    const categories = await db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at');
    const bookmarks = await db.queryAll(`
        SELECT id, category_id, name, url, description, icon, icon_type, icon_data,
               sort_order, created_at, visit_count, last_visited_at
        FROM bookmarks
        WHERE COALESCE(item_type, 'bookmark') <> 'component'
        ORDER BY sort_order, created_at
    `);

    try {
        await attachBookmarkAi(db, bookmarks);
    } catch {}

    return categories.map(cat => ({
        ...cat,
        items: bookmarks.filter(b => b.category_id === cat.id)
    }));
}

async function getBookmarkIcon(db, id) {
    return db.queryOne("SELECT icon_data, icon_type FROM bookmarks WHERE id = ? AND COALESCE(item_type, 'bookmark') <> 'component'", [id]);
}

async function getBatchIcons(db, ids) {
    if (!Array.isArray(ids) || ids.length === 0) return {};

    const placeholders = ids.map(() => '?').join(',');
    const bookmarks = await db.queryAll(
        `SELECT id, url, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders}) AND COALESCE(item_type, 'bookmark') <> 'component'`,
        ids
    );

    return Object.fromEntries(
        bookmarks
            .filter(b => b.icon_data || (b.icon_type === 'auto' && b.url))
            .map(b => {
                // 如果有 icon_data，直接返回
                if (b.icon_data) {
                    return [b.id, { icon_data: b.icon_data, icon_type: b.icon_type }];
                }
                // 如果是 auto 类型且有 URL，生成 favicon URL
                if (b.icon_type === 'auto' && b.url) {
                    try {
                        const parsedUrl = new URL(b.url);
                        const faviconUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}/favicon.ico`;
                        return [b.id, { icon_data: faviconUrl, icon_type: 'url' }];
                    } catch (e) {
                        return null;
                    }
                }
                return null;
            })
            .filter(Boolean)
    );
}

async function saveBookmark(db, { id, category_id, name, url, description, icon, icon_type, icon_data }) {
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

    const params = [bookmarkId, finalCategoryId, (name || '').trim(), url || '', description || '', icon || '🌐', icon_type || 'auto', icon_data || '', sortOrder];

    await db.execute(
        `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           category_id = excluded.category_id,
           name = excluded.name,
           url = excluded.url,
           description = excluded.description,
           icon = excluded.icon,
           icon_type = excluded.icon_type,
           icon_data = excluded.icon_data,
           sort_order = excluded.sort_order`,
        params
    );

    return getBookmarkById(db, bookmarkId);
}

async function deleteBookmark(db, id) {
    const bookmark = await getBookmarkById(db, id);
    if (!bookmark) return null;
    const category = bookmark.category_id
        ? await db.queryOne('SELECT id, name, icon, type, sort_order FROM categories WHERE id = ?', [bookmark.category_id])
        : null;
    const aiRow = await db.queryOne(
        'SELECT bookmark_id, tags, summary, provider, model, updated_at FROM bookmark_ai WHERE bookmark_id = ?',
        [bookmark.id]
    );
    let aiTags = bookmark.tags;
    if (aiRow?.tags) {
        try { aiTags = JSON.parse(aiRow.tags); } catch { aiTags = []; }
    }
    const trashId = newId('trash');
    const retentionDays = Number.isFinite(Number.parseInt(process.env.TRASH_RETENTION_DAYS, 10))
        ? Math.min(365, Math.max(1, Number.parseInt(process.env.TRASH_RETENTION_DAYS, 10)))
        : 30;
    const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const snapshot = {
        version: 1,
        bookmark: {
            id: bookmark.id,
            category_id: bookmark.category_id,
            name: bookmark.name,
            url: bookmark.url || '',
            description: bookmark.description || '',
            icon: bookmark.icon || '🌐',
            icon_type: bookmark.icon_type || 'auto',
            icon_data: bookmark.icon_data || '',
            sort_order: bookmark.sort_order ?? 0,
            visit_count: bookmark.visit_count ?? 0,
            last_visited_at: bookmark.last_visited_at || null,
            created_at: bookmark.created_at || null
        },
        category: category || null,
        bookmark_ai: {
            bookmark_id: bookmark.id,
            tags: Array.isArray(aiTags) ? aiTags : [],
            summary: aiRow?.summary || bookmark.ai_summary || '',
            provider: aiRow?.provider || '',
            model: aiRow?.model || '',
            updated_at: aiRow?.updated_at || null
        }
    };

    await db.transaction(async (conn) => {
        await conn.execute(
            'INSERT INTO bookmark_trash (id, snapshot_json, deleted_at, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP, ?)',
            [trashId, JSON.stringify(snapshot), expiresAt]
        );
        await conn.execute('DELETE FROM bookmark_ai WHERE bookmark_id = ?', [id]);
        await conn.execute('DELETE FROM bookmarks WHERE id = ?', [id]);
    });
    return { trashId, bookmarkId: bookmark.id, name: bookmark.name, expiresAt };
}

function parseTrashSnapshot(row) {
    if (!row?.snapshot_json) throw new Error('回收站记录内容无效');
    let snapshot;
    try { snapshot = JSON.parse(row.snapshot_json); } catch { throw new Error('回收站记录内容损坏'); }
    if (!snapshot?.bookmark?.id || !snapshot.bookmark.category_id || !snapshot.bookmark.name) {
        throw new Error('回收站记录缺少必要书签字段');
    }
    return snapshot;
}

async function listTrash(db, { includeExpired = false } = {}) {
    const rows = await db.queryAll(
        `SELECT id, snapshot_json, deleted_at, expires_at
         FROM bookmark_trash
         ${includeExpired ? '' : 'WHERE expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP'}
         ORDER BY deleted_at DESC`
    );
    return rows.map(row => {
        try {
            const snapshot = parseTrashSnapshot(row);
            return {
                id: row.id,
                bookmarkId: snapshot.bookmark.id,
                name: snapshot.bookmark.name,
                url: snapshot.bookmark.url || '',
                description: snapshot.bookmark.description || '',
                icon: snapshot.bookmark.icon || '🌐',
                categoryId: snapshot.bookmark.category_id,
                categoryName: snapshot.category?.name || '',
                deletedAt: row.deleted_at,
                expiresAt: row.expires_at
            };
        } catch {
            return null;
        }
    }).filter(Boolean);
}

async function restoreBookmark(db, id) {
    const rows = await db.queryAll('SELECT id, snapshot_json FROM bookmark_trash ORDER BY deleted_at DESC');
    const row = rows.find(item => item.id === id || (() => {
        try { return JSON.parse(item.snapshot_json)?.bookmark?.id === id; } catch { return false; }
    })());
    if (!row) return null;
    const snapshot = parseTrashSnapshot(row);
    const bookmark = snapshot.bookmark;
    const existing = await db.queryOne('SELECT id FROM bookmarks WHERE id = ?', [bookmark.id]);
    if (existing) throw new Error('同 ID 书签已存在，无法恢复');
    let category = await db.queryOne('SELECT id FROM categories WHERE id = ?', [bookmark.category_id]);
    let categoryId = bookmark.category_id;

    await db.transaction(async conn => {
        if (!category) {
            const categorySnapshot = snapshot.category || {};
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) AS max_order FROM categories');
            categoryId = newId('cat');
            await conn.execute(
                'INSERT INTO categories (id, name, icon, type, sort_order) VALUES (?, ?, ?, ?, ?)',
                [categoryId, `${categorySnapshot.name || '已恢复'}（恢复）`, categorySnapshot.icon || '📁', categorySnapshot.type || 'bookmark', (maxOrder?.max_order ?? -1) + 1]
            );
        }
        await conn.execute(
            `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, sort_order, visit_count, last_visited_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
            [bookmark.id, categoryId, bookmark.name, bookmark.url || '', bookmark.description || '', bookmark.icon || '🌐', bookmark.icon_type || 'auto', bookmark.icon_data || '', bookmark.sort_order ?? 0, Number(bookmark.visit_count) || 0, bookmark.last_visited_at || null, bookmark.created_at || null]
        );
        const ai = snapshot.bookmark_ai;
        if (ai) {
            const tags = Array.isArray(ai.tags) ? JSON.stringify(ai.tags) : (ai.tags || '[]');
            await conn.execute(
                'INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model, updated_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))',
                [bookmark.id, tags, ai.summary || '', ai.provider || '', ai.model || '', ai.updated_at || null]
            );
        }
        await conn.execute('DELETE FROM bookmark_trash WHERE id = ?', [row.id]);
    });
    return getBookmarkById(db, bookmark.id);
}

async function deleteTrash(db, id) {
    const result = await db.execute('DELETE FROM bookmark_trash WHERE id = ?', [id]);
    return Boolean(result?.changes);
}

async function purgeTrash(db, { expiredOnly = false } = {}) {
    const sql = expiredOnly
        ? 'DELETE FROM bookmark_trash WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP'
        : 'DELETE FROM bookmark_trash';
    const result = await db.execute(sql);
    return Number(result?.changes) || 0;
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

function normalizeTagList(value) {
    const values = Array.isArray(value)
        ? value
        : String(value || '').split(/[,\n，;；|/]+/g);
    const tags = [];
    const seen = new Set();
    for (const raw of values) {
        const tag = String(raw || '').trim();
        if (!tag || tag.length > 40) continue;
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        tags.push(tag);
    }
    return tags.slice(0, 50);
}

function parseStoredTags(value) {
    try {
        return normalizeTagList(JSON.parse(value || '[]'));
    } catch {
        return [];
    }
}

async function batchUpdateBookmarks(db, { ids, action, payload = {} }) {
    const normalizedIds = (ids || []).map(id => String(id || '').trim()).filter(Boolean);
    const uniqueIds = [...new Set(normalizedIds)];
    const duplicateCount = normalizedIds.length - uniqueIds.length;
    const rows = uniqueIds.length > 0
        ? await db.queryAll(
            `SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                    b.icon_data, b.sort_order, b.visit_count, b.last_visited_at, b.created_at,
                    c.id AS category_id_ref, c.name AS category_name, c.icon AS category_icon,
                    c.type AS category_type, c.sort_order AS category_sort_order,
                    ba.tags AS ai_tags, ba.summary AS ai_summary, ba.provider AS ai_provider,
                    ba.model AS ai_model, ba.updated_at AS ai_updated_at
             FROM bookmarks b
             LEFT JOIN categories c ON c.id = b.category_id
             LEFT JOIN bookmark_ai ba ON ba.bookmark_id = b.id
             WHERE b.id IN (${uniqueIds.map(() => '?').join(',')})
               AND COALESCE(b.item_type, 'bookmark') <> 'component'`,
            uniqueIds
        )
        : [];
    const found = new Set(rows.map(row => row.id));
    const skippedIds = uniqueIds.filter(id => !found.has(id));
    const errors = [];

    if (action === 'move') {
        const categoryId = String(payload.category_id || '').trim();
        const category = categoryId ? await db.queryOne(
            'SELECT id FROM categories WHERE id = ? AND COALESCE(type, \'bookmark\') = \'bookmark\'',
            [categoryId]
        ) : null;
        if (!category) throw new Error('目标分类不存在');
        await db.transaction(async conn => {
            for (const row of rows) {
                const maxOrder = await db.queryOne('SELECT MAX(sort_order) AS max_order FROM bookmarks WHERE category_id = ?', [categoryId]);
                const nextOrder = (maxOrder?.max_order ?? -1) + 1;
                await conn.execute('UPDATE bookmarks SET category_id = ?, sort_order = ? WHERE id = ?', [categoryId, nextOrder, row.id]);
            }
        });
        return { action, processed: rows.length, skipped: skippedIds.length + duplicateCount, skippedIds, errors };
    }

    if (action === 'add-tags' || action === 'remove-tags') {
        const requested = normalizeTagList(payload.tags);
        if (requested.length === 0) throw new Error('至少提供一个标签');
        await db.transaction(async conn => {
            for (const row of rows) {
                const current = parseStoredTags(row.ai_tags);
                const next = action === 'add-tags'
                    ? normalizeTagList([...current, ...requested])
                    : current.filter(tag => !requested.some(remove => remove.toLocaleLowerCase() === tag.toLocaleLowerCase()));
                await conn.execute(
                    `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model, updated_at)
                     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(bookmark_id) DO UPDATE SET tags = excluded.tags, updated_at = CURRENT_TIMESTAMP`,
                    [row.id, JSON.stringify(next), row.ai_summary || '', row.ai_provider || '', row.ai_model || '']
                );
            }
        });
        return { action, processed: rows.length, skipped: skippedIds.length + duplicateCount, skippedIds, errors, tags: requested };
    }

    if (action === 'refresh-icons') {
        await db.transaction(async conn => {
            for (const row of rows) {
                await conn.execute("UPDATE bookmarks SET icon_type = 'auto', icon_data = '' WHERE id = ?", [row.id]);
            }
        });
        return { action, processed: rows.length, skipped: skippedIds.length + duplicateCount, skippedIds, errors };
    }

    if (action === 'trash') {
        const retentionDays = Number.isFinite(Number.parseInt(process.env.TRASH_RETENTION_DAYS, 10))
            ? Math.min(365, Math.max(1, Number.parseInt(process.env.TRASH_RETENTION_DAYS, 10)))
            : 30;
        const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString();
        const items = rows.map(row => ({
            id: newId('trash'),
            snapshot: {
                version: 1,
                bookmark: {
                    id: row.id, category_id: row.category_id, name: row.name, url: row.url || '',
                    description: row.description || '', icon: row.icon || '🌐', icon_type: row.icon_type || 'auto',
                    icon_data: row.icon_data || '', sort_order: row.sort_order ?? 0,
                    visit_count: row.visit_count ?? 0, last_visited_at: row.last_visited_at || null,
                    created_at: row.created_at || null
                },
                category: row.category_id_ref ? {
                    id: row.category_id_ref, name: row.category_name, icon: row.category_icon,
                    type: row.category_type, sort_order: row.category_sort_order
                } : null,
                bookmark_ai: {
                    bookmark_id: row.id, tags: parseStoredTags(row.ai_tags), summary: row.ai_summary || '',
                    provider: row.ai_provider || '', model: row.ai_model || '', updated_at: row.ai_updated_at || null
                }
            }
        }));
        await db.transaction(async conn => {
            for (const item of items) {
                await conn.execute(
                    'INSERT INTO bookmark_trash (id, snapshot_json, deleted_at, expires_at) VALUES (?, ?, CURRENT_TIMESTAMP, ?)',
                    [item.id, JSON.stringify(item.snapshot), expiresAt]
                );
                await conn.execute('DELETE FROM bookmark_ai WHERE bookmark_id = ?', [item.snapshot.bookmark.id]);
                await conn.execute('DELETE FROM bookmarks WHERE id = ?', [item.snapshot.bookmark.id]);
            }
        });
        return { action, processed: items.length, skipped: skippedIds.length + duplicateCount, skippedIds, errors, expiresAt };
    }

    throw new Error('不支持的批量操作');
}

async function recordBookmarkVisit(db, id) {
    if (!id) return { changes: 0 };
    const result = await db.execute(
        `UPDATE bookmarks
         SET visit_count = COALESCE(visit_count, 0) + 1,
             last_visited_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [id]
    );
    if (!result?.changes) return { changes: 0, bookmark: null };
    const bookmark = await db.queryOne(
        'SELECT id, visit_count, last_visited_at FROM bookmarks WHERE id = ?',
        [id]
    );
    return { changes: result.changes, bookmark };
}

module.exports = {
    attachBookmarkAi,
    getAllBookmarks,
    getBookmarkById,
    getGroupedBookmarks,
    getBookmarkIcon,
    getBatchIcons,
    saveBookmark,
    deleteBookmark,
    listTrash,
    restoreBookmark,
    deleteTrash,
    purgeTrash,
    sortBookmarks,
    batchUpdateBookmarks,
    recordBookmarkVisit
};
