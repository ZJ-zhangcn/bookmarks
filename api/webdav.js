/**
 * WebDAV API
 * POST /api/webdav?action=upload - 上传备份
 * POST /api/webdav?action=download - 下载备份
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
    const action = req.query.action;

    if (!url || !username || !password) {
        return res.status(400).json({ success: false, error: '请填写完整的 WebDAV 配置' });
    }

    const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

    try {
        // 上传
        if (action === 'upload') {
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
                return res.json({ success: true, message: '上传成功' });
            } else {
                const text = await response.text();
                return res.status(response.status).json({ success: false, error: `上传失败: ${response.status} ${text}` });
            }
        }

        // 下载
        if (action === 'download') {
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
                    return res.json({ success: true, data });
                } catch (parseErr) {
                    return res.status(400).json({ success: false, error: '文件内容不是有效的 JSON 格式' });
                }
            } else if (response.status === 404) {
                return res.status(404).json({ success: false, error: '文件不存在，请先上传备份' });
            } else if (response.status === 401) {
                return res.status(401).json({ success: false, error: '认证失败，请检查用户名和密码' });
            } else {
                return res.status(response.status).json({ success: false, error: `下载失败: ${response.status}` });
            }
        }

        return res.status(400).json({ success: false, error: '无效的操作，请使用 action=upload 或 action=download' });
    } catch (e) {
        res.status(500).json({ success: false, error: '连接 WebDAV 服务器失败: ' + e.message });
    }
};
