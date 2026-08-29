const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const db = require('../backend/db');
const browserImportService = require('../backend/services/browser-import-service');

const IMPORT_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>工作</H3>
  <DL><p>
    <DT><A HREF="https://example.com/path#first">新名称</A>
    <DT><A HREF="https://new.example/?q=1">新增书签</A>
    <DT><A HREF="https://new.example/?q=1#duplicate">文件内重复</A>
  </DL><p>
  <DT><H3>新分类</H3>
  <DL><p><DT><A HREF="https://third.example">第三个</A></DL><p>
</DL><p>`;

test('URL canonicalization is conservative and ignores fragments', () => {
    assert.equal(
        browserImportService.canonicalizeBookmarkUrl('HTTPS://Example.COM:443/path?q=1#section'),
        'https://example.com/path?q=1'
    );
    assert.notEqual(
        browserImportService.canonicalizeBookmarkUrl('https://example.com/?q=1'),
        browserImportService.canonicalizeBookmarkUrl('https://example.com/?q=2')
    );
    assert.equal(browserImportService.canonicalizeBookmarkUrl('javascript:alert(1)'), null);
});

test('browser import previews and applies skip/update duplicate policies in SQLite', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-browser-import-'));
    try {
        await db.initDatabase({ filePath: path.join(directory, 'bookmarks.db') });
        await db.createTables();
        await db.execute('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', ['cat-work', '工作', '📁', 5]);
        await db.execute(
            `INSERT INTO bookmarks
             (id, category_id, name, url, description, icon, icon_type, sort_order, visit_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['existing', 'cat-work', '旧名称', 'https://example.com/path#old', '保留描述', '⭐', 'emoji', 7, 12]
        );

        const skipPlan = await browserImportService.buildBrowserImportPlan(db, IMPORT_HTML);
        assert.deepEqual(skipPlan.summary, {
            parsedBookmarks: 4,
            uniqueBookmarks: 3,
            newBookmarks: 2,
            duplicateBookmarks: 1,
            duplicateInFile: 1,
            newCategories: 1,
            reusedCategories: 1
        });
        assert.equal(browserImportService.publicPreview(skipPlan).sampleDuplicates[0].existingName, '旧名称');

        const skipped = await browserImportService.applyBrowserImport(db, skipPlan, 'skip');
        assert.deepEqual(skipped, {
            categoriesCreated: 1,
            bookmarksAdded: 2,
            bookmarksUpdated: 0,
            bookmarksSkipped: 1,
            duplicateInFile: 1
        });
        const existingAfterSkip = await db.queryOne('SELECT * FROM bookmarks WHERE id = ?', ['existing']);
        assert.equal(existingAfterSkip.name, '旧名称');
        assert.equal(existingAfterSkip.visit_count, 12);
        assert.equal((await db.queryOne('SELECT sort_order FROM categories WHERE name = ?', ['新分类'])).sort_order, 6);
        assert.equal((await db.queryOne('SELECT sort_order FROM bookmarks WHERE url = ?', ['https://new.example/?q=1'])).sort_order, 8);

        const updatePlan = await browserImportService.buildBrowserImportPlan(db, IMPORT_HTML);
        assert.equal(updatePlan.summary.newBookmarks, 0);
        assert.equal(updatePlan.summary.duplicateBookmarks, 3);
        const updated = await browserImportService.applyBrowserImport(db, updatePlan, 'update');
        assert.equal(updated.bookmarksUpdated, 3);
        assert.equal(updated.bookmarksAdded, 0);

        const existingAfterUpdate = await db.queryOne('SELECT * FROM bookmarks WHERE id = ?', ['existing']);
        assert.equal(existingAfterUpdate.name, '新名称');
        assert.equal(existingAfterUpdate.description, '保留描述');
        assert.equal(existingAfterUpdate.icon, '⭐');
        assert.equal(existingAfterUpdate.visit_count, 12);
        assert.equal((await db.queryOne('SELECT COUNT(*) count FROM bookmarks')).count, 3);
    } finally {
        db.closeDatabase();
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('skip preview does not promise an empty category used only by a duplicate', async () => {
    const fakeDb = {
        async queryAll(sql) {
            if (sql.includes('FROM categories')) return [];
            return [{ id: 'existing', category_id: 'old', name: '已有', url: 'https://example.com/', sort_order: 0 }];
        }
    };
    const html = '<DL><DT><H3>仅重复项</H3><DL><DT><A HREF="https://example.com/#fragment">重复</A></DL></DL>';
    const plan = await browserImportService.buildBrowserImportPlan(fakeDb, html);

    assert.equal(browserImportService.publicPreview(plan, 'skip').newCategories, 0);
    assert.equal(browserImportService.publicPreview(plan, 'update').newCategories, 1);
});

test('browser import only reuses bookmark categories and ignores component URLs', async () => {
    const queries = [];
    const fakeDb = {
        async queryAll(sql) {
            queries.push(sql);
            return [];
        }
    };
    const html = '<DL><DT><H3>同名分类</H3><DL><DT><A HREF="https://example.com/">书签</A></DL></DL>';
    const plan = await browserImportService.buildBrowserImportPlan(fakeDb, html);

    assert.equal(plan.summary.newCategories, 1);
    assert.match(queries[0], /COALESCE\(type, 'bookmark'\) = 'bookmark'/);
    assert.match(queries[1], /COALESCE\(item_type, 'bookmark'\) <> 'component'/);
});
