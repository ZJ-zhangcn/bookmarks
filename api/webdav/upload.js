/**
 * WebDAV 上传 API - POST /api/webdav/upload
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

    const { url, username, password, path: filePath, data } = req.body;

    if (!url || !username || !password) {
        return res.status(400).json({ success: false, error: '请填写完整的 WebDAV 配置' });
    }

    try {
        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

        // 确保目录存在
        const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (dirPath) {
            const dirUrl = url.endsWith('/') ? url + dirPath : url + '/' + dirPath;
            await fetch(dirUrl, {
                method: 'MKCOL',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64')
                }
            }).catch(() => {});
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
};
