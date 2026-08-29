const CURRENT_SCHEMA_VERSION = 3;

const TABLE_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '📁',
        type TEXT DEFAULT 'bookmark',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        category_id TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT,
        description TEXT,
        icon TEXT DEFAULT '🌐',
        icon_type TEXT DEFAULT 'auto',
        icon_data TEXT,
        item_type TEXT DEFAULT 'bookmark',
        component_type TEXT,
        sort_order INTEGER DEFAULT 0,
        visit_count INTEGER DEFAULT 0,
        last_visited_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_engines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🔍',
        url TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT
    );

    CREATE TABLE IF NOT EXISTS icon_library (
        id TEXT PRIMARY KEY,
        name TEXT,
        data TEXT NOT NULL,
        type TEXT DEFAULT 'url',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS icon_discovery_cache (
        origin TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        status TEXT,
        expires_at DATETIME NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookmark_ai (
        bookmark_id TEXT PRIMARY KEY,
        tags TEXT,
        summary TEXT,
        provider TEXT,
        model TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS todos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        is_done INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        CHECK (is_done IN (0, 1))
    );
`;

const INDEX_SCHEMA_SQL = `
    CREATE INDEX IF NOT EXISTS idx_bookmarks_category_sort ON bookmarks(category_id, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_visits ON bookmarks(visit_count DESC, last_visited_at DESC);
    CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order);
    CREATE INDEX IF NOT EXISTS idx_engines_sort ON search_engines(sort_order);
    CREATE INDEX IF NOT EXISTS idx_todos_list ON todos(is_done, sort_order, created_at);
    CREATE INDEX IF NOT EXISTS idx_bookmark_ai_lookup ON bookmark_ai(bookmark_id);
    CREATE INDEX IF NOT EXISTS idx_icon_discovery_cache_expires ON icon_discovery_cache(expires_at);
`;

const REQUIRED_COLUMNS = {
    categories: ['id', 'name', 'icon', 'type', 'sort_order', 'created_at'],
    bookmarks: [
        'id', 'category_id', 'name', 'url', 'description', 'icon', 'icon_type', 'icon_data',
        'item_type', 'component_type', 'sort_order', 'visit_count', 'last_visited_at', 'created_at'
    ],
    search_engines: ['id', 'name', 'icon', 'url', 'is_default', 'sort_order', 'created_at'],
    config: ['key', 'value'],
    icon_library: ['id', 'name', 'data', 'type', 'created_at'],
    icon_discovery_cache: ['origin', 'result_json', 'status', 'expires_at', 'updated_at'],
    bookmark_ai: ['bookmark_id', 'tags', 'summary', 'provider', 'model', 'updated_at'],
    todos: ['id', 'title', 'is_done', 'sort_order', 'created_at', 'updated_at', 'completed_at']
};

const V2_REQUIRED_COLUMNS = {
    bookmark_trash: ['id', 'snapshot_json', 'deleted_at', 'expires_at']
};

const V3_REQUIRED_COLUMNS = {
    bookmark_link_health: ['url', 'state', 'status_code', 'consecutive_failures', 'error', 'checked_at']
};

function quoteIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

function getSchemaVersion(connection) {
    return Number(connection.pragma('user_version', { simple: true })) || 0;
}

function getTableColumns(connection, tableName) {
    return connection.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all().map(row => row.name);
}

function assertRequiredColumns(connection, schemas = REQUIRED_COLUMNS) {
    for (const [tableName, requiredColumns] of Object.entries(schemas)) {
        const actualColumns = new Set(getTableColumns(connection, tableName));
        const missingColumns = requiredColumns.filter(column => !actualColumns.has(column));
        if (missingColumns.length > 0) {
            throw new Error(
                `数据库基线检查失败：表 ${tableName} 缺少字段 ${missingColumns.join(', ')}。` +
                '迁移已取消，请先备份数据库并检查旧版本结构。'
            );
        }
    }
}

function ensureCurrentSchema(connection) {
    connection.exec(TABLE_SCHEMA_SQL);
    assertRequiredColumns(connection);
    if (getSchemaVersion(connection) >= 2) {
        assertRequiredColumns(connection, V2_REQUIRED_COLUMNS);
        connection.exec('CREATE INDEX IF NOT EXISTS idx_bookmark_trash_deleted_at ON bookmark_trash(deleted_at DESC);');
    }
    if (getSchemaVersion(connection) >= 3) {
        assertRequiredColumns(connection, V3_REQUIRED_COLUMNS);
        connection.exec('CREATE INDEX IF NOT EXISTS idx_bookmark_link_health_checked ON bookmark_link_health(checked_at DESC);');
    }
    connection.exec(INDEX_SCHEMA_SQL);
}

const MIGRATIONS = [
    {
        version: 1,
        name: 'baseline_current_sqlite_schema',
        up(connection) {
            ensureCurrentSchema(connection);
        }
    },
    {
        version: 2,
        name: 'add_bookmark_trash',
        up(connection) {
            connection.exec(`
                CREATE TABLE IF NOT EXISTS bookmark_trash (
                    id TEXT PRIMARY KEY,
                    snapshot_json TEXT NOT NULL,
                    deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME
                );
            `);
            connection.exec('CREATE INDEX IF NOT EXISTS idx_bookmark_trash_deleted_at ON bookmark_trash(deleted_at DESC);');
        }
    },
    {
        version: 3,
        name: 'add_bookmark_link_health',
        up(connection) {
            connection.exec(`
                CREATE TABLE IF NOT EXISTS bookmark_link_health (
                    url TEXT PRIMARY KEY,
                    state TEXT NOT NULL,
                    status_code INTEGER,
                    consecutive_failures INTEGER NOT NULL DEFAULT 0,
                    error TEXT,
                    checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            connection.exec('CREATE INDEX IF NOT EXISTS idx_bookmark_link_health_checked ON bookmark_link_health(checked_at DESC);');
        }
    }
];

function migrateDatabase(connection) {
    const fromVersion = getSchemaVersion(connection);
    if (fromVersion > CURRENT_SCHEMA_VERSION) {
        throw new Error(
            `数据库版本 ${fromVersion} 高于当前程序支持的版本 ${CURRENT_SCHEMA_VERSION}，` +
            '请使用更新版本的程序启动。'
        );
    }

    const pending = MIGRATIONS.filter(migration => migration.version > fromVersion);
    if (pending.length === 0) {
        ensureCurrentSchema(connection);
        return { fromVersion, toVersion: fromVersion, applied: [] };
    }

    connection.exec('BEGIN IMMEDIATE');
    try {
        const applied = [];
        for (const migration of pending) {
            migration.up(connection);
            connection.pragma(`user_version = ${migration.version}`);
            applied.push({ version: migration.version, name: migration.name });
        }
        connection.exec('COMMIT');
        return {
            fromVersion,
            toVersion: getSchemaVersion(connection),
            applied
        };
    } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
    }
}

module.exports = {
    CURRENT_SCHEMA_VERSION,
    REQUIRED_COLUMNS,
    getSchemaVersion,
    migrateDatabase
};
