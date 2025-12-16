/**
 * WebDAV 代理路由模块
 */
const express = require('express');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');

module.exports = function(_db) {
    // POST /api/webdav?action=upload/download
    router.post('/', asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath, data } = req.body;
        const action = req.query.action;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

        if (action === 'upload') {
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
                return res.json(success(null, '上传成功'));
            }
            const text = await response.text();
            throw new AppError(`上传失败: ${response.status} ${text}`, response.status);
        }

        if (action === 'download') {
            const response = await fetch(fullUrl, {
                method: 'GET',
                headers: { 'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64') }
            });

            if (response.ok) {
                const text = await response.text();
                try {
                    const jsonData = JSON.parse(text);
                    return res.json(success(jsonData));
                } catch {
                    throw new AppError('文件内容不是有效的 JSON 格式', 400);
                }
            } else if (response.status === 404) {
                throw new AppError('文件不存在，请先上传备份', 404);
            } else if (response.status === 401) {
                throw new AppError('认证失败，请检查用户名和密码', 401);
            }
            throw new AppError(`下载失败: ${response.status}`, response.status);
        }

        throw new AppError('无效的操作，请使用 action=upload 或 action=download', 400);
    }));

    // 旧路径兼容
    router.post('/upload', asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath, data } = req.body;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

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
            return res.json(success(null, '上传成功'));
        }
        const text = await response.text();
        throw new AppError(`上传失败: ${response.status} ${text}`, response.status);
    }));

    router.post('/download', asyncHandler(async (req, res) => {
        const { url, username, password, path: filePath } = req.body;

        if (!url || !username || !password) {
            throw new AppError('请填写完整的 WebDAV 配置', 400);
        }

        const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;
        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: { 'Authorization': 'Basic ' + Buffer.from(username + ':' + password).toString('base64') }
        });

        if (response.ok) {
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                return res.json(success(data));
            } catch {
                throw new AppError('文件内容不是有效的 JSON 格式', 400);
            }
        } else if (response.status === 404) {
            throw new AppError('文件不存在，请先上传备份', 404);
        } else if (response.status === 401) {
            throw new AppError('认证失败，请检查用户名和密码', 401);
        }
        throw new AppError(`下载失败: ${response.status}`, response.status);
    }));

    return router;
};
