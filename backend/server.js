/**
 * 书签导航后端服务
 * Express + SQLite/MySQL + Favicon 代理
 *
 * 数据库模式：
 * - 默认使用 SQLite（本地文件存储）
 * - 设置 DATABASE_URL 环境变量后使用 MySQL
 */

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const { registerAiRoutes } = require('./ai');
const { asyncHandler, errorHandler } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('etag', 'weak');

// ========================================
// gzip/brotli压缩（优先级最高）
// ========================================
app.use(compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    },
    level: 6  // 压缩级别（0-9，6为平衡点）
}));

// ========================================
// 中间件
// ========================================
const corsOptions = {
    origin: (origin, callback) => {
        const allowed = String(process.env.CORS_ORIGIN || '').trim();
        if (!allowed) return callback(null, true); // 兼容模式
        const origins = allowed.split(',').map(o => o.trim()).filter(Boolean);
        if (!origin || origins.includes(origin)) return callback(null, true);
        callback(new Error('CORS 不允许该来源'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400
};
app.use(cors(corsOptions));
app.use((req, res, next) => {
    const limit = req.path.startsWith('/api/webdav') ? '10mb' : '2mb';
    express.json({ limit })(req, res, next);
});
app.use((req, res, next) => {
    if (req.method === 'GET' && req.path.startsWith('/api/')) {
        // 动态数据不缓存
        const noStorePaths = [
            '/api/todos',
            '/api/bootstrap-v2',
            '/api/categories',
            '/api/config'
        ];
        const isDynamic = noStorePaths.some(p => req.path.startsWith(p));
        
        if (isDynamic) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
        }
    }
    next();
});

// 静态文件服务：优先使用构建产物（dist/），开发模式使用源文件（frontend/）
const distPath = path.join(__dirname, '..', 'dist');
const frontendPath = path.join(__dirname, '..', 'frontend');
const staticRoot = fs.existsSync(distPath) ? distPath : frontendPath;

app.use(express.static(staticRoot, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.match(/\.(css|js)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));

// ========================================
// AI（可选功能，不影响现有功能）
// ========================================
registerAiRoutes(app, db);

// ========================================
// Bootstrap优化端点（MySQL高延迟优化）
// ========================================
const bootstrapV2Module = require('./bootstrap-v2');
bootstrapV2Module(app, db);

// 写入操作后自动清除缓存中间件
app.use((req, res, next) => {
    const writeMethods = ['POST', 'PUT', 'DELETE'];
    if (writeMethods.includes(req.method)) {
        const affectedPaths = [
            '/api/categories',
            '/api/bookmarks',
            '/api/engines',
            '/api/config',
            '/api/todos',
            '/api/data'
        ];
        
        const isAffected = affectedPaths.some(p => req.path.startsWith(p));
        if (isAffected) {
            res.on('finish', () => {
                if (res.statusCode < 400) {
                    try {
                        if (typeof bootstrapV2Module.clearBootstrapCache === 'function') {
                            bootstrapV2Module.clearBootstrapCache();
                        }
                    } catch (e) {
                        console.warn('[Bootstrap-v2] Failed to clear cache:', e.message);
                    }
                }
            });
        }
    }
    next();
});

// ========================================
// 启动加载聚合 API（优化：LEFT JOIN 消除 N+1 查询）
// ========================================
app.get('/api/bootstrap', asyncHandler(async (req, res) => {
    const [categories, engines, configRow] = await Promise.all([
        db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at'),
        db.queryAll('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC'),
        db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization'])
    ]);

    let config = null;
    if (configRow && configRow.value) {
        try { config = JSON.parse(configRow.value); } catch { config = null; }
    }

    // 单次查询：bookmarks + categories + bookmark_ai 一次性 JOIN
    const bookmarks = await db.queryAll(`
        SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
               CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
               b.item_type, b.component_type, b.sort_order, b.created_at,
               c.name as category_name, c.icon as category_icon,
               ba.tags as _ai_tags, ba.summary as ai_summary
        FROM bookmarks b
        LEFT JOIN categories c ON b.category_id = c.id
        LEFT JOIN bookmark_ai ba ON b.id = ba.bookmark_id
        ORDER BY c.sort_order, b.sort_order, b.created_at
    `);

    // 解析 AI tags JSON
    bookmarks.forEach(b => {
        let tags = [];
        if (b._ai_tags) {
            try { tags = JSON.parse(b._ai_tags); } catch {}
        }
        b.tags = Array.isArray(tags) ? tags : [];
        b.ai_summary = b.ai_summary || '';
        delete b._ai_tags;
    });

    res.json({
        success: true,
        data: { categories, bookmarks, engines, config }
    });
}));

// ========================================
// 模块化路由
// ========================================
const routes = require('./routes')(db);

// 主路由（新路径）
app.use('/api/categories', routes.categories);
app.use('/api/bookmarks', routes.bookmarks);
app.use('/api/engines', routes.engines);
app.use('/api/icons', routes.icons);
app.use('/api/icon', routes.icon);
app.use('/api/favicon', routes.favicon);
app.use('/api/config', routes.config);
app.use('/api/webdav', routes.webdav);
app.use('/api/docker', routes.docker);
app.use('/api/system', routes.system);
app.use('/api/data', routes.data);
app.use('/api/todos', routes.todos);
app.use('/api/suggest', routes.suggest);

// 图标代理（解决被墙图标无法显示问题）
// 1x1 透明 PNG 作为 fallback
const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

app.get('/api/proxy-icon', async (req, res) => {
    const { url } = req.query;
    if (!url) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(TRANSPARENT_PNG);
    }

    try {
        const parsedUrl = new URL(url);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.send(TRANSPARENT_PNG);
        }

        // 更真实的请求头
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': parsedUrl.origin + '/',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'cross-site'
        };

        const response = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(15000), // 增加到15秒
            redirect: 'follow'
        });

        if (!response.ok) {
            // 上游失败，返回透明图而非错误
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 失败缓存1小时
            return res.send(TRANSPARENT_PNG);
        }

        const contentType = response.headers.get('content-type') || 'image/png';
        
        // 验证是否为图片类型
        if (!contentType.startsWith('image/')) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(TRANSPARENT_PNG);
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // 验证图片大小（防止恶意大文件）
        if (buffer.length > 10 * 1024 * 1024) { // 超过10MB
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.send(TRANSPARENT_PNG);
        }

        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=604800'); // 成功缓存7天
        res.send(buffer);
    } catch (e) {
        // 任何异常都返回透明图，避免前端 onerror 循环
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(TRANSPARENT_PNG);
    }
});

