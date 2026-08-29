/**
 * WebDAV 代理服务
 * 纯代理逻辑，无数据库操作
 */

function buildAuthHeader(username, password) {
    return 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
}

function createOperationalError(message, statusCode) {
    const err = new Error(message);
    err.statusCode = statusCode;
    err.isOperational = true;
    return err;
}

const DEFAULT_TIMEOUT_MS = 15000;

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetchImpl(url, { ...(options || {}), signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function readUpstreamError(response) {
    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    const text = await response.text();
    if (!contentType.includes('text/html')) return text;
    const title = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    return title ? title.replace(/\s+/g, ' ').trim() : '';
}

async function upload({ url, username, password, path: filePath, data }, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

    // 确保目录存在
    const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
    if (dirPath) {
        const dirUrl = url.endsWith('/') ? url + dirPath : url + '/' + dirPath;
        await fetchWithTimeout(fetchImpl, dirUrl, {
            method: 'MKCOL',
            headers: { 'Authorization': buildAuthHeader(username, password) }
        }, timeoutMs).catch(() => { });
    }

    let response;
    try {
        response = await fetchWithTimeout(fetchImpl, fullUrl, {
            method: 'PUT',
            headers: {
                'Authorization': buildAuthHeader(username, password),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data, null, 2)
        }, timeoutMs);
    } catch (e) {
        throw createOperationalError(`WebDAV 上传请求失败: ${e.message}`, 502);
    }

    if (response.ok || response.status === 201 || response.status === 204) {
        return { message: '上传成功' };
    }

    const text = await readUpstreamError(response);
    throw createOperationalError(`上传失败: ${response.status}${text ? ` ${text}` : ''}`, response.status || 502);
}

async function download({ url, username, password, path: filePath }, options = {}) {
    const fetchImpl = options.fetchImpl || fetch;
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const fullUrl = url.endsWith('/') ? url + filePath : url + '/' + filePath;

    let response;
    try {
        response = await fetchWithTimeout(fetchImpl, fullUrl, {
            method: 'GET',
            headers: { 'Authorization': buildAuthHeader(username, password) }
        }, timeoutMs);
    } catch (e) {
        throw createOperationalError(`WebDAV 下载请求失败: ${e.message}`, 502);
    }

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

module.exports = { upload, download, fetchWithTimeout };
