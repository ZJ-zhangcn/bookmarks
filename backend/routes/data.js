/**
 * 数据导入导出路由模块
 */
const express = require('express');
const { newId } = require('../../shared/services/ids');
const cheerio = require('cheerio');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');
const { requireAdmin } = require('../middleware/security');
const dataService = require('../../shared/services/data');

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
            const catId = newId('cat_import');
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
                        id: newId('bm_import'),
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
                    const catId = newId('cat_import');
                    categoryMap.set('导入的书签', catId);
                    result.categories.push({
                        id: catId,
                        name: '导入的书签',
                        icon: '📁',
                        sort_order: 0
                    });
                }
                result.bookmarks.push({
                    id: newId('bm_import'),
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
    // GET /api/data
    router.get('/', asyncHandler(async (req, res) => {
        const includeIcons = req.query.includeIcons !== 'false';
        const data = await dataService.exportData(db, includeIcons);
        res.json(data);
    }));

    // POST /api/data
    router.post('/', requireAdmin, asyncHandler(async (req, res) => {
        await dataService.importData(db, req.body);
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

        await dataService.importData(db, parsed);
        res.json(success({
            categories: parsed.categories.length,
            bookmarks: parsed.bookmarks.length
        }));
    }));

    return router;
};
