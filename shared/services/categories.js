/**
 * 分类服务
 */

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
    const categoryId = id || `cat_${Date.now()}`;
    const isNewCategory = !id;
    const categoryIcon = icon || '📁';
    const categoryType = (type === 'todo') ? 'todo' : 'bookmark';

    let sortOrder = 0;
    if (isNewCategory) {
        const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories WHERE type = ?', [categoryType]);
        sortOrder = (maxOrder?.max_order ?? -1) + 1;
    } else {
        const existing = await db.queryOne('SELECT sort_order, type FROM categories WHERE id = ?', [categoryId]);
        sortOrder = existing?.sort_order ?? 0;
    }

    if (db.USE_MYSQL) {
        await db.execute(
            'INSERT INTO categories (id, name, icon, type, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), type = VALUES(type), sort_order = VALUES(sort_order)',
            [categoryId, name.trim(), categoryIcon, categoryType, sortOrder]
        );
    } else {
        await db.execute(
            'INSERT OR REPLACE INTO categories (id, name, icon, type, sort_order) VALUES (?, ?, ?, ?, ?)',
            [categoryId, name.trim(), categoryIcon, categoryType, sortOrder]
        );
    }

    return { id: categoryId, name: name.trim(), icon: categoryIcon, type: categoryType };
}

async function deleteCategory(db, id) {
    await db.execute('DELETE FROM bookmarks WHERE category_id = ?', [id]);
    await db.execute('DELETE FROM categories WHERE id = ?', [id]);
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
