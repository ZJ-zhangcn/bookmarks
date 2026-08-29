/**
 * 数据导入导出服务
 */

const CURRENT_BACKUP_VERSION = '1.2';
const MAX_IMPORT_ITEMS = 100000;
const MAX_ICON_ITEM_BYTES = 2 * 1024 * 1024;
const MAX_ICON_TOTAL_BYTES = 8 * 1024 * 1024;
const ARRAY_FIELDS = ['categories', 'bookmarks', 'bookmark_ai', 'icon_library', 'todos', 'engines'];

function assertArrayField(data, field, required = false) {
    const value = data[field];
    if (value === undefined && !required) return [];
    if (!Array.isArray(value)) throw new Error(`${field} 必须是数组`);
    if (value.length > MAX_IMPORT_ITEMS) throw new Error(`${field} 数据量超过 ${MAX_IMPORT_ITEMS} 条限制`);
    return value;
}

function assertUniqueIds(rows, field, idField) {
    const seen = new Set();
    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            throw new Error(`${field}[${index}] 必须是对象`);
        }
        const id = String(row?.[idField] || '').trim();
        if (!id) throw new Error(`${field}[${index}].${idField} 不能为空`);
        if (id.length > 128) throw new Error(`${field}[${index}].${idField} 长度不能超过 128`);
        if (seen.has(id)) throw new Error(`${field}[${index}].${idField} 与前面的记录重复: ${id}`);
        seen.add(id);
    }
    return seen;
}

