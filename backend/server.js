/**
 * 书签导航后端服务
 * Express + SQLite + Favicon 代理
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');
const Database = require('better-sqlite3');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保数据目录存在
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 初始化数据库
const db = new Database(path.join(__dirname, 'data', 'bookmarks.db'));

// 创建表
db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '📁',
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS search_engines (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT DEFAULT '🔍',
        url TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
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
`);

// 添加新列（如果不存在）
try {
    db.exec(`ALTER TABLE bookmarks ADD COLUMN item_type TEXT DEFAULT 'bookmark'`);
} catch (e) { /* 列已存在 */ }
try {
    db.exec(`ALTER TABLE bookmarks ADD COLUMN component_type TEXT`);
} catch (e) { /* 列已存在 */ }
try {
    db.exec(`ALTER TABLE search_engines ADD COLUMN sort_order INTEGER DEFAULT 0`);
} catch (e) { /* 列已存在 */ }

// 初始化搜索引擎排序（如果 sort_order 都是0，按 is_default 和 created_at 初始化）
try {
    const engines = db.prepare('SELECT id, is_default FROM search_engines ORDER BY is_default DESC, created_at ASC').all();
    const updateStmt = db.prepare('UPDATE search_engines SET sort_order = ? WHERE id = ?');
    engines.forEach((e, i) => {
        updateStmt.run(i, e.id);
    });
} catch (e) { /* 忽略错误 */ }

