/**
 * 分类服务
 */
const { newId } = require('./ids');


async function getAllCategories(db, type) {
    let sql = 'SELECT * FROM categories';
    const params = [];

    if (type && ['bookmark', 'todo'].includes(type)) {
        sql += ' WHERE type = ?';
        params.push(type);
    }
    sql += ' ORDER BY sort_order, created_at';

    return db.queryAll(sql, params);
}

async function saveCategory(db, { id, name, icon, type }) {
    const categoryId = id || newId('cat');
    const categoryIcon = icon || '📁';
    const categoryType = (type === 'todo') ? 'todo' : 'bookmark';

    let sortOrder = 0;
    if (!id) {
        const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories WHERE type = ?', [categoryType]);
        sortOrder = (maxOrder?.max_order ?? -1) + 1;
    } else {
        const existing = await db.queryOne('SELECT sort_order, type FROM categories WHERE id = ?', [categoryId]);
        sortOrder = existing?.sort_order ?? 0;
    }

    await db.execute(
        `INSERT INTO categories (id, name, icon, type, sort_order)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           icon = excluded.icon,
           type = excluded.type,
           sort_order = excluded.sort_order`,
        [categoryId, name.trim(), categoryIcon, categoryType, sortOrder]
    );

    return { id: categoryId, name: name.trim(), icon: categoryIcon, type: categoryType };
}

async function deleteCategory(db, id, { mode = 'move', targetCategoryId = '' } = {}) {
    const category = await db.queryOne('SELECT id, name, icon, type, sort_order FROM categories WHERE id = ?', [id]);
    if (!category) return { deleted: false, moved: 0 };

    if (category.type === 'todo' || mode === 'delete') {
        await db.transaction(async (conn) => {
            await conn.execute(
                'DELETE FROM bookmark_ai WHERE bookmark_id IN (SELECT id FROM bookmarks WHERE category_id = ?)',
                [id]
            );
            await conn.execute('DELETE FROM bookmarks WHERE category_id = ?', [id]);
            await conn.execute('DELETE FROM categories WHERE id = ?', [id]);
        });
        return { deleted: true, moved: 0, mode: 'delete' };
    }

    let target = targetCategoryId
        ? await db.queryOne("SELECT id FROM categories WHERE id = ? AND id <> ? AND COALESCE(type, 'bookmark') = 'bookmark'", [targetCategoryId, id])
        : null;
    if (!target) {
        target = await db.queryOne("SELECT id FROM categories WHERE id <> ? AND COALESCE(type, 'bookmark') = 'bookmark' ORDER BY sort_order, created_at LIMIT 1", [id]);
    }
    if (!target) {
        const newId = require('./ids').newId('cat');
        await db.execute('INSERT INTO categories (id, name, icon, type, sort_order) VALUES (?, ?, ?, ?, ?)', [newId, '未分类', '📁', 'bookmark', 0]);
        target = { id: newId };
    }

    const count = await db.queryOne('SELECT COUNT(*) AS count FROM bookmarks WHERE category_id = ?', [id]);
    await db.transaction(async (conn) => {
        await conn.execute('UPDATE bookmarks SET category_id = ? WHERE category_id = ?', [target.id, id]);
        await conn.execute('DELETE FROM categories WHERE id = ?', [id]);
    });
    return { deleted: true, moved: Number(count?.count) || 0, targetCategoryId: target.id, mode: 'move' };
}

async function sortCategories(db, order) {
    await db.transaction(async (conn) => {
        for (const item of order) {
            if (item.id && typeof item.sort_order === 'number') {
                await conn.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
        }
    });
}

module.exports = { getAllCategories, saveCategory, deleteCategory, sortCategories };
