const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWebdavStatusPanel, parseJsonResponse } = require('../frontend/modules/webdav-helpers.cjs');

test('buildWebdavStatusPanel renders operation, file path, icon mode and timestamp', () => {
    const html = buildWebdavStatusPanel({
        status: 'success',
        operation: '上传',
        path: 'bookmarks/config.json',
        includeIcons: false,
        message: '上传成功',
        at: '2026-05-11T12:00:00.000Z'
    });
    assert.match(html, /上传成功/);
    assert.match(html, /bookmarks\/config\.json/);
    assert.match(html, /不含图标/);
    assert.match(html, /2026/);
});

test('parseJsonResponse converts non-json upload responses into visible errors', async () => {
    const response = {
        json: async () => {
            throw new SyntaxError('The string did not match the expected pattern.');
        }
    };

    const result = await parseJsonResponse(response, '上传失败，服务器返回了非 JSON 响应');
    assert.equal(result.success, false);
    assert.match(result.error, /上传失败，服务器返回了非 JSON 响应/);
    assert.match(result.error, /The string did not match the expected pattern/);
});