function assertHttpUrl(value, path) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 必须是非空字符串`);
    try {
        const parsed = new URL(value.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    } catch {
        throw new Error(`${path} 必须是有效的 HTTP(S) URL`);
    }
}

function byteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
}

function assertIconSize(value, path, totals) {
    if (value === undefined || value === null || value === '') return;
    if (typeof value !== 'string') throw new Error(`${path} 必须是字符串`);
    const size = byteLength(value);
    if (size > MAX_ICON_ITEM_BYTES) {
        throw new Error(`${path} 超过单项 ${MAX_ICON_ITEM_BYTES / 1024 / 1024}MB 限制`);
    }
    totals.iconBytes += size;
    if (totals.iconBytes > MAX_ICON_TOTAL_BYTES) {
        throw new Error(`图标数据总量超过 ${MAX_ICON_TOTAL_BYTES / 1024 / 1024}MB 限制`);
    }
}

function compareVersions(left, right) {
    const leftParts = left.split('.').map(Number);
    const rightParts = right.split('.').map(Number);
    const length = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < length; index += 1) {
        const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (difference !== 0) return difference;
    }
    return 0;
}

function validateBackupPayload(data, options = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('备份内容必须是 JSON 对象');
    const mode = options.mode === 'restore' ? 'restore' : 'merge';
    const version = String(data.version || '1.0');
    if (!/^\d+(\.\d+)?$/.test(version)) throw new Error(`备份版本格式无效: ${version}`);
    if (compareVersions(version, CURRENT_BACKUP_VERSION) > 0) {
        throw new Error(`备份版本 ${version} 高于当前支持版本 ${CURRENT_BACKUP_VERSION}`);
    }

    const collections = {};
    for (const field of ARRAY_FIELDS) {
        const required = mode === 'restore' && ['categories', 'bookmarks', 'engines'].includes(field);
        collections[field] = assertArrayField(data, field, required);
    }
    const trash = assertArrayField(data, 'bookmark_trash');

    const categoryIds = assertUniqueIds(collections.categories, 'categories', 'id');
    const bookmarkIds = assertUniqueIds(collections.bookmarks, 'bookmarks', 'id');
    assertUniqueIds(collections.engines, 'engines', 'id');
    assertUniqueIds(collections.todos, 'todos', 'id');
    assertUniqueIds(collections.icon_library, 'icon_library', 'id');
    assertUniqueIds(collections.bookmark_ai, 'bookmark_ai', 'bookmark_id');
    assertUniqueIds(trash, 'bookmark_trash', 'id');
    for (let index = 0; index < trash.length; index += 1) {
        if (typeof trash[index].snapshot_json !== 'string' || !trash[index].snapshot_json) {
            throw new Error(`bookmark_trash[${index}].snapshot_json 必须是非空字符串`);
        }
    }

    const totals = { iconBytes: 0 };
    for (let index = 0; index < collections.bookmarks.length; index += 1) {
        const bookmark = collections.bookmarks[index];
        const categoryId = String(bookmark?.category_id || '').trim();
        if (!categoryId || !categoryIds.has(categoryId)) {
            throw new Error(`bookmarks[${index}].category_id 引用了不存在的分类 ${categoryId || '(空)'}`);
        }
        if (typeof bookmark.name !== 'string' || !bookmark.name.trim()) {
            throw new Error(`bookmarks[${index}].name 必须是非空字符串`);
        }
        assertHttpUrl(bookmark.url, `bookmarks[${index}].url`);
        assertIconSize(bookmark.icon_data, `bookmarks[${index}].icon_data`, totals);
    }
    for (let index = 0; index < collections.categories.length; index += 1) {
        const category = collections.categories[index];
        if (typeof category.name !== 'string' || !category.name.trim()) {
            throw new Error(`categories[${index}].name 必须是非空字符串`);
        }
    }
    for (let index = 0; index < collections.engines.length; index += 1) {
        const engine = collections.engines[index];
        if (typeof engine.name !== 'string' || !engine.name.trim()) {
            throw new Error(`engines[${index}].name 必须是非空字符串`);
        }
        assertHttpUrl(engine.url, `engines[${index}].url`);
        assertIconSize(engine.icon, `engines[${index}].icon`, totals);
    }
    for (let index = 0; index < collections.icon_library.length; index += 1) {
        const icon = collections.icon_library[index];
        if (typeof icon.data !== 'string' || !icon.data) {
            throw new Error(`icon_library[${index}].data 必须是非空字符串`);
        }
        assertIconSize(icon.data, `icon_library[${index}].data`, totals);
    }
    for (let index = 0; index < collections.todos.length; index += 1) {
        const todo = collections.todos[index];
        if (typeof todo.title !== 'string' || !todo.title.trim()) {
            throw new Error(`todos[${index}].title 必须是非空字符串`);
        }
    }
    for (let index = 0; index < collections.bookmark_ai.length; index += 1) {
        const ai = collections.bookmark_ai[index];
        if (mode === 'restore' && !bookmarkIds.has(String(ai.bookmark_id))) {
            throw new Error(`bookmark_ai[${index}].bookmark_id 引用了不存在的书签 ${ai.bookmark_id}`);
        }
        if (ai.tags !== undefined && !Array.isArray(ai.tags) && typeof ai.tags !== 'string') {
            throw new Error(`bookmark_ai[${index}].tags 必须是数组或 JSON 字符串`);
        }
    }
    if (data.personalization !== undefined && data.personalization !== null
        && (typeof data.personalization !== 'object' || Array.isArray(data.personalization))) {
        throw new Error('personalization 必须是对象或 null');
    }

    return {
        version,
        mode,
        counts: Object.fromEntries(ARRAY_FIELDS.map(field => [field, collections[field].length]))
    };
}

async function clearRestoredData(conn) {
    await conn.execute('DELETE FROM bookmark_ai');
    await conn.execute('DELETE FROM bookmarks');
    await conn.execute('DELETE FROM categories');
    await conn.execute('DELETE FROM search_engines');
    await conn.execute('DELETE FROM todos');
    await conn.execute('DELETE FROM icon_library');
    await conn.execute('DELETE FROM icon_discovery_cache');
    await conn.execute('DELETE FROM bookmark_trash');
    await conn.execute('DELETE FROM config WHERE key = ?', ['personalization']);
}

async function exportData(db, includeIcons) {
    const categories = await db.queryAll('SELECT * FROM categories');
    let bookmarks = await db.queryAll(`
        SELECT id, category_id, name, url, description, icon, icon_type, icon_data,
               sort_order, created_at, visit_count, last_visited_at
        FROM bookmarks
        WHERE COALESCE(item_type, 'bookmark') <> 'component'
    `);
    let engines = await db.queryAll('SELECT * FROM search_engines');
    let iconLibrary = [];
    let bookmarkAi = [];
    try {
        bookmarkAi = await db.queryAll('SELECT bookmark_id, tags, summary, provider, model, updated_at FROM bookmark_ai');
    } catch {
        bookmarkAi = [];
    }
    if (includeIcons) {
        try {
            iconLibrary = await db.queryAll('SELECT id, name, data, type, created_at FROM icon_library');
        } catch {
            iconLibrary = [];
        }
    }

    const todos = await db.queryAll('SELECT id, title, is_done, sort_order, created_at, updated_at, completed_at FROM todos');
    let bookmarkTrash = [];
    try {
        bookmarkTrash = await db.queryAll('SELECT id, snapshot_json, deleted_at, expires_at FROM bookmark_trash');
    } catch {
        bookmarkTrash = [];
    }

    let personalization = null;
    const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
    if (row) {
        personalization = JSON.parse(row.value);
    }

    if (!includeIcons) {
        bookmarks = bookmarks.map(b => ({
            ...b,
            icon_data: b.icon_type === 'emoji' ? b.icon_data : ''
        }));
        engines = engines.map(e => ({
            ...e,
            icon: (e.icon && !e.icon.startsWith('data:') && !e.icon.startsWith('http')) ? e.icon : ''
        }));
        bookmarkTrash = bookmarkTrash.map(item => {
            try {
                const snapshot = JSON.parse(item.snapshot_json);
                if (snapshot?.bookmark) {
                    snapshot.bookmark = {
                        ...snapshot.bookmark,
                        icon_type: snapshot.bookmark.icon_type === 'emoji' ? snapshot.bookmark.icon_type : 'auto',
                        icon_data: snapshot.bookmark.icon_type === 'emoji' ? snapshot.bookmark.icon_data : ''
                    };
                }
                return { ...item, snapshot_json: JSON.stringify(snapshot) };
            } catch {
                return item;
            }
        });
    }

    return {
        version: CURRENT_BACKUP_VERSION,
        exportTime: new Date().toISOString(),
        includeIcons,
        categories,
        bookmarks,
        bookmark_ai: bookmarkAi,
        icon_library: iconLibrary,
        todos,
        bookmark_trash: bookmarkTrash,
        engines,
        personalization
    };
}

async function importData(db, data, options = {}) {
    const validation = validateBackupPayload(data, options);
    const {
        categories,
        bookmarks,
        bookmark_ai: bookmarkAi,
        icon_library: iconLibrary,
        todos,
        bookmark_trash: bookmarkTrash,
        engines,
        personalization
    } = data;

    await db.transaction(async (conn) => {
        if (validation.mode === 'restore') await clearRestoredData(conn);

        if (validation.mode === 'restore') {
            for (const trash of (bookmarkTrash || [])) {
                await conn.execute(
                    'INSERT INTO bookmark_trash (id, snapshot_json, deleted_at, expires_at) VALUES (?, ?, ?, ?)',
                    [trash.id, trash.snapshot_json, trash.deleted_at || null, trash.expires_at || null]
                );
            }
        }

        if (categories) {
            for (let i = 0; i < categories.length; i++) {
                const c = categories[i];
                await conn.execute(
                    `INSERT INTO categories (id, name, icon, sort_order)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                       name = excluded.name,
                       icon = excluded.icon,
                       sort_order = excluded.sort_order`,
                    [c.id, c.name, c.icon, c.sort_order ?? i]
                );
            }
        }

        if (bookmarks) {
            for (let i = 0; i < bookmarks.length; i++) {
                const b = bookmarks[i];
                await conn.execute(
                    `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, sort_order, visit_count, last_visited_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                       category_id = excluded.category_id,
                       name = excluded.name,
                       url = excluded.url,
                       description = excluded.description,
                       icon = excluded.icon,
                       icon_type = excluded.icon_type,
                       icon_data = excluded.icon_data,
                       sort_order = excluded.sort_order,
                       visit_count = excluded.visit_count,
                       last_visited_at = excluded.last_visited_at`,
                    [
                        b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '',
                        b.icon_type || 'auto', b.icon_data || '', b.sort_order ?? i,
                        Number.isFinite(Number(b.visit_count)) ? Number(b.visit_count) : 0,
                        b.last_visited_at || null
                    ]
                );
            }
        }

        if (iconLibrary) {
            for (const icon of iconLibrary) {
                if (!icon?.id || !icon?.data) continue;
                await conn.execute(
                    `INSERT INTO icon_library (id, name, data, type)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                       name = excluded.name,
                       data = excluded.data,
                       type = excluded.type`,
                    [icon.id, icon.name || '', icon.data, icon.type || 'url']
                );
            }
        }

        if (bookmarkAi) {
            for (const ai of bookmarkAi) {
                if (!ai || !ai.bookmark_id) continue;
                const tags = Array.isArray(ai.tags) ? JSON.stringify(ai.tags) : (ai.tags || '[]');
                const summary = ai.summary || '';
                const provider = ai.provider || '';
                const model = ai.model || '';
                await conn.execute(
                    `INSERT INTO bookmark_ai (bookmark_id, tags, summary, provider, model)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(bookmark_id) DO UPDATE SET
                       tags = excluded.tags,
                       summary = excluded.summary,
                       provider = excluded.provider,
                       model = excluded.model,
                       updated_at = CURRENT_TIMESTAMP`,
                    [ai.bookmark_id, tags, summary, provider, model]
                );
            }
        }

        if (todos) {
            for (let i = 0; i < todos.length; i++) {
                const t = todos[i] || {};
                const isDone = (t.is_done === true || t.is_done === 1 || t.is_done === '1') ? 1 : 0;
                const params = [
                    t.id,
                    t.title || '',
                    isDone,
                    Number.isFinite(t.sort_order) ? t.sort_order : (parseInt(t.sort_order, 10) || i),
                    (t.completed_at === '' || t.completed_at == null) ? null : t.completed_at
                ];

                await conn.execute(
                    `INSERT INTO todos (id, title, is_done, sort_order, completed_at)
                     VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                       title = excluded.title,
                       is_done = excluded.is_done,
                       sort_order = excluded.sort_order,
                       completed_at = excluded.completed_at,
                       updated_at = CURRENT_TIMESTAMP`,
                    params
                );
            }
        }

        if (engines) {
            for (let i = 0; i < engines.length; i++) {
                const e = engines[i];
                await conn.execute(
                    `INSERT INTO search_engines (id, name, icon, url, is_default, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                       name = excluded.name,
                       icon = excluded.icon,
                       url = excluded.url,
                       is_default = excluded.is_default,
                       sort_order = excluded.sort_order`,
                    [e.id, e.name, e.icon, e.url, e.is_default ? 1 : 0, e.sort_order ?? i]
                );
            }
        }

        if (personalization) {
            await conn.execute(
                `INSERT INTO config (key, value) VALUES (?, ?)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
                ['personalization', JSON.stringify(personalization)]
            );
        }
    });

    return validation;
}

module.exports = {
    CURRENT_BACKUP_VERSION,
    MAX_ICON_ITEM_BYTES,
    MAX_ICON_TOTAL_BYTES,
    exportData,
    importData,
    validateBackupPayload
};
