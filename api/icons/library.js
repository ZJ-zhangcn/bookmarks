/**
 * 图标库 API - GET/POST /api/icons/library
 */

const { query, execute } = require('../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        if (req.method === 'GET') {
            const icons = [];

            // 获取手动上传的图标
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

            // 获取所有书签的图标
            const bookmarkIcons = await query(`
                SELECT DISTINCT icon_data, icon_type, name
                FROM bookmarks
                WHERE icon_type IN ('base64', 'url') AND icon_data IS NOT NULL AND icon_data != ''
            `);

            // 获取所有搜索引擎的图标
            const engineIcons = await query(`
                SELECT DISTINCT icon, name
                FROM search_engines
                WHERE icon IS NOT NULL AND icon != '' AND (icon LIKE 'http%' OR icon LIKE 'data:%')
            `);

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

            return res.json({ success: true, data: icons });
        }

        if (req.method === 'POST') {
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

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Icon library API error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