// ========================================
// 初始化默认数据
// ========================================
async function initDefaultData() {
    const catCount = await db.queryOne('SELECT COUNT(*) as count FROM categories');
    if (catCount?.count > 0) return;

    console.log('📦 初始化默认数据...');

    const defaultCategories = [
        { id: 'cat_search', name: '搜索引擎', icon: '🔍' },
        { id: 'cat_dev', name: '开发工具', icon: '💻' },
        { id: 'cat_video', name: '视频娱乐', icon: '📺' },
        { id: 'cat_ai', name: 'AI 工具', icon: '🤖' },
    ];

    const defaultBookmarks = [
        { category_id: 'cat_search', name: 'Google', url: 'https://www.google.com', description: '全球最大的搜索引擎', icon: '🌐' },
        { category_id: 'cat_search', name: '百度', url: 'https://www.baidu.com', description: '中文搜索引擎', icon: '🔎' },
        { category_id: 'cat_dev', name: 'GitHub', url: 'https://github.com', description: '代码托管平台', icon: '🐙' },
        { category_id: 'cat_dev', name: 'Stack Overflow', url: 'https://stackoverflow.com', description: '程序员问答社区', icon: '📚' },
        { category_id: 'cat_video', name: 'YouTube', url: 'https://www.youtube.com', description: '全球视频平台', icon: '▶️' },
        { category_id: 'cat_video', name: '哔哩哔哩', url: 'https://www.bilibili.com', description: '年轻人的视频社区', icon: '📺' },
        { category_id: 'cat_ai', name: 'ChatGPT', url: 'https://chat.openai.com', description: 'OpenAI 智能对话', icon: '💬' },
        { category_id: 'cat_ai', name: 'Claude', url: 'https://claude.ai', description: 'Anthropic AI 助手', icon: '🧠' },
    ];

    const defaultEngines = [
        { id: 'eng_google', name: 'Google', icon: '🌐', url: 'https://www.google.com/search?q=' },
        { id: 'eng_baidu', name: '百度', icon: '🔎', url: 'https://www.baidu.com/s?wd=' },
        { id: 'eng_bing', name: 'Bing', icon: '🔷', url: 'https://www.bing.com/search?q=' },
    ];

    for (let i = 0; i < defaultCategories.length; i++) {
        const c = defaultCategories[i];
        await db.execute('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', [c.id, c.name, c.icon, i]);
    }

    for (let i = 0; i < defaultBookmarks.length; i++) {
        const b = defaultBookmarks[i];
        await db.execute('INSERT INTO bookmarks (id, category_id, name, url, description, icon) VALUES (?, ?, ?, ?, ?, ?)',
            [`bm_default_${i}`, b.category_id, b.name, b.url, b.description, b.icon]);
    }

    for (let i = 0; i < defaultEngines.length; i++) {
        const e = defaultEngines[i];
        await db.execute('INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)',
            [e.id, e.name, e.icon, e.url, i]);
    }

    console.log('✅ 默认数据初始化完成');
}

// ========================================
// 统一错误处理（必须在所有路由之后）
// ========================================
app.use(errorHandler);

// 前端路由（SPA fallback）
app.get('*', (req, res) => {
    const indexPath = fs.existsSync(distPath)
        ? path.join(distPath, 'index.html')
        : path.join(frontendPath, 'index.html');
    res.sendFile(indexPath);
});

// 启动服务器
async function start() {
    try {
        await db.initDatabase();
        await db.createTables();
        await initDefaultData();

        app.listen(PORT, () => {
            console.log(`🚀 书签导航服务已启动: http://localhost:${PORT}`);
            console.log(`📦 数据库模式: ${db.getDatabaseType().toUpperCase()}`);
        });
    } catch (err) {
        console.error('❌ 启动失败:', err.message);
        process.exit(1);
    }
}

start();
