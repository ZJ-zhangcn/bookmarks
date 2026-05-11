const test = require('node:test');
const assert = require('node:assert/strict');

const { buildWebdavStatusPanel } = require('../frontend/modules/webdav-helpers.cjs');

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
