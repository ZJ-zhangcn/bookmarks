/**
 * WebDAV API
 * POST /api/webdav?action=upload - 上传备份
 * POST /api/webdav?action=download - 下载备份
 */

const { requireAdmin, setCors } = require('./_lib/auth');
const webdavService = require('../shared/services/webdav');

module.exports = async function handler(req, res) {
    setCors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    if (!requireAdmin(req, res)) return;

    const { url, username, password, path: filePath, data } = req.body;
    const action = req.query.action;

    if (!url || !username || !password) {
        return res.status(400).json({ success: false, error: '请填写完整的 WebDAV 配置' });
    }

    try {
        if (action === 'upload') {
            const result = await webdavService.upload({ url, username, password, path: filePath, data });
            return res.json({ success: true, message: result.message });
        }

        if (action === 'download') {
            const downloadedData = await webdavService.download({ url, username, password, path: filePath });
            return res.json({ success: true, data: downloadedData });
        }

        return res.status(400).json({ success: false, error: '无效的操作，请使用 action=upload 或 action=download' });
    } catch (e) {
        const statusCode = e.statusCode || 500;
        res.status(statusCode).json({ success: false, error: e.message });
    }
};