// 中间件
app.use(cors());
app.use(express.json({ limit: '1gb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ========================================
// 系统状态 API
// ========================================
const HOST_PROC = process.env.HOST_PROC || '/proc';
let lastCpuTimes = null;

function getCpuUsageFromProc() {
    try {
        const statPath = `${HOST_PROC}/stat`;
        const content = fs.readFileSync(statPath, 'utf8');
        const firstLine = content.split('\n')[0];
        const parts = firstLine.split(/\s+/).slice(1).map(Number);

        const [user, nice, system, idle, iowait, irq, softirq, steal] = parts;
        const total = user + nice + system + idle + iowait + irq + softirq + steal;
        const idleTime = idle + iowait;

        if (!lastCpuTimes) {
            lastCpuTimes = { total, idle: idleTime };
            return 0;
        }

        const totalDiff = total - lastCpuTimes.total;
        const idleDiff = idleTime - lastCpuTimes.idle;
        lastCpuTimes = { total, idle: idleTime };

        if (totalDiff === 0) return 0;
        return Math.round((1 - idleDiff / totalDiff) * 100 * 100) / 100;
    } catch (e) {
        // 回退到 Node.js os 模块
        const cpus = os.cpus();
        let totalIdle = 0, totalTick = 0;
        cpus.forEach(cpu => {
            for (let type in cpu.times) totalTick += cpu.times[type];
            totalIdle += cpu.times.idle;
        });
        return totalTick > 0 ? Math.round((1 - totalIdle / totalTick) * 100 * 100) / 100 : 0;
    }
}

function getMemoryFromProc() {
    try {
        const memPath = `${HOST_PROC}/meminfo`;
        const content = fs.readFileSync(memPath, 'utf8');
        const lines = content.split('\n');
        const memInfo = {};

        lines.forEach(line => {
            const match = line.match(/^(\w+):\s+(\d+)/);
            if (match) memInfo[match[1]] = parseInt(match[2]) * 1024; // kB to bytes
        });

        const total = memInfo.MemTotal || 0;
        const free = memInfo.MemFree || 0;
        const buffers = memInfo.Buffers || 0;
        const cached = memInfo.Cached || 0;
        const available = memInfo.MemAvailable || (free + buffers + cached);
        const used = total - available;

        return { total, used, free: available, usagePercent: Math.round((used / total) * 100 * 100) / 100 };
    } catch (e) {
        // 回退到 Node.js os 模块
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return { total, used, free, usagePercent: Math.round((used / total) * 100 * 100) / 100 };
    }
}

app.get('/api/system/stats', async (req, res) => {
    try {
        // CPU
        const cpuUsage = getCpuUsageFromProc();
        const cpuCores = os.cpus().length;

        // 内存
        const memory = getMemoryFromProc();

        // 磁盘
        let diskInfo = { total: 0, used: 0, free: 0 };
        try {
            const { execSync } = require('child_process');
            if (process.platform === 'win32') {
                const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf8' });
                const lines = output.trim().split('\n').slice(1);
                lines.forEach(line => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 3) {
                        diskInfo.free += parseInt(parts[1]) || 0;
                        diskInfo.total += parseInt(parts[2]) || 0;
                    }
                });
                diskInfo.used = diskInfo.total - diskInfo.free;
            } else {
                // 尝试读取宿主机磁盘信息
                const hostRoot = process.env.HOST_PROC ? '/host' : '/';
                const output = execSync(`df -B1 ${hostRoot} 2>/dev/null || df -B1 / | tail -1 | awk '{print $2,$3,$4}'`, { encoding: 'utf8' });
                const lastLine = output.trim().split('\n').pop();
                const parts = lastLine.split(/\s+/);
                if (parts.length >= 4) {
                    diskInfo.total = parseInt(parts[1]) || 0;
                    diskInfo.used = parseInt(parts[2]) || 0;
                    diskInfo.free = parseInt(parts[3]) || 0;
                }
            }
        } catch (e) {
            console.error('获取磁盘信息失败:', e.message);
        }

        res.json({
            success: true,
            data: {
                cpu: {
                    usage: cpuUsage,
                    cores: cpuCores
                },
                memory: memory,
                disk: {
                    total: diskInfo.total,
                    used: diskInfo.used,
                    free: diskInfo.free,
                    usagePercent: diskInfo.total > 0 ? Math.round((diskInfo.used / diskInfo.total) * 100 * 100) / 100 : 0
                }
            }
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 分类 API
// ========================================
app.get('/api/categories', (req, res) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, created_at').all();
    res.json({ success: true, data: categories });
});

app.post('/api/categories', (req, res) => {
    const { id, name, icon } = req.body;
    const categoryId = id || `cat_${Date.now()}`;
    const isNewCategory = !id;

    try {
        let sortOrder = 0;
        if (isNewCategory) {
            // 新分类获取最大排序值，确保添加到末尾
            const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM categories').get();
            sortOrder = (maxOrder?.max_order ?? -1) + 1;
        } else {
            // 编辑时保持原有排序
            const existing = db.prepare('SELECT sort_order FROM categories WHERE id = ?').get(categoryId);
            sortOrder = existing?.sort_order ?? 0;
        }

        db.prepare('INSERT OR REPLACE INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)')
            .run(categoryId, name, icon || '📁', sortOrder);
        res.json({ success: true, data: { id: categoryId, name, icon: icon || '📁' } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/categories/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM bookmarks WHERE category_id = ?').run(req.params.id);
        db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 分类排序
app.post('/api/categories/sort', (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
        return res.status(400).json({ success: false, error: '无效的排序数据' });
    }

    try {
        const stmt = db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
        const transaction = db.transaction(() => {
            order.forEach(item => {
                stmt.run(item.sort_order, item.id);
            });
        });
        transaction();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 书签 API
// ========================================

// 获取书签列表（不含图标数据，用于快速加载）
app.get('/api/bookmarks', (req, res) => {
    const includeIcons = req.query.includeIcons === 'true';

    let sql;
    if (includeIcons) {
        sql = `
            SELECT b.*, c.name as category_name, c.icon as category_icon
            FROM bookmarks b
            LEFT JOIN categories c ON b.category_id = c.id
            ORDER BY c.sort_order, b.sort_order, b.created_at
        `;
    } else {
        // URL 类型图标直接返回（URL 字符串很小），base64 图标懒加载
        sql = `
            SELECT b.id, b.category_id, b.name, b.url, b.description, b.icon, b.icon_type,
                   CASE WHEN b.icon_type = 'url' THEN b.icon_data ELSE NULL END as icon_data,
                   b.item_type, b.component_type, b.sort_order, b.created_at,
                   c.name as category_name, c.icon as category_icon
            FROM bookmarks b
            LEFT JOIN categories c ON b.category_id = c.id
            ORDER BY c.sort_order, b.sort_order, b.created_at
        `;
    }

    const bookmarks = db.prepare(sql).all();
    res.json({ success: true, data: bookmarks });
});

// 获取单个书签的图标数据
app.get('/api/bookmarks/:id/icon', (req, res) => {
    try {
        const bookmark = db.prepare('SELECT icon_data, icon_type FROM bookmarks WHERE id = ?').get(req.params.id);
        if (bookmark) {
            res.json({ success: true, data: bookmark });
        } else {
            res.status(404).json({ success: false, error: '书签不存在' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量获取书签图标数据
app.post('/api/bookmarks/icons', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({ success: true, data: {} });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const bookmarks = db.prepare(`SELECT id, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders})`).all(...ids);
        const iconMap = {};
        bookmarks.forEach(b => {
            if (b.icon_data) {
                iconMap[b.id] = { icon_data: b.icon_data, icon_type: b.icon_type };
            }
        });
        res.json({ success: true, data: iconMap });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/bookmarks/grouped', (req, res) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, created_at').all();
    const bookmarks = db.prepare('SELECT * FROM bookmarks ORDER BY sort_order, created_at').all();

    const grouped = categories.map(cat => ({
        ...cat,
        items: bookmarks.filter(b => b.category_id === cat.id)
    }));

    res.json({ success: true, data: grouped });
});

app.post('/api/bookmarks', (req, res) => {
    const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;
    const bookmarkId = id || `bm_${Date.now()}`;
    const isNewBookmark = !id;

    try {
        // 检查分类是否存在，不存在则创建
        const existingCat = db.prepare('SELECT id FROM categories WHERE id = ?').get(category_id);
        if (!existingCat) {
            // 如果 category_id 看起来像名称，创建新分类
            const newCatId = `cat_${Date.now()}`;
            // 获取当前最大的分类排序值，确保新分类排在末尾
            const maxCatOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM categories').get();
            const catSortOrder = (maxCatOrder?.max_order ?? -1) + 1;
            db.prepare('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)')
                .run(newCatId, category_id, '📁', catSortOrder);
            req.body.category_id = newCatId;
        }

        const finalCategoryId = req.body.category_id || category_id;

        // 新书签时获取当前分类的最大 sort_order，确保添加到末尾
        let sortOrder = 0;
        if (isNewBookmark) {
            const maxOrder = db.prepare('SELECT MAX(sort_order) as max_order FROM bookmarks WHERE category_id = ?')
                .get(finalCategoryId);
            sortOrder = (maxOrder?.max_order ?? -1) + 1;
        } else {
            // 编辑时保持原有排序
            const existing = db.prepare('SELECT sort_order FROM bookmarks WHERE id = ?').get(bookmarkId);
            sortOrder = existing?.sort_order ?? 0;
        }

        db.prepare(`
            INSERT OR REPLACE INTO bookmarks
            (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            bookmarkId,
            finalCategoryId,
            name,
            url || '',
            description || '',
            icon || '🌐',
            icon_type || 'auto',
            icon_data || '',
            item_type || 'bookmark',
            component_type || null,
            sortOrder
        );

        res.json({ success: true, data: { id: bookmarkId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/bookmarks/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM bookmarks WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 书签排序
app.post('/api/bookmarks/sort', (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
        return res.status(400).json({ success: false, error: '无效的排序数据' });
    }

    try {
        const stmt = db.prepare('UPDATE bookmarks SET sort_order = ? WHERE id = ?');
        const transaction = db.transaction(() => {
            order.forEach(item => {
                stmt.run(item.sort_order, item.id);
            });
        });
        transaction();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 搜索引擎 API
// ========================================
app.get('/api/engines', (req, res) => {
    const engines = db.prepare('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC').all();
    res.json({ success: true, data: engines });
});

// ========================================
// 图标库 API
// ========================================

// 获取图标库（合并手动上传的图标和书签/搜索引擎中的图标）
app.get('/api/icons/library', (req, res) => {
    try {
        const icons = [];

        // 获取手动上传的图标
        const uploadedIcons = db.prepare(`
            SELECT id, name, data, type, created_at
            FROM icon_library
            ORDER BY created_at DESC
        `).all();

        uploadedIcons.forEach(icon => {
            icons.push({
                id: icon.id,
                data: icon.data,
                type: icon.type,
                source: icon.name || '手动上传',
                uploaded: true
            });
        });

        // 获取所有书签的图标（base64 和 url 类型）
        const bookmarkIcons = db.prepare(`
            SELECT DISTINCT icon_data, icon_type, name
            FROM bookmarks
            WHERE icon_type IN ('base64', 'url') AND icon_data IS NOT NULL AND icon_data != ''
        `).all();

        // 获取所有搜索引擎的图标
        const engineIcons = db.prepare(`
            SELECT DISTINCT icon, name
            FROM search_engines
            WHERE icon IS NOT NULL AND icon != '' AND icon LIKE 'http%' OR icon LIKE 'data:%'
        `).all();

        // 处理书签图标
        bookmarkIcons.forEach(b => {
            if (b.icon_data && !icons.find(i => i.data === b.icon_data)) {
                icons.push({
                    data: b.icon_data,
                    type: b.icon_type,
                    source: b.name,
                    uploaded: false
                });
            }
        });

        // 处理搜索引擎图标
        engineIcons.forEach(e => {
            if (e.icon && !icons.find(i => i.data === e.icon)) {
                icons.push({
                    data: e.icon,
                    type: e.icon.startsWith('data:') ? 'base64' : 'url',
                    source: e.name,
                    uploaded: false
                });
            }
        });

        res.json({ success: true, data: icons });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 上传图标到图标库
app.post('/api/icons/library', (req, res) => {
    const { name, data, type } = req.body;

    if (!data) {
        return res.status(400).json({ success: false, error: '缺少图标数据' });
    }

    try {
        const iconId = `icon_${Date.now()}`;
        db.prepare('INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)')
            .run(iconId, name || '', data, type || 'base64');
        res.json({ success: true, data: { id: iconId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 从 URL 添加图标到图标库（直接存储 URL）
app.post('/api/icons/library/from-url', async (req, res) => {
    const { name, url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: '缺少图标 URL' });
    }

    try {
        // 验证 URL 是否可访问
        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        // 直接存储 URL
        const iconId = `icon_${Date.now()}`;
        db.prepare('INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)')
            .run(iconId, name || '', url, 'url');
        res.json({ success: true, data: { id: iconId, data: url } });
    } catch (e) {
        res.status(500).json({ success: false, error: '无法访问该 URL: ' + e.message });
    }
});

// 删除图标库中的图标
app.delete('/api/icons/library/:id', (req, res) => {
    try {
        const result = db.prepare('DELETE FROM icon_library WHERE id = ?').run(req.params.id);
        if (result.changes > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: '图标不存在' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量删除图标
app.post('/api/icons/library/batch-delete', (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: '无效的图标 ID 列表' });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const result = db.prepare(`DELETE FROM icon_library WHERE id IN (${placeholders})`).run(...ids);
        res.json({ success: true, deleted: result.changes });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/engines', (req, res) => {
    const { id, name, icon, url, sort_order } = req.body;
    const engineId = id || `eng_${Date.now()}`;

    try {
        // 如果是新增，获取当前最大 sort_order
        let order = sort_order;
        if (order === undefined || order === null) {
            const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM search_engines').get();
            order = (maxOrder.max || 0) + 1;
        }
        db.prepare('INSERT OR REPLACE INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)')
            .run(engineId, name, icon || '🔍', url, order);
        res.json({ success: true, data: { id: engineId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 搜索引擎排序 API
app.put('/api/engines/sort', (req, res) => {
    const { orders } = req.body; // [{ id: 'xxx', sort_order: 0 }, ...]
    try {
        const updateStmt = db.prepare('UPDATE search_engines SET sort_order = ? WHERE id = ?');
        const transaction = db.transaction(() => {
            orders.forEach(item => {
                updateStmt.run(item.sort_order, item.id);
            });
        });
        transaction();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/engines/:id', (req, res) => {
    try {
        db.prepare('DELETE FROM search_engines WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// Favicon 代理 API
// ========================================

// 判断是否为内网/本地地址
function isPrivateOrLocalAddress(hostname) {
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    const privatePatterns = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^169\.254\./,
        /^fc00:/i,
        /^fe80:/i
    ];
    return privatePatterns.some(p => p.test(hostname));
}

app.post('/api/favicon', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    try {
        const parsedUrl = new URL(url);
        const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
        const isPrivate = isPrivateOrLocalAddress(parsedUrl.hostname);

        // 尝试获取页面 HTML
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        const icons = [];

        // 解析各种 favicon 来源
        const selectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]',
            'meta[property="og:image"]'
        ];

        selectors.forEach(selector => {
            $(selector).each((_, el) => {
                let href = $(el).attr('href') || $(el).attr('content');
                if (href) {
                    // 转换为绝对 URL
                    if (href.startsWith('//')) {
                        href = parsedUrl.protocol + href;
                    } else if (href.startsWith('/')) {
                        href = baseUrl + href;
                    } else if (!href.startsWith('http')) {
                        href = baseUrl + '/' + href;
                    }

                    if (!icons.includes(href)) {
                        icons.push(href);
                    }
                }
            });
        });

        // 添加默认 favicon.ico
        const defaultFavicon = `${baseUrl}/favicon.ico`;
        if (!icons.includes(defaultFavicon)) {
            icons.push(defaultFavicon);
        }

        // 只有外网地址才添加 Google 备用
        if (!isPrivate) {
            icons.push(`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`);
        }

        res.json({ success: true, icons });
    } catch (e) {
        // 失败时：外网返回 Google favicon，内网返回空
        try {
            const parsedUrl = new URL(url);
            if (isPrivateOrLocalAddress(parsedUrl.hostname)) {
                // 内网地址，尝试直接返回 /favicon.ico
                res.json({
                    success: true,
                    icons: [`${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`]
                });
            } else {
                res.json({
                    success: true,
                    icons: [`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`]
                });
            }
        } catch {
            res.status(500).json({ success: false, error: e.message });
        }
    }
});

// 将图标 URL 转换为 base64
app.post('/api/icon/convert', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: '缺少 URL' });
    }

    try {
        // 使用 fetch 替代 http/https 模块，更简洁可靠
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/png';
        const base64 = Buffer.from(buffer).toString('base64');
        res.json({ success: true, data: `data:${contentType.split(';')[0]};base64,${base64}` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量修复 URL 类型图标（转换为 base64）
app.post('/api/icon/fix-all', async (req, res) => {
    try {
        // 获取所有 URL 类型的图标
        const bookmarks = db.prepare(`
            SELECT id, icon_data FROM bookmarks
            WHERE icon_type = 'url' AND icon_data IS NOT NULL AND icon_data != ''
        `).all();

        let fixed = 0;
        let failed = 0;
        const update = db.prepare('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?');

        for (const bm of bookmarks) {
            try {
                const response = await fetch(bm.icon_data, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 5000
                });

                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const contentType = response.headers.get('content-type') || 'image/png';
                    const base64 = Buffer.from(buffer).toString('base64');
                    const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                    update.run('base64', dataUrl, bm.id);
                    fixed++;
                } else {
                    // 无法访问，清除图标使用默认
                    update.run('emoji', '', bm.id);
                    failed++;
                }
            } catch {
                // 转换失败，清除图标使用默认
                update.run('emoji', '', bm.id);
                failed++;
            }
        }

        res.json({
            success: true,
            message: `修复完成：${fixed} 个成功，${failed} 个使用默认图标`,
            fixed,
            failed,
            total: bookmarks.length
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 批量为没有图标的书签获取图标
app.post('/api/icon/fetch-all', async (req, res) => {
    try {
        // 获取所有没有图标数据的书签
        const bookmarks = db.prepare(`
            SELECT id, url FROM bookmarks
            WHERE url IS NOT NULL AND url != ''
            AND (icon_data IS NULL OR icon_data = '' OR icon_type = 'auto')
        `).all();

        let success = 0;
        let failed = 0;
        const update = db.prepare('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?');

        for (const bm of bookmarks) {
            try {
                const parsedUrl = new URL(bm.url);
                const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

                // 先尝试获取页面 HTML 解析 favicon
                let iconUrl = null;
                try {
                    const pageRes = await fetch(bm.url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        timeout: 5000
                    });
                    if (pageRes.ok) {
                        const html = await pageRes.text();
                        // 查找 <link rel="icon" 或 <link rel="shortcut icon"
                        const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
                            || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
                        if (iconMatch) {
                            iconUrl = iconMatch[1].startsWith('http') ? iconMatch[1]
                                : iconMatch[1].startsWith('//') ? 'https:' + iconMatch[1]
                                : iconMatch[1].startsWith('/') ? baseUrl + iconMatch[1]
                                : baseUrl + '/' + iconMatch[1];
                        }
                    }
                } catch { }

                // 如果没找到，尝试默认 /favicon.ico
                if (!iconUrl) {
                    iconUrl = baseUrl + '/favicon.ico';
                }

                // 下载图标并转为 base64
                const iconRes = await fetch(iconUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    timeout: 5000
                });

                if (iconRes.ok) {
                    const buffer = await iconRes.arrayBuffer();
                    if (buffer.byteLength > 0) {
                        const contentType = iconRes.headers.get('content-type') || 'image/x-icon';
                        const base64 = Buffer.from(buffer).toString('base64');
                        const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                        update.run('base64', dataUrl, bm.id);
                        success++;
                        continue;
                    }
                }
                failed++;
            } catch {
                failed++;
            }
        }

        res.json({
            success: true,
            message: `获取完成：${success} 个成功，${failed} 个失败`,
            fetched: success,
            failed,
            total: bookmarks.length
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 配置导入导出
// ========================================
app.get('/api/export', (req, res) => {
    const includeIcons = req.query.includeIcons !== 'false'; // 默认包含图标

    const categories = db.prepare('SELECT * FROM categories').all();
    let bookmarks = db.prepare('SELECT * FROM bookmarks').all();
    let engines = db.prepare('SELECT * FROM search_engines').all();

    // 获取个性化设置
    let personalization = null;
    try {
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get('personalization');
        if (row) {
            personalization = JSON.parse(row.value);
        }
    } catch (e) {
        console.error('导出个性化设置失败:', e);
    }

    // 如果不包含图标，清除 icon_data 字段
    if (!includeIcons) {
        bookmarks = bookmarks.map(b => ({
            ...b,
            icon_data: b.icon_type === 'emoji' ? b.icon_data : '' // 保留 emoji，清除 base64/url
        }));
        engines = engines.map(e => ({
            ...e,
            icon: (e.icon && !e.icon.startsWith('data:') && !e.icon.startsWith('http')) ? e.icon : '🔍'
        }));
    }

    res.json({
        version: '1.0',
        exportTime: new Date().toISOString(),
        includeIcons,
        categories,
        bookmarks,
        engines,
        personalization
    });
});

app.post('/api/import', (req, res) => {
    const { categories, bookmarks, engines, personalization } = req.body;

    try {
        const insertCat = db.prepare('INSERT OR REPLACE INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)');
        const insertBm = db.prepare('INSERT OR REPLACE INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const insertEng = db.prepare('INSERT OR REPLACE INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)');

        const transaction = db.transaction(() => {
            if (categories) {
                categories.forEach((c, i) => insertCat.run(c.id, c.name, c.icon, c.sort_order || i));
            }
            if (bookmarks) {
                bookmarks.forEach((b, i) => insertBm.run(b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '🌐', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order !== undefined ? b.sort_order : i));
            }
            if (engines) {
                engines.forEach((e, i) => insertEng.run(e.id, e.name, e.icon, e.url, e.sort_order !== undefined ? e.sort_order : i));
            }
            // 导入个性化设置
            if (personalization) {
                db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('personalization', JSON.stringify(personalization));
            }
        });

        transaction();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// WebDAV 代理 API
// ========================================
app.post('/api/webdav/upload', async (req, res) => {
    const { url, username, password, path: filePath, data } = req.body;

    if (!url || !username || !password) {
        return res.status(400).json({ success: false, error: '请填写完整的 WebDAV 配置' });
    }

    try {
        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

        // 确保目录存在（创建目录）
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dirPath) {
            const dirUrl = url.endsWith('/') ? url + dirPath : url + '/' + dirPath;
            await fetch(dirUrl, {
                method: 'MKCOL',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
                }
            }).catch(() => { }); // 忽略目录已存在的错误
        }

        const response = await fetch(fullUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data, null, 2)
        });

        if (response.ok || response.status === 201 || response.status === 204) {
            res.json({ success: true, message: '上传成功' });
        } else {
            const text = await response.text();
            res.status(response.status).json({ success: false, error: `上传失败: ${response.status} ${text}` });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/webdav/download', async (req, res) => {
    const { url, username, password, path: filePath } = req.body;

    if (!url || !username || !password) {
        return res.status(400).json({ success: false, error: '请填写完整的 WebDAV 配置' });
    }

    try {
        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
            }
        });

        if (response.ok) {
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                res.json({ success: true, data });
            } catch (parseErr) {
                res.status(400).json({ success: false, error: '文件内容不是有效的 JSON 格式' });
            }
        } else if (response.status === 404) {
            res.status(404).json({ success: false, error: '文件不存在，请先上传备份' });
        } else if (response.status === 401) {
            res.status(401).json({ success: false, error: '认证失败，请检查用户名和密码' });
        } else {
            res.status(response.status).json({ success: false, error: `下载失败: ${response.status}` });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: '连接 WebDAV 服务器失败: ' + e.message });
    }
});

// ========================================
// 初始化默认数据
// ========================================
function initDefaultData() {
    const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
    if (catCount > 0) return;

    console.log('初始化默认数据...');

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

    const insertCat = db.prepare('INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)');
    const insertBm = db.prepare('INSERT INTO bookmarks (id, category_id, name, url, description, icon) VALUES (?, ?, ?, ?, ?, ?)');
    const insertEng = db.prepare('INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)');

    const transaction = db.transaction(() => {
        defaultCategories.forEach((c, i) => insertCat.run(c.id, c.name, c.icon, i));
        defaultBookmarks.forEach((b, i) => insertBm.run(`bm_default_${i}`, b.category_id, b.name, b.url, b.description, b.icon));
        defaultEngines.forEach((e, i) => insertEng.run(e.id, e.name, e.icon, e.url, i));
    });

    transaction();
    console.log('默认数据初始化完成');
}



// 初始化默认数据
initDefaultData();

// ========================================
// 个性化配置 API
// ========================================
app.get('/api/config/personalization', (req, res) => {
    try {
        const row = db.prepare('SELECT value FROM config WHERE key = ?').get('personalization');
        if (row) {
            res.json({ success: true, data: JSON.parse(row.value) });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/config/personalization', (req, res) => {
    try {
        const value = JSON.stringify(req.body);
        db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run('personalization', value);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// Docker 容器管理 API
// ========================================
const http = require('http');

// Docker socket 路径
const DOCKER_SOCKET = process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock';

async function dockerRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            socketPath: DOCKER_SOCKET,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
                } catch {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// 获取容器列表
app.get('/api/docker/containers', async (req, res) => {
    try {
        const result = await dockerRequest('/containers/json?all=true');
        if (result.status === 200) {
            const containers = result.data.map(c => ({
                id: c.Id.substring(0, 12),
                name: c.Names[0].replace(/^\//, ''),
                image: c.Image,
                status: c.State,
                state: c.Status
            }));
            res.json({ success: true, data: containers });
        } else {
            res.status(500).json({ success: false, error: 'Docker API 错误' });
        }
    } catch (e) {
        res.json({ success: false, error: '无法连接 Docker，请确保已挂载 docker.sock', data: [] });
    }
});

// 容器操作
app.post('/api/docker/containers/:id/:action', async (req, res) => {
    const { id, action } = req.params;

    try {
        let path;
        switch (action) {
            case 'start':
                path = `/containers/${id}/start`;
                break;
            case 'stop':
                path = `/containers/${id}/stop`;
                break;
            case 'restart':
                path = `/containers/${id}/restart`;
                break;
            case 'remove':
                path = `/containers/${id}?force=true`;
                await dockerRequest(path, 'DELETE');
                return res.json({ success: true });
            default:
                return res.status(400).json({ success: false, error: '无效操作' });
        }

        await dockerRequest(path, 'POST');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 前端路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`🚀 书签导航服务已启动: http://localhost:${PORT}`);
});
