/**
 * 数据导入导出路由模块
 */
const express = require('express');
const cheerio = require('cheerio');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');

function parseNetscapeBookmarks(html) {
    const $ = cheerio.load(html, { xmlMode: false });
    const result = { categories: [], bookmarks: [] };
    const categoryMap = new Map();
    let catOrder = 0;
    let bmOrder = 0;

    function processFolder(element, parentName = null) {
        const $el = $(element);
        const folderName = $el.children('h3').first().text().trim() || parentName || '未分类';

        if (folderName && !categoryMap.has(folderName)) {
            const catId = `cat_import_${Date.now()}_${catOrder}`;
            categoryMap.set(folderName, catId);
            result.categories.push({
                id: catId,
                name: folderName,
                icon: '📁',
                sort_order: catOrder++
            });
        }

        const catId = categoryMap.get(folderName);

        $el.children('dl').children('dt').each((_, dt) => {
            const $dt = $(dt);
            const $a = $dt.children('a').first();

            if ($a.length > 0) {
                const url = $a.attr('href') || '';
                const name = $a.text().trim();
                if (name && url && url.startsWith('http')) {
                    result.bookmarks.push({
                        id: `bm_import_${Date.now()}_${bmOrder}`,
                        category_id: catId,
                        name: name,
                        url: url,
                        description: '',
                        icon: '🌐',
                        icon_type: 'auto',
                        icon_data: '',
                        item_type: 'bookmark',
                        component_type: null,
                        sort_order: bmOrder++
                    });
                }
            } else if ($dt.children('h3').length > 0) {
                processFolder(dt, folderName);
            }
        });
    }

    $('dl').first().children('dt').each((_, dt) => {
        processFolder(dt);
    });

    if (result.bookmarks.length === 0) {
        $('a').each((_, a) => {
            const $a = $(a);
            const url = $a.attr('href') || '';
            const name = $a.text().trim();
            if (name && url && url.startsWith('http')) {
                if (!categoryMap.has('导入的书签')) {
                    const catId = `cat_import_${Date.now()}_0`;
                    categoryMap.set('导入的书签', catId);
                    result.categories.push({
                        id: catId,
                        name: '导入的书签',
                        icon: '📁',
                        sort_order: 0
                    });
                }
                result.bookmarks.push({
                    id: `bm_import_${Date.now()}_${bmOrder}`,
                    category_id: categoryMap.get('导入的书签'),
                    name: name,
                    url: url,
                    description: '',
                    icon: '🌐',
                    icon_type: 'auto',
                    icon_data: '',
                    item_type: 'bookmark',
                    component_type: null,
                    sort_order: bmOrder++
                });
            }
        });
    }

    return result;
}

module.exports = function(db) {
    async function exportData(includeIcons) {
        const categories = await db.queryAll('SELECT * FROM categories');
        let bookmarks = await db.queryAll('SELECT * FROM bookmarks');
        let engines = await db.queryAll('SELECT * FROM search_engines');

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
                icon: (e.icon && !e.icon.startsWith('data:') && !e.icon.startsWith('http')) ? e.icon : '🔍'
            }));
        }

        return {
            version: '1.0',
            exportTime: new Date().toISOString(),
            includeIcons,
            categories,
            bookmarks,
            engines,
            personalization
        };
    }

    async function importData(data) {
        const { categories, bookmarks, engines, personalization } = data;

        await db.transaction(async (conn) => {
            if (categories) {
                for (let i = 0; i < categories.length; i++) {
                    const c = categories[i];
                    if (db.USE_MYSQL) {
                        await conn.execute(
                            'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                            [c.id, c.name, c.icon, c.sort_order ?? i]
                        );
                    } else {
                        await conn.execute('INSERT OR REPLACE INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', [c.id, c.name, c.icon, c.sort_order ?? i]);
                    }
                }
            }
            if (bookmarks) {
                for (let i = 0; i < bookmarks.length; i++) {
                    const b = bookmarks[i];
                    if (db.USE_MYSQL) {
                        await conn.execute(
                            `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url),
                             description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type),
                             icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type), sort_order = VALUES(sort_order)`,
                            [b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '🌐', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i]
                        );
                    } else {
                        await conn.execute('INSERT OR REPLACE INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '🌐', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i]);
                    }
                }
            }
            if (engines) {
                for (let i = 0; i < engines.length; i++) {
                    const e = engines[i];
                    if (db.USE_MYSQL) {
                        await conn.execute(
                            'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
                            [e.id, e.name, e.icon, e.url, e.sort_order ?? i]
                        );
                    } else {
                        await conn.execute('INSERT OR REPLACE INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)', [e.id, e.name, e.icon, e.url, e.sort_order ?? i]);
                    }
                }
            }
            if (personalization) {
                if (db.USE_MYSQL) {
                    await conn.execute('INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['personalization', JSON.stringify(personalization)]);
                } else {
                    await conn.execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['personalization', JSON.stringify(personalization)]);
                }
            }
        });
    }

    // GET /api/data
    router.get('/', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons !== 'false';
        const data = await exportData(includeIcons);
        res.json(data);
    }));

    // POST /api/data
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        await importData(req.body);
        res.json(success());
    }));

    // 旧路径兼容
    router.get('/export', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons !== 'false';
        const data = await exportData(includeIcons);
        res.json(data);
    }));

    router.post('/import', requireAdmin, asyncHandler(async (req, res) => {
        await importData(req.body);
        res.json(success());
    }));

    // POST /api/data/browser-import - 导入浏览器书签 (Netscape HTML 格式)
    router.post('/browser-import', requireAdmin, asyncHandler(async (req, res) => {
        const { html } = req.body;
        if (!html) {
            throw new AppError('缺少书签数据', 400);
        }

        const parsed = parseNetscapeBookmarks(html);
        if (parsed.bookmarks.length === 0) {
            throw new AppError('未能解析出任何书签', 400);
        }

        await importData(parsed);
        res.json(success({
            categories: parsed.categories.length,
            bookmarks: parsed.bookmarks.length
        }));
    }));

    return router;
};
