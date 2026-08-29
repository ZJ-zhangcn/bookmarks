const cheerio = require('cheerio');
const { newId } = require('../../shared/services/ids');

const MAX_BROWSER_IMPORT_BOOKMARKS = 100000;

function normalizeCategoryName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function canonicalizeBookmarkUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        if (!['http:', 'https:'].includes(url.protocol)) return null;
        url.hash = '';
        return url.toString();
    } catch {
        return null;
    }
}

function parseNetscapeBookmarks(html) {
    const $ = cheerio.load(String(html || ''), { xmlMode: false });
    const result = { categories: [], bookmarks: [] };
    const categoryMap = new Map();
    let categoryOrder = 0;
    let bookmarkOrder = 0;

    function ensureCategory(rawName) {
        const name = String(rawName || '').trim() || '未分类';
        const key = normalizeCategoryName(name);
        if (!categoryMap.has(key)) {
            const category = {
                id: newId('cat_import'),
                name,
                icon: '📁',
                sort_order: categoryOrder++
            };
            categoryMap.set(key, category);
            result.categories.push(category);
        }
        return categoryMap.get(key);
    }

    function addBookmark(anchor, categoryName) {
        const $anchor = $(anchor);
        const url = String($anchor.attr('href') || '').trim();
        const canonicalUrl = canonicalizeBookmarkUrl(url);
        const name = $anchor.text().trim();
        if (!name || !canonicalUrl) return;
        if (result.bookmarks.length >= MAX_BROWSER_IMPORT_BOOKMARKS) {
            throw new Error(`浏览器书签数量超过 ${MAX_BROWSER_IMPORT_BOOKMARKS} 条限制`);
        }
        const category = ensureCategory(categoryName);
        result.bookmarks.push({
            id: newId('bm_import'),
            category_id: category.id,
            name,
            url,
            canonical_url: canonicalUrl,
            description: '',
            icon: '🌐',
            icon_type: 'auto',
            icon_data: '',
            sort_order: bookmarkOrder++
        });
    }

    function processDefinitionList(list, inheritedCategory = '导入的书签') {
        $(list).children('dt').each((_, dt) => {
            const $dt = $(dt);
            const heading = $dt.children('h3').first();
            const anchor = $dt.children('a').first();
            if (heading.length > 0) {
                const folderName = heading.text().trim() || inheritedCategory;
                const nestedList = $dt.children('dl').first();
                if (nestedList.length > 0) processDefinitionList(nestedList, folderName);
            } else if (anchor.length > 0) {
                addBookmark(anchor, inheritedCategory);
            }
        });
    }

    const rootList = $('dl').first();
    if (rootList.length > 0) processDefinitionList(rootList);
    if (result.bookmarks.length === 0) {
        $('a').each((_, anchor) => addBookmark(anchor, '导入的书签'));
    }

    return result;
}

async function buildBrowserImportPlan(db, html) {
    const parsed = parseNetscapeBookmarks(html);
    if (parsed.bookmarks.length === 0) throw new Error('未能解析出任何书签');

    const [existingCategories, existingBookmarks] = await Promise.all([
        db.queryAll(
            `SELECT id, name, sort_order FROM categories
             WHERE COALESCE(type, 'bookmark') = 'bookmark'
             ORDER BY sort_order, created_at`
        ),
        db.queryAll(
            `SELECT id, category_id, name, url, sort_order FROM bookmarks
             WHERE COALESCE(item_type, 'bookmark') <> 'component'
             ORDER BY sort_order, created_at`
        )
    ]);
    const existingCategoryByName = new Map(
        existingCategories.map(category => [normalizeCategoryName(category.name), category])
    );
    const nextCategoryOrder = existingCategories.reduce(
        (maximum, category) => Math.max(maximum, Number(category.sort_order) || 0),
        -1
    ) + 1;
    const nextBookmarkOrderByCategory = new Map();
    for (const bookmark of existingBookmarks) {
        const nextOrder = Math.max(
            nextBookmarkOrderByCategory.get(bookmark.category_id) || 0,
            (Number(bookmark.sort_order) || 0) + 1
        );
        nextBookmarkOrderByCategory.set(bookmark.category_id, nextOrder);
    }
    const existingBookmarkByUrl = new Map();
    for (const bookmark of existingBookmarks) {
        const canonicalUrl = canonicalizeBookmarkUrl(bookmark.url);
        if (canonicalUrl && !existingBookmarkByUrl.has(canonicalUrl)) {
            existingBookmarkByUrl.set(canonicalUrl, bookmark);
        }
    }

    const categoryById = new Map(parsed.categories.map(category => [category.id, category]));
    const seenImportUrls = new Set();
    const bookmarks = [];
    let duplicateInFile = 0;
    for (const bookmark of parsed.bookmarks) {
        if (seenImportUrls.has(bookmark.canonical_url)) {
            duplicateInFile += 1;
            continue;
        }
        seenImportUrls.add(bookmark.canonical_url);
        const category = categoryById.get(bookmark.category_id);
        const existingCategory = existingCategoryByName.get(normalizeCategoryName(category?.name));
        const existingBookmark = existingBookmarkByUrl.get(bookmark.canonical_url);
        const targetCategoryId = existingCategory?.id || category.id;
        const targetSortOrder = nextBookmarkOrderByCategory.get(targetCategoryId) || 0;
        if (!existingBookmark) nextBookmarkOrderByCategory.set(targetCategoryId, targetSortOrder + 1);
        bookmarks.push({
            ...bookmark,
            category,
            targetCategoryId,
            targetSortOrder,
            categoryExists: Boolean(existingCategory),
            existingBookmark: existingBookmark || null
        });
    }

    const actionableCategoryIds = new Set(bookmarks.map(bookmark => bookmark.targetCategoryId));
    let newCategoryOffset = 0;
    const categories = parsed.categories
        .map(category => {
            const existing = existingCategoryByName.get(normalizeCategoryName(category.name));
            return {
                ...category,
                targetId: existing?.id || category.id,
                targetSortOrder: existing?.sort_order ?? nextCategoryOrder + newCategoryOffset++,
                exists: Boolean(existing)
            };
        })
        .filter(category => actionableCategoryIds.has(category.targetId));
    const duplicateBookmarks = bookmarks.filter(bookmark => bookmark.existingBookmark).length;

    return {
        categories,
        bookmarks,
        summary: {
            parsedBookmarks: parsed.bookmarks.length,
            uniqueBookmarks: bookmarks.length,
            newBookmarks: bookmarks.length - duplicateBookmarks,
            duplicateBookmarks,
            duplicateInFile,
            newCategories: categories.filter(category => !category.exists).length,
            reusedCategories: categories.filter(category => category.exists).length
        }
    };
}

