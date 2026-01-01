/**
 * 图标库 API
 * GET /api/icons - 获取图标库
 * POST /api/icons - 上传图标
 * POST /api/icons?action=batch-delete - 批量删除
 * POST /api/icons?action=from-url - 从 URL 上传
 * POST /api/icons?action=clear-from-bookmarks - 清除书签图标
 * DELETE /api/icons?id=xxx - 删除图标
 */

const { query, execute } = require('./_lib/db');
const { requireAdmin, setCors, assertSafeFetchUrl } = require('./_lib/auth');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        // GET - 获取图标库（只读）
        if (req.method === 'GET') {
            const icons = [];

            const uploadedIcons = await query(`
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

            const bookmarkIcons = await query(`
                SELECT DISTINCT icon_data, icon_type, name
                FROM bookmarks
                WHERE icon_type IN ('base64', 'url') AND icon_data IS NOT NULL AND icon_data != ''
            `);

            const engineIcons = await query(`
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

            return res.json({ success: true, data: icons });
        }

        // 写入操作需要鉴权
        if (!requireAdmin(req, res)) return;

        // POST - 各种上传/操作
        if (req.method === 'POST') {
            const action = req.query.action;

            // 批量删除
            if (action === 'batch-delete') {
                const { ids } = req.body;
                if (!Array.isArray(ids) || ids.length === 0) {
                    return res.json({ success: true });
                }
                const placeholders = ids.map(() => '?').join(',');
                await execute(`DELETE FROM icon_library WHERE id IN (${placeholders})`, ids);
                return res.json({ success: true });
            }

            // 从 URL 上传
            if (action === 'from-url') {
                const { url, name } = req.body;
                if (!url) {
                    return res.status(400).json({ success: false, error: '缺少 URL' });
                }
                try {
                    assertSafeFetchUrl(url);
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        signal: AbortSignal.timeout(5000)
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const buffer = await response.arrayBuffer();
                    const contentType = response.headers.get('content-type') || 'image/png';
                    const base64 = Buffer.from(buffer).toString('base64');
                    const data = `data:${contentType.split(';')[0]};base64,${base64}`;

                    const iconId = `icon_${Date.now()}`;
                    await execute(
                        'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
                        [iconId, name || url, data, 'base64']
                    );
                    return res.json({ success: true, data: { id: iconId, data } });
                } catch (e) {
                    return res.status(500).json({ success: false, error: e.message });
                }
            }

            // 清除书签中的图标
            if (action === 'clear-from-bookmarks') {
                const { iconData } = req.body;
                if (!iconData) {
                    return res.status(400).json({ success: false, error: '缺少图标数据' });
                }
                await execute(
                    "UPDATE bookmarks SET icon_data = '', icon_type = 'auto' WHERE icon_data = ?",
                    [iconData]
                );
                return res.json({ success: true });
            }

            // 批量清除书签图标
            if (action === 'batch-clear-from-bookmarks') {
                const { iconDataList } = req.body;
                if (!Array.isArray(iconDataList) || iconDataList.length === 0) {
                    return res.json({ success: true });
                }
                for (const iconData of iconDataList) {
                    await execute(
                        "UPDATE bookmarks SET icon_data = '', icon_type = 'auto' WHERE icon_data = ?",
                        [iconData]
                    );
                }
                return res.json({ success: true });
            }

            // 普通上传
            const { name, data, type } = req.body;
            if (!data) {
                return res.status(400).json({ success: false, error: '缺少图标数据' });
            }
            const iconId = `icon_${Date.now()}`;
            await execute(
                'INSERT INTO icon_library (id, name, data, type) VALUES (?, ?, ?, ?)',
                [iconId, name || '', data, type || 'base64']
            );
            return res.json({ success: true, data: { id: iconId } });
        }

        // DELETE - 删除图标
        if (req.method === 'DELETE') {
            const { id } = req.query;
            if (!id) {
                return res.status(400).json({ success: false, error: '缺少图标 ID' });
            }
            await execute('DELETE FROM icon_library WHERE id = ?', [id]);
            return res.json({ success: true });
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Icons API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
