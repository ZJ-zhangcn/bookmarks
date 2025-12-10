/**
 * 删除图标 API - DELETE /api/icons/library/[id]
 */

const { execute } = require('../../_lib/db');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { id } = req.query;

    try {
        if (req.method === 'DELETE') {
            const result = await execute('DELETE FROM icon_library WHERE id = ?', [id]);
            if (result.affectedRows > 0) {
                return res.json({ success: true });
            } else {
                return res.status(404).json({ success: false, error: '图标不存在' });
            }
        }

        res.status(405).json({ success: false, error: 'Method not allowed' });
    } catch (e) {
        console.error('Icon delete error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
};
