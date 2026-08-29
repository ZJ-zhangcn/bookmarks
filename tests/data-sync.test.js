const test = require('node:test');
const assert = require('node:assert/strict');

const dataService = require('../shared/services/data');

function createMemoryDataDb() {
    const tables = {
        categories: [],
        bookmarks: [],
        bookmark_ai: [],
        icon_library: [],
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
            if (/FROM icon_library/i.test(sql)) return [...tables.icon_library];
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
                icon: params[5], icon_type: params[6], icon_data: params[7], sort_order: params[8],
                visit_count: params[9], last_visited_at: params[10]
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
            upsert(tables.search_engines, 'id', {
                id: params[0], name: params[1], icon: params[2], url: params[3], is_default: params[4], sort_order: params[5]
            });
            return { changes: 1 };
        }
        if (/INSERT INTO icon_library/i.test(sql)) {
            upsert(tables.icon_library, 'id', { id: params[0], name: params[1], data: params[2], type: params[3] });
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

test('data backup round trip preserves visits, default engine and icon library', async () => {
    const source = createMemoryDataDb();
    source.tables.categories.push({ id: 'cat-1', name: '默认', icon: '📁', sort_order: 0 });
    source.tables.bookmarks.push({
        id: 'bm-history', category_id: 'cat-1', name: 'History', url: 'https://example.com', description: '',
        icon: '🌐', icon_type: 'url', icon_data: 'https://example.com/favicon.ico', sort_order: 0,
        visit_count: 42, last_visited_at: '2026-08-28T12:00:00.000Z'
    });
    source.tables.search_engines.push({
        id: 'eng-default', name: 'Search', icon: '🔍', url: 'https://example.com/?q=', is_default: 1, sort_order: 0
    });
    source.tables.icon_library.push({
        id: 'icon-1', name: 'Example', data: 'data:image/png;base64,AAAA', type: 'base64', created_at: '2026-08-28'
    });

    const exported = await dataService.exportData(source, true);
    const restored = createMemoryDataDb();
    await dataService.importData(restored, exported);

    assert.equal(exported.version, '1.2');
    assert.equal(restored.tables.bookmarks[0].visit_count, 42);
    assert.equal(restored.tables.bookmarks[0].last_visited_at, '2026-08-28T12:00:00.000Z');
    assert.equal(restored.tables.search_engines[0].is_default, 1);
    assert.deepEqual(restored.tables.icon_library, [{
        id: 'icon-1', name: 'Example', data: 'data:image/png;base64,AAAA', type: 'base64'
    }]);
});