function categoriesNeededForMode(plan, duplicateMode) {
    const neededCategoryIds = new Set(
        plan.bookmarks
            .filter(bookmark => !bookmark.existingBookmark || duplicateMode === 'update')
            .map(bookmark => bookmark.targetCategoryId)
    );
    return plan.categories.filter(category => neededCategoryIds.has(category.targetId));
}

function publicPreview(plan, duplicateMode = 'skip') {
    if (!['skip', 'update'].includes(duplicateMode)) throw new Error('重复书签处理方式必须是 skip 或 update');
    const neededCategories = categoriesNeededForMode(plan, duplicateMode);
    return {
        ...plan.summary,
        newCategories: neededCategories.filter(category => !category.exists).length,
        reusedCategories: neededCategories.filter(category => category.exists).length,
        sampleDuplicates: plan.bookmarks
            .filter(bookmark => bookmark.existingBookmark)
            .slice(0, 5)
            .map(bookmark => ({
                name: bookmark.name,
                url: bookmark.url,
                existingName: bookmark.existingBookmark.name
            }))
    };
}

async function applyBrowserImport(db, plan, duplicateMode = 'skip') {
    if (!['skip', 'update'].includes(duplicateMode)) throw new Error('重复书签处理方式必须是 skip 或 update');
    const newBookmarks = plan.bookmarks.filter(bookmark => !bookmark.existingBookmark);
    const duplicateBookmarks = plan.bookmarks.filter(bookmark => bookmark.existingBookmark);
    const categoriesToCreate = categoriesNeededForMode(plan, duplicateMode).filter(category => !category.exists);

    await db.transaction(async connection => {
        for (const category of categoriesToCreate) {
            await connection.execute(
                'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
                [category.targetId, category.name, category.icon || '📁', category.targetSortOrder]
            );
        }
        for (const bookmark of newBookmarks) {
            await connection.execute(
                `INSERT INTO bookmarks
                 (id, category_id, name, url, description, icon, icon_type, icon_data, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookmark.id, bookmark.targetCategoryId, bookmark.name, bookmark.url,
                    bookmark.description, bookmark.icon, bookmark.icon_type, bookmark.icon_data,
                    bookmark.targetSortOrder
                ]
            );
        }
        if (duplicateMode === 'update') {
            for (const bookmark of duplicateBookmarks) {
                await connection.execute(
                    'UPDATE bookmarks SET category_id = ?, name = ?, url = ? WHERE id = ?',
                    [bookmark.targetCategoryId, bookmark.name, bookmark.url, bookmark.existingBookmark.id]
                );
            }
        }
    });

    return {
        categoriesCreated: categoriesToCreate.length,
        bookmarksAdded: newBookmarks.length,
        bookmarksUpdated: duplicateMode === 'update' ? duplicateBookmarks.length : 0,
        bookmarksSkipped: duplicateMode === 'skip' ? duplicateBookmarks.length : 0,
        duplicateInFile: plan.summary.duplicateInFile
    };
}

module.exports = {
    MAX_BROWSER_IMPORT_BOOKMARKS,
    canonicalizeBookmarkUrl,
    parseNetscapeBookmarks,
    buildBrowserImportPlan,
    publicPreview,
    applyBrowserImport
};
