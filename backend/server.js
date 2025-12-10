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
const path = require('path');
const os = require('os');
const fs = require('fs');
const cheerio = require('cheerio');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

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
            if (match) memInfo[match[1]] = parseInt(match[2]) * 1024;
        });

        const total = memInfo.MemTotal || 0;
        const free = memInfo.MemFree || 0;
        const buffers = memInfo.Buffers || 0;
        const cached = memInfo.Cached || 0;
        const available = memInfo.MemAvailable || (free + buffers + cached);
        const used = total - available;

        return { total, used, free: available, usagePercent: Math.round((used / total) * 100 * 100) / 100 };
    } catch (e) {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return { total, used, free, usagePercent: Math.round((used / total) * 100 * 100) / 100 };
    }
}

app.get('/api/system/stats', async (req, res) => {
    try {
        const cpuUsage = getCpuUsageFromProc();
        const cpuCores = os.cpus().length;
        const memory = getMemoryFromProc();

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
                cpu: { usage: cpuUsage, cores: cpuCores },
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
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at');
        res.json({ success: true, data: categories });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/categories', async (req, res) => {
    const { id, name, icon } = req.body;
    const categoryId = id || `cat_${Date.now()}`;
    const isNewCategory = !id;

    try {
        let sortOrder = 0;
        if (isNewCategory) {
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories');
            sortOrder = (maxOrder?.max_order ?? -1) + 1;
        } else {
            const existing = await db.queryOne('SELECT sort_order FROM categories WHERE id = ?', [categoryId]);
            sortOrder = existing?.sort_order ?? 0;
        }

        if (db.USE_MYSQL) {
            await db.execute(
                'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                [categoryId, name, icon || '📁', sortOrder]
            );
        } else {
            await db.execute(
                'INSERT OR REPLACE INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
                [categoryId, name, icon || '📁', sortOrder]
            );
        }
        res.json({ success: true, data: { id: categoryId, name, icon: icon || '📁' } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM bookmarks WHERE category_id = ?', [req.params.id]);
        await db.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/categories/sort', async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
        return res.status(400).json({ success: false, error: '无效的排序数据' });
    }

    try {
        await db.transaction(async (conn) => {
            for (const item of order) {
                await conn.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 书签 API
// ========================================
app.get('/api/bookmarks', async (req, res) => {
    try {
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

        const bookmarks = await db.queryAll(sql);
        res.json({ success: true, data: bookmarks });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/bookmarks/:id/icon', async (req, res) => {
    try {
        const bookmark = await db.queryOne('SELECT icon_data, icon_type FROM bookmarks WHERE id = ?', [req.params.id]);
        if (bookmark) {
            res.json({ success: true, data: bookmark });
        } else {
            res.status(404).json({ success: false, error: '书签不存在' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/bookmarks/icons', async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({ success: true, data: {} });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const bookmarks = await db.queryAll(`SELECT id, icon_data, icon_type FROM bookmarks WHERE id IN (${placeholders})`, ids);
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

app.get('/api/bookmarks/grouped', async (req, res) => {
    try {
        const categories = await db.queryAll('SELECT * FROM categories ORDER BY sort_order, created_at');
        const bookmarks = await db.queryAll('SELECT * FROM bookmarks ORDER BY sort_order, created_at');

        const grouped = categories.map(cat => ({
            ...cat,
            items: bookmarks.filter(b => b.category_id === cat.id)
        }));

        res.json({ success: true, data: grouped });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/bookmarks', async (req, res) => {
    const { id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type } = req.body;
    const bookmarkId = id || `bm_${Date.now()}`;
    const isNewBookmark = !id;

    try {
        // 检查分类是否存在
        let finalCategoryId = category_id;
        const existingCat = await db.queryOne('SELECT id FROM categories WHERE id = ?', [category_id]);
        if (!existingCat) {
            const newCatId = `cat_${Date.now()}`;
            const maxCatOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM categories');
            const catSortOrder = (maxCatOrder?.max_order ?? -1) + 1;
            await db.execute(
                'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)',
                [newCatId, category_id, '📁', catSortOrder]
            );
            finalCategoryId = newCatId;
        }

        let sortOrder = 0;
        if (isNewBookmark) {
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max_order FROM bookmarks WHERE category_id = ?', [finalCategoryId]);
            sortOrder = (maxOrder?.max_order ?? -1) + 1;
        } else {
            const existing = await db.queryOne('SELECT sort_order FROM bookmarks WHERE id = ?', [bookmarkId]);
            sortOrder = existing?.sort_order ?? 0;
        }

        if (db.USE_MYSQL) {
            await db.execute(
                `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url),
                 description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type),
                 icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type),
                 sort_order = VALUES(sort_order)`,
                [bookmarkId, finalCategoryId, name, url || '', description || '', icon || '🌐', icon_type || 'auto', icon_data || '', item_type || 'bookmark', component_type || null, sortOrder]
            );
        } else {
            await db.execute(
                `INSERT OR REPLACE INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [bookmarkId, finalCategoryId, name, url || '', description || '', icon || '🌐', icon_type || 'auto', icon_data || '', item_type || 'bookmark', component_type || null, sortOrder]
            );
        }

        res.json({ success: true, data: { id: bookmarkId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/bookmarks/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM bookmarks WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/bookmarks/sort', async (req, res) => {
    const { order } = req.body;
    if (!Array.isArray(order)) {
        return res.status(400).json({ success: false, error: '无效的排序数据' });
    }

    try {
        await db.transaction(async (conn) => {
            for (const item of order) {
                await conn.execute('UPDATE bookmarks SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 搜索引擎 API
// ========================================
app.get('/api/engines', async (req, res) => {
    try {
        const engines = await db.queryAll('SELECT * FROM search_engines ORDER BY sort_order ASC, created_at ASC');
        res.json({ success: true, data: engines });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/engines', async (req, res) => {
    const { id, name, icon, url, sort_order } = req.body;
    const engineId = id || `eng_${Date.now()}`;

    try {
        let order = sort_order;
        if (order === undefined || order === null) {
            const maxOrder = await db.queryOne('SELECT MAX(sort_order) as max FROM search_engines');
            order = (maxOrder?.max ?? 0) + 1;
        }

        if (db.USE_MYSQL) {
            await db.execute(
                'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
                [engineId, name, icon || '🔍', url, order]
            );
        } else {
            await db.execute(
                'INSERT OR REPLACE INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)',
                [engineId, name, icon || '🔍', url, order]
            );
        }
        res.json({ success: true, data: { id: engineId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/engines/sort', async (req, res) => {
    const { orders } = req.body;
    try {
        await db.transaction(async (conn) => {
            for (const item of orders) {
                await conn.execute('UPDATE search_engines SET sort_order = ? WHERE id = ?', [item.sort_order, item.id]);
            }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/engines/:id', async (req, res) => {
    try {
        await db.execute('DELETE FROM search_engines WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 图标库 API
// ========================================
app.get('/api/icons/library', async (req, res) => {
    try {
        const icons = [];

        const uploadedIcons = await db.queryAll(`
            SELECT id, name, data, type, created_at
            FROM icon_library
            ORDER BY created_at DESC
        `);

        uploadedIcons.forEach(icon => {
            icons.push({
                id: icon.id,
                data: icon.data,
                type: icon.type,
                source: icon.name || '手动上传',
                uploaded: true
            });
        });

        const bookmarkIcons = await db.queryAll(`
            SELECT DISTINCT icon_data, icon_type, name
            FROM bookmarks
            WHERE icon_type IN ('base64', 'url') AND icon_data IS NOT NULL AND icon_data != ''
        `);

        const engineIcons = await db.queryAll(`
            SELECT DISTINCT icon, name
            FROM search_engines
            WHERE icon IS NOT NULL AND icon != '' AND (icon LIKE 'http%' OR icon LIKE 'data:%')
        `);

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

app.post('/api/icons/library', async (req, res) => {
    const { name, data, type } = req.body;

    if (!data) {
        return res.status(400).json({ success: false, error: '缺少图标数据' });
    }

    try {
        const iconId = `icon_${Date.now()}`;
        await db.execute(
            'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
            [iconId, name || '', data, type || 'base64']
        );
        res.json({ success: true, data: { id: iconId } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/icons/library/from-url', async (req, res) => {
    const { name, url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: '缺少图标 URL' });
    }

    try {
        const response = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const iconId = `icon_${Date.now()}`;
        await db.execute(
            'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
            [iconId, name || '', url, 'url']
        );
        res.json({ success: true, data: { id: iconId, data: url } });
    } catch (e) {
        res.status(500).json({ success: false, error: '无法访问该 URL: ' + e.message });
    }
});

app.delete('/api/icons/library/:id', async (req, res) => {
    try {
        const result = await db.execute('DELETE FROM icon_library WHERE id = ?', [req.params.id]);
        if (result.changes > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: '图标不存在' });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/icons/library/batch-delete', async (req, res) => {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: '无效的图标 ID 列表' });
    }

    try {
        const placeholders = ids.map(() => '?').join(',');
        const result = await db.execute(`DELETE FROM icon_library WHERE id IN (${placeholders})`, ids);
        res.json({ success: true, deleted: result.changes });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/icons/clear-from-bookmarks', async (req, res) => {
    const { iconData } = req.body;

    if (!iconData) {
        return res.status(400).json({ success: false, error: '缺少图标数据' });
    }

    try {
        const result = await db.execute(
            `UPDATE bookmarks SET icon_type = 'emoji', icon_data = '' WHERE icon_data = ?`,
            [iconData]
        );
        await db.execute(`UPDATE search_engines SET icon = '🔍' WHERE icon = ?`, [iconData]);
        res.json({ success: true, cleared: result.changes });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/icons/batch-clear-from-bookmarks', async (req, res) => {
    const { iconDataList } = req.body;

    if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
        return res.status(400).json({ success: false, error: '缺少图标数据列表' });
    }

    try {
        let totalCleared = 0;
        for (const iconData of iconDataList) {
            const result = await db.execute(
                `UPDATE bookmarks SET icon_type = 'emoji', icon_data = '' WHERE icon_data = ?`,
                [iconData]
            );
            totalCleared += result.changes;
            await db.execute(`UPDATE search_engines SET icon = '🔍' WHERE icon = ?`, [iconData]);
        }
        res.json({ success: true, cleared: totalCleared });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// Favicon 代理 API
// ========================================
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

        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        const icons = [];
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

        const defaultFavicon = `${baseUrl}/favicon.ico`;
        if (!icons.includes(defaultFavicon)) {
            icons.push(defaultFavicon);
        }

        if (!isPrivate) {
            icons.push(`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`);
        }

        res.json({ success: true, icons });
    } catch (e) {
        try {
            const parsedUrl = new URL(url);
            if (isPrivateOrLocalAddress(parsedUrl.hostname)) {
                res.json({ success: true, icons: [`${parsedUrl.protocol}//${parsedUrl.host}/favicon.ico`] });
            } else {
                res.json({ success: true, icons: [`https://www.google.com/s2/favicons?domain=${parsedUrl.host}&sz=64`] });
            }
        } catch {
            res.status(500).json({ success: false, error: e.message });
        }
    }
});

app.post('/api/icon/convert', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: '缺少 URL' });
    }

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
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

app.post('/api/icon/fix-all', async (req, res) => {
    try {
        const bookmarks = await db.queryAll(`
            SELECT id, icon_data FROM bookmarks
            WHERE icon_type = 'url' AND icon_data IS NOT NULL AND icon_data != ''
        `);

        let fixed = 0;
        let failed = 0;

        for (const bm of bookmarks) {
            try {
                const response = await fetch(bm.icon_data, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                if (response.ok) {
                    const buffer = await response.arrayBuffer();
                    const contentType = response.headers.get('content-type') || 'image/png';
                    const base64 = Buffer.from(buffer).toString('base64');
                    const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                    await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                    fixed++;
                } else {
                    await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['emoji', '', bm.id]);
                    failed++;
                }
            } catch {
                await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['emoji', '', bm.id]);
                failed++;
            }
        }

        res.json({ success: true, message: `修复完成：${fixed} 个成功，${failed} 个使用默认图标`, fixed, failed, total: bookmarks.length });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/icon/fetch-all', async (req, res) => {
    try {
        const bookmarks = await db.queryAll(`
            SELECT id, url FROM bookmarks
            WHERE url IS NOT NULL AND url != ''
            AND (icon_data IS NULL OR icon_data = '' OR icon_type = 'auto')
        `);

        let success = 0;
        let failed = 0;

        for (const bm of bookmarks) {
            try {
                const parsedUrl = new URL(bm.url);
                const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

                let iconUrl = null;
                try {
                    const pageRes = await fetch(bm.url, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                    });
                    if (pageRes.ok) {
                        const html = await pageRes.text();
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

                if (!iconUrl) {
                    iconUrl = baseUrl + '/favicon.ico';
                }

                const iconRes = await fetch(iconUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
                });

                if (iconRes.ok) {
                    const buffer = await iconRes.arrayBuffer();
                    if (buffer.byteLength > 0) {
                        const contentType = iconRes.headers.get('content-type') || 'image/x-icon';
                        const base64 = Buffer.from(buffer).toString('base64');
                        const dataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
                        await db.execute('UPDATE bookmarks SET icon_type = ?, icon_data = ? WHERE id = ?', ['base64', dataUrl, bm.id]);
                        success++;
                        continue;
                    }
                }
                failed++;
            } catch {
                failed++;
            }
        }

        res.json({ success: true, message: `获取完成：${success} 个成功，${failed} 个失败`, fetched: success, failed, total: bookmarks.length });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// 配置导入导出
// ========================================
app.get('/api/export', async (req, res) => {
    try {
        const includeIcons = req.query.includeIcons !== 'false';

        const categories = await db.queryAll('SELECT * FROM categories');
        let bookmarks = await db.queryAll('SELECT * FROM bookmarks');
        let engines = await db.queryAll('SELECT * FROM search_engines');

        let personalization = null;
        const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
        if (row) {
            personalization = JSON.parse(row.value);
        }

        if (!includeIcons) {
            bookmarks = bookmarks.map(b => ({
                ...b,
                icon_data: b.icon_type === 'emoji' ? b.icon_data : ''
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
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/import', async (req, res) => {
    const { categories, bookmarks, engines, personalization } = req.body;

    try {
        await db.transaction(async (conn) => {
            if (categories) {
                for (let i = 0; i < categories.length; i++) {
                    const c = categories[i];
                    if (db.USE_MYSQL) {
                        await conn.execute(
                            'INSERT INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), sort_order = VALUES(sort_order)',
                            [c.id, c.name, c.icon, c.sort_order ?? i]
                        );
                    } else {
                        await conn.execute('INSERT OR REPLACE INTO categories (id, name, icon, sort_order) VALUES (?, ?, ?, ?)', [c.id, c.name, c.icon, c.sort_order ?? i]);
                    }
                }
            }
            if (bookmarks) {
                for (let i = 0; i < bookmarks.length; i++) {
                    const b = bookmarks[i];
                    if (db.USE_MYSQL) {
                        await conn.execute(
                            `INSERT INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE category_id = VALUES(category_id), name = VALUES(name), url = VALUES(url),
                             description = VALUES(description), icon = VALUES(icon), icon_type = VALUES(icon_type),
                             icon_data = VALUES(icon_data), item_type = VALUES(item_type), component_type = VALUES(component_type), sort_order = VALUES(sort_order)`,
                            [b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '🌐', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i]
                        );
                    } else {
                        await conn.execute('INSERT OR REPLACE INTO bookmarks (id, category_id, name, url, description, icon, icon_type, icon_data, item_type, component_type, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [b.id, b.category_id, b.name, b.url, b.description || '', b.icon || '🌐', b.icon_type || 'auto', b.icon_data || '', b.item_type || 'bookmark', b.component_type || null, b.sort_order ?? i]);
                    }
                }
            }
            if (engines) {
                for (let i = 0; i < engines.length; i++) {
                    const e = engines[i];
                    if (db.USE_MYSQL) {
                        await conn.execute(
                            'INSERT INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon), url = VALUES(url), sort_order = VALUES(sort_order)',
                            [e.id, e.name, e.icon, e.url, e.sort_order ?? i]
                        );
                    } else {
                        await conn.execute('INSERT OR REPLACE INTO search_engines (id, name, icon, url, sort_order) VALUES (?, ?, ?, ?, ?)', [e.id, e.name, e.icon, e.url, e.sort_order ?? i]);
                    }
                }
            }
            if (personalization) {
                if (db.USE_MYSQL) {
                    await conn.execute('INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['personalization', JSON.stringify(personalization)]);
                } else {
                    await conn.execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['personalization', JSON.stringify(personalization)]);
                }
            }
        });

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

        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dirPath) {
            const dirUrl = url.endsWith('/') ? url + dirPath : url + '/' + dirPath;
            await fetch(dirUrl, {
                method: 'MKCOL',
                headers: { 'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64') }
            }).catch(() => { });
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
            headers: { 'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64') }
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
// 个性化配置 API
// ========================================
app.get('/api/config/personalization', async (req, res) => {
    try {
        const row = await db.queryOne('SELECT value FROM config WHERE `key` = ?', ['personalization']);
        if (row) {
            res.json({ success: true, data: JSON.parse(row.value) });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/config/personalization', async (req, res) => {
    try {
        const value = JSON.stringify(req.body);
        if (db.USE_MYSQL) {
            await db.execute('INSERT INTO config (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', ['personalization', value]);
        } else {
            await db.execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', ['personalization', value]);
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ========================================
// Docker 容器管理 API
// ========================================
const http = require('http');

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

// 前端路由
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
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
