const test = require('node:test');
const assert = require('node:assert/strict');

const dataService = require('../shared/services/data');

function createMemoryDataDb() {
    const tables = {
        categories: [],
        bookmarks: [],
        bookmark_ai: [],
        search_engines: [],
        todos: [],
        config: []
    };

    const db = {
        USE_MYSQL: false,
        tables,
        async queryAll(sql) {
            if (/FROM categories/i.test(sql)) return [...tables.categories];
            if (/FROM bookmarks/i.test(sql)) return [...tables.bookmarks];
            if (/FROM search_engines/i.test(sql)) return [...tables.search_engines];
            if (/FROM todos/i.test(sql)) return [...tables.todos];
            if (/FROM bookmark_ai/i.test(sql)) return [...tables.bookmark_ai];
            return [];
        },
        async queryOne(sql, params = []) {
            if (/FROM config/i.test(sql)) {
                return tables.config.find(row => row.key === params[0]) || null;
            }
            return null;
        },
        async transaction(fn) {
            await fn({ execute });
        }
    };

    async function execute(sql, params = []) {
        if (/INSERT INTO categories/i.test(sql)) {
            upsert(tables.categories, 'id', { id: params[0], name: params[1], icon: params[2], sort_order: params[3] });
            return { changes: 1 };
        }
        if (/INSERT INTO bookmarks/i.test(sql)) {
            upsert(tables.bookmarks, 'id', {
                id: params[0], category_id: params[1], name: params[2], url: params[3], description: params[4],
                icon: params[5], icon_type: params[6], icon_data: params[7], item_type: params[8],
                component_type: params[9], sort_order: params[10]
            });
            return { changes: 1 };
        }
        if (/INSERT INTO bookmark_ai/i.test(sql)) {
            upsert(tables.bookmark_ai, 'bookmark_id', {
                bookmark_id: params[0], tags: params[1], summary: params[2], provider: params[3], model: params[4]
            });
            return { changes: 1 };
        }
        if (/INSERT INTO search_engines/i.test(sql)) {
            upsert(tables.search_engines, 'id', { id: params[0], name: params[1], icon: params[2], url: params[3], sort_order: params[4] });
            return { changes: 1 };
        }
        if (/INSERT INTO todos/i.test(sql)) {
            upsert(tables.todos, 'id', { id: params[0], title: params[1], is_done: params[2], sort_order: params[3], completed_at: params[4] });
            return { changes: 1 };
        }
        if (/INSERT INTO config/i.test(sql)) {
            upsert(tables.config, 'key', { key: params[0], value: params[1] });
            return { changes: 1 };
        }
        throw new Error(`unexpected SQL in test: ${sql}`);
    }

    return db;
}

function upsert(rows, key, value) {
    const index = rows.findIndex(row => row[key] === value[key]);
    if (index >= 0) rows[index] = { ...rows[index], ...value };
    else rows.push(value);
}

test('data export includes bookmark AI tags for WebDAV sync', async () => {
    const db = createMemoryDataDb();
    db.tables.bookmarks.push({
        id: 'bm-webdav-tags',
        category_id: 'cat-1',
        name: 'Tagged bookmark',
        url: 'https://example.com',
        description: '',
        icon: '',
        icon_type: 'emoji',
        icon_data: '🏷️',
        item_type: 'bookmark',
        component_type: null,
        sort_order: 0
    });
    db.tables.bookmark_ai.push({
        bookmark_id: 'bm-webdav-tags',
        tags: '["开发","效率"]',
        summary: 'Example summary',
        provider: 'manual',
        model: 'manual',
        updated_at: '2026-01-01T00:00:00.000Z'
    });

    const exported = await dataService.exportData(db, true);

    assert.deepEqual(exported.bookmark_ai, [{
        bookmark_id: 'bm-webdav-tags',
        tags: '["开发","效率"]',
        summary: 'Example summary',
        provider: 'manual',
        model: 'manual',
        updated_at: '2026-01-01T00:00:00.000Z'
    }]);
});

test('data import restores bookmark AI tags from WebDAV sync payload', async () => {
    const db = createMemoryDataDb();

    await dataService.importData(db, {
        categories: [{ id: 'cat-1', name: '默认', icon: '📁', sort_order: 0 }],
        bookmarks: [{
            id: 'bm-webdav-tags',
            category_id: 'cat-1',
            name: 'Tagged bookmark',
            url: 'https://example.com',
            description: '',
            icon: '',
            icon_type: 'emoji',
            icon_data: '🏷️',
            item_type: 'bookmark',
            component_type: null,
            sort_order: 0
        }],
        bookmark_ai: [{
            bookmark_id: 'bm-webdav-tags',
            tags: ['开发', '效率'],
            summary: 'Example summary',
            provider: 'manual',
            model: 'manual'
        }]
    });

    assert.deepEqual(db.tables.bookmark_ai, [{
        bookmark_id: 'bm-webdav-tags',
        tags: '["开发","效率"]',
        summary: 'Example summary',
        provider: 'manual',
        model: 'manual'
    }]);
});
