const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.resolve(__dirname, '../frontend/index.html');
const settingsPath = path.resolve(__dirname, '../frontend/modules/settings.js');
const domPath = path.resolve(__dirname, '../frontend/modules/dom.js');

test('browser import UI previews counts before applying the selected duplicate policy', () => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const settings = fs.readFileSync(settingsPath, 'utf8');
    const dom = fs.readFileSync(domPath, 'utf8');

    assert.match(html, /id="browserImportMode"/);
    assert.match(html, /value="skip">跳过重复书签/);
    assert.match(html, /value="update">更新重复书签/);
    assert.match(dom, /browserImportMode:\s*document\.getElementById\('browserImportMode'\)/);
    assert.match(settings, /browser-import\?preview=true&duplicates=\$\{duplicateMode\}/);
    assert.match(settings, /await showConfirm\([\s\S]*新增 \$\{preview\.newBookmarks\} 个[\s\S]*重复 \$\{preview\.duplicateBookmarks\} 个/);
    assert.match(settings, /duplicateSamples[\s\S]*slice\(0, 3\)/);
    assert.match(settings, /browser-import\?duplicates=\$\{duplicateMode\}/);
    assert.ok(
        settings.indexOf('browser-import?preview=true') < settings.indexOf('browser-import?duplicates=${duplicateMode}'),
        'preview request must happen before the write request'
    );
});
