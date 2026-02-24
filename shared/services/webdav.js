/**
 * WebDAV 代理服务
 * 纯代理逻辑，无数据库操作
 */

function buildAuthHeader(username, password) {
    return 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
}

async function upload({ url, username, password, path: filePath, data }) {
    const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

    // 确保目录存在
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dirPath) {
        const dirUrl = url.endsWith('/') ? url + dirPath : url + '/' + dirPath;
        await fetch(dirUrl, {
            method: 'MKCOL',
            headers: { 'Authorization': buildAuthHeader(username, password) }
        }).catch(() => { });
    }

    const response = await fetch(fullUrl, {
        method: 'PUT',
        headers: {
            'Authorization': buildAuthHeader(username, password),
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data, null, 2)
    });

    if (response.ok || response.status === 201 || response.status === 204) {
        return { message: '上传成功' };
    }

    const text = await response.text();
    const err = new Error(`上传失败: ${response.status} ${text}`);
    err.statusCode = response.status;
    throw err;
}

async function download({ url, username, password, path: filePath }) {
    const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

    const response = await fetch(fullUrl, {
        method: 'GET',
        headers: { 'Authorization': buildAuthHeader(username, password) }
    });

    if (response.ok) {
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            const err = new Error('文件内容不是有效的 JSON 格式');
            err.statusCode = 400;
            throw err;
        }
    }

    if (response.status === 404) {
        const err = new Error('文件不存在，请先上传备份');
        err.statusCode = 404;
        throw err;
    }

    if (response.status === 401) {
        const err = new Error('认证失败，请检查用户名和密码');
        err.statusCode = 401;
        throw err;
    }

    const err = new Error(`下载失败: ${response.status}`);
    err.statusCode = response.status;
    throw err;
}

module.exports = { upload, download };
