/**
 * Docker 容器管理路由模块
 */
const express = require('express');
const http = require('http');
const router = express.Router();
const { success, asyncHandler, AppError } = require('../utils');

const DOCKER_SOCKET = process.platform === 'win32'
    ? '//./pipe/docker_engine'
    : '/var/run/docker.sock';

function dockerRequest(path, method = 'GET', body = null) {
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

module.exports = function(_db) {
    // GET /api/docker/containers
    router.get('/containers', asyncHandler(async (req, res) => {
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
                res.json(success(containers));
            } else {
                throw new AppError('Docker API 错误', 500);
            }
        } catch (e) {
            res.json(success([], '无法连接 Docker，请确保已挂载 docker.sock'));
        }
    }));

    // POST /api/docker/containers/:id/:action
    router.post('/containers/:id/:action', asyncHandler(async (req, res) => {
        const { id, action } = req.params;

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
                return res.json(success());
            default:
                throw new AppError('无效操作', 400);
        }

        await dockerRequest(path, 'POST');
        res.json(success());
    }));

    return router;
};
