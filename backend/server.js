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
const { errorHandler, asyncHandler } = require('./utils');
const { proxyIconRequest } = require('./utils/icon-proxy');
const { safeFetchPublicUrl, readLimitedArrayBuffer } = require('./utils/safe-fetch');

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
    const limit = req.path.startsWith('/api/webdav') ? '10mb' : (req.path === '/api/ai' ? '64kb' : '2mb');
    express.json({ limit })(req, res, next);
});
app.use((req, res, next) => {
    if (req.method === 'GET' && req.path.startsWith('/api/')) {
        // 动态数据不缓存
        const noStorePaths = [
            '/api/todos',
            '/api/bootstrap-v2',
            '/api/categories',
            '/api/config',
            '/api/system/config',
            '/api/hermes/status',
            '/api/hermes/audit',
            '/api/hermes/jobs'
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
// 健康检查端点（用于 Docker HEALTHCHECK 等）
// ========================================
app.get('/api/health', async (req, res) => {
    try {
        // 简单检查数据库可用性
        await db.queryOne('SELECT 1 as ok');
        res.json({
            success: true,
            status: 'healthy',
            database: db.getDatabaseType(),
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: e.message
        });
    }
});

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
app.use('/api/metadata', routes.metadata);
app.use('/api/config', routes.config);
app.use('/api/webdav', routes.webdav);
app.use('/api/system', routes.system);
app.use('/api/data', routes.data);
app.use('/api/todos', routes.todos);
app.use('/api/suggest', routes.suggest);
app.use('/api/hermes', routes.hermes);

// 图标代理（解决被墙图标无法显示问题）
app.get('/api/proxy-icon', asyncHandler(async (req, res) => {
    await proxyIconRequest(req, res, {
        safeFetchPublicUrl,
        readLimitedArrayBuffer,
        maxBytes: 1024 * 1024,
        timeoutMs: 15000,
        transparentOnFailure: true
    });
}));

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

// ========================================
// 启动环境变量校验
// ========================================
function validateEnv() {
    const warnings = [];

    // MySQL 连接字符串格式校验
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
        if (!dbUrl.startsWith('mysql://')) {
            warnings.push('DATABASE_URL 必须以 mysql:// 开头');
        }
        try {
            new URL(dbUrl);
        } catch {
            warnings.push('DATABASE_URL 格式无效，请检查连接字符串');
        }
    }

    // AI 配置校验
    if (String(process.env.AI_ENABLED || '').toLowerCase() === 'true') {
        const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
        const validProviders = ['openai', 'gemini', 'claude'];
        if (provider && !validProviders.includes(provider)) {
            warnings.push(`AI_PROVIDER "${provider}" 无效，支持: ${validProviders.join(', ')}`);
        }
        if (provider === 'gemini') {
            if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
                warnings.push('AI 已启用但 GEMINI_API_KEY/GOOGLE_API_KEY 未配置');
            }
        } else {
            const keyMap = { openai: 'OPENAI_API_KEY', claude: 'ANTHROPIC_API_KEY' };
            const keyName = keyMap[provider];
            if (keyName && !process.env[keyName]) {
                warnings.push(`AI 已启用但 ${keyName} 未配置`);
            }
        }
    }

    // PORT 校验
    const port = parseInt(process.env.PORT, 10);
    if (process.env.PORT && (!Number.isFinite(port) || port < 1 || port > 65535)) {
        warnings.push(`PORT "${process.env.PORT}" 无效，必须为 1-65535 的整数`);
    }

    if (warnings.length > 0) {
        console.warn('⚠️ 环境变量校验警告:');
        warnings.forEach(w => console.warn(`   - ${w}`));
    }
}

// 启动服务器
async function start() {
    try {
        validateEnv();
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
