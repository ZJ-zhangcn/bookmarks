/**
 * WebDAV 下载 API - POST /api/webdav/download
 */

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

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
};
