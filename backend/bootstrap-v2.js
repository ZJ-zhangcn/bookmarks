// Bootstrap v2 端点优化 - Stale-While-Revalidate 缓存策略
let bootstrapCache = { ts: 0, data: null };
let isRevalidating = false;
const CACHE_TTL = 300000; // 5分钟
const STALE_TTL = 600000; // 10分钟（允许返回陈旧缓存的最大时间）

module.exports = function registerBootstrapV2(app, db) {
    app.get('/api/bootstrap-v2', async (_req, res) => {
        const start = Date.now();
        const now = Date.now();

        const isFresh = bootstrapCache.data && (now - bootstrapCache.ts) < CACHE_TTL;
        const isStale = bootstrapCache.data && (now - bootstrapCache.ts) < STALE_TTL;

        // 缓存新鲜：直接返回
        if (isFresh) {
            res.setHeader('X-Cache', 'HIT');
            res.setHeader('X-Cache-Age', Math.floor((now - bootstrapCache.ts) / 1000));
            return res.json(bootstrapCache.data);
        }

        // 缓存陈旧但可用：返回缓存，后台刷新
        if (isStale) {
            res.setHeader('X-Cache', 'STALE');
            res.setHeader('X-Cache-Age', Math.floor((now - bootstrapCache.ts) / 1000));
            res.json(bootstrapCache.data);

            // 后台异步刷新（避免多个请求同时刷新）
            if (!isRevalidating) {
                isRevalidating = true;
                refreshCacheInBackground(db).finally(() => {
                    isRevalidating = false;
                });
            }
            return;
        }

        // 缓存完全失效或不存在：同步加载
        try {
            const data = await loadBootstrapData(db, start);
            res.setHeader('X-Cache', 'MISS');
            res.json(data);
        } catch (e) {
            console.error('[Bootstrap-v2] Error:', e);
            res.status(500).json({ success: false, error: e.message });
        }
    });
};

// 加载完整 Bootstrap 数据
async function loadBootstrapData(db, start) {
    const sql = `
        SELECT
            'category' as row_type, c.id, c.name, c.icon, c.sort_order, c.created_at,
            NULL as category_id, NULL as url, NULL as description, NULL as icon_type,
            NULL as icon_data, NULL as visit_count, NULL as last_visited_at,
            NULL as category_name, NULL as category_icon, NULL as tags, NULL as ai_summary
        FROM categories c
        UNION ALL
        SELECT
            'bookmark' as row_type, b.id, b.name, b.icon, b.sort_order, b.created_at,
            b.category_id, b.url, b.description, b.icon_type,
            CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
            b.visit_count, b.last_visited_at,
            c.name as category_name, c.icon as category_icon,
            ba.tags, ba.summary as ai_summary
        FROM bookmarks b
        LEFT JOIN categories c ON b.category_id = c.id
        LEFT JOIN bookmark_ai ba ON b.id = ba.bookmark_id
        WHERE COALESCE(b.item_type, 'bookmark') <> 'component'
        UNION ALL
        SELECT
            'engine' as row_type, e.id, e.name, e.icon, e.sort_order, e.created_at,
            NULL, e.url, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
        FROM search_engines e
        ORDER BY row_type, sort_order, created_at
    `;

    const todosSql = `
        SELECT t.*
        FROM todos t
        ORDER BY
            t.is_done ASC,
            t.sort_order ASC,
            t.created_at ASC
        LIMIT 200 OFFSET 0
    `;

    const [rows, configRow, todos] = await Promise.all([
        db.queryAll(sql),
        db.queryOne('SELECT value FROM config WHERE key = ?', ['personalization']),
        db.queryAll(todosSql)
    ]);

    if (start) {
        console.log(`[Bootstrap-v2] Query: ${Date.now() - start}ms (${rows.length} rows)`);
    }

    const categories = [];
    const bookmarks = [];
    const engines = [];

    rows.forEach(row => {
        if (row.row_type === 'category') {
            categories.push({
                id: row.id,
                name: row.name,
                icon: row.icon,
                sort_order: row.sort_order,
                created_at: row.created_at
            });
        } else if (row.row_type === 'bookmark') {
            let tags = [];
            if (row.tags) {
                try { tags = JSON.parse(row.tags); } catch {}
            }
            bookmarks.push({
                id: row.id,
                category_id: row.category_id,
                name: row.name,
                url: row.url,
                description: row.description,
                icon: row.icon,
                icon_type: row.icon_type,
                icon_data: row.icon_data,
                sort_order: row.sort_order,
                visit_count: row.visit_count || 0,
                last_visited_at: row.last_visited_at || null,
                created_at: row.created_at,
                category_name: row.category_name,
                category_icon: row.category_icon,
                tags: Array.isArray(tags) ? tags : [],
                ai_summary: row.ai_summary || ''
            });
        } else if (row.row_type === 'engine') {
            engines.push({
                id: row.id,
                name: row.name,
                icon: row.icon,
                url: row.url,
                sort_order: row.sort_order,
                created_at: row.created_at
            });
        }
    });

    let config = null;
    if (configRow && configRow.value) {
        try { config = JSON.parse(configRow.value); } catch { config = null; }
    }

    const responseData = {
        success: true,
        data: {
            categories,
            bookmarks,
            engines,
            config,
            todos: todos || []
        }
    };

    // 更新缓存
    bootstrapCache = { ts: Date.now(), data: responseData };

    if (start) {
        console.log(`[Bootstrap-v2] Total: ${Date.now() - start}ms`);
    }

    return responseData;
}

// 后台刷新缓存
async function refreshCacheInBackground(db) {
    try {
        await loadBootstrapData(db);
        console.log('[Bootstrap-v2] Cache refreshed in background');
    } catch (e) {
        console.error('[Bootstrap-v2] Background refresh failed:', e.message);
    }
}

// 导出缓存清除函数（供其他模块调用）
module.exports.clearBootstrapCache = function() {
    bootstrapCache = { ts: 0, data: null };
};
