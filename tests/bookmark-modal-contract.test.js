const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'frontend/index.css'), 'utf8');
const dom = fs.readFileSync(path.join(root, 'frontend/modules/dom.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'frontend/modules/events.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'frontend/modules/settings.js'), 'utf8');
const bookmark = fs.readFileSync(path.join(root, 'frontend/modules/bookmark.js'), 'utf8');

function bookmarkModalMarkup() {
    const start = html.indexOf('id="bookmarkModal"');
    const end = html.indexOf('<!-- 分类管理弹窗 -->', start);
    assert.notEqual(start, -1, 'bookmark modal must exist');
    assert.notEqual(end, -1, 'bookmark modal must end before category modal');
    return html.slice(start, end);
}

function cssRule(selector) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`));
    assert.ok(match, `Missing CSS rule: ${selector}`);
    return match[1];
}

test('bookmark modal is URL-first and keeps advanced controls inside native details', () => {
    const modal = bookmarkModalMarkup();
    const urlIndex = modal.indexOf('id="bookmarkInputUrl"');
    const detailsIndex = modal.indexOf('id="bookmarkAdvancedFields"');

    assert.ok(urlIndex >= 0, 'URL input must remain present');
    assert.ok(detailsIndex > urlIndex, 'URL is the first visible bookmark form field');
    assert.match(modal, /<details\s+id="bookmarkAdvancedFields"\s+class="bookmark-advanced-fields">/);
    assert.match(modal, /<summary>\s*更多选项（名称、分类、图标与 AI）\s*<\/summary>/);

    const details = modal.slice(detailsIndex, modal.indexOf('</details>', detailsIndex));
    for (const id of [
        'bookmarkInputName', 'bookmarkInputDesc', 'bookmarkInputTags',
        'bookmarkInputEmoji', 'bookmarkInputIconUrl', 'bookmarkInputIconFile',
        'iconPreviewAuto', 'iconPreviewUpload', 'iconLibraryGrid',
        'bookmarkInputCategory', 'categoryRecommendations', 'categoryRecChips',
        'categoryRecClose', 'aiGenerateBtn', 'aiRefineBtn', 'aiStatusHint'
    ]) {
        assert.notEqual(details.indexOf(`id="${id}"`), -1, `#${id} must be advanced`);
    }
    assert.equal((details.match(/class="icon-tab(?:\s+active)?"/g) || []).length, 5, 'all five icon tabs remain advanced');

    const detailsClose = modal.indexOf('</details>', detailsIndex);
    assert.ok(modal.indexOf('id="saveBookmarkBtn"') > detailsClose, 'Save remains usable while advanced fields are collapsed');
    assert.ok(modal.indexOf('id="cancelBookmarkBtn"') > detailsClose, 'Cancel remains usable while advanced fields are collapsed');
    assert.equal((modal.match(/id="saveBookmarkBtn"/g) || []).length, 1, 'only one Save button exists');
    assert.match(modal, /id="saveBookmarkBtn"[^>]*>保存书签<\/button>/);
});

test('bookmark modal follows the named dialog and quick-capture lifecycle contract', () => {
    const modal = bookmarkModalMarkup();
    assert.match(modal, /id="bookmarkModal"[^>]*aria-hidden="true"/);
    assert.match(modal, /class="modal"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="bookmarkModalTitle"/);
    assert.match(dom, /bookmarkAdvancedFields:\s*document\.getElementById\('bookmarkAdvancedFields'\)/);
    assert.match(bookmark, /bookmarkModal\.dataset\.mode\s*=\s*bookmarkId\s*\?\s*'edit'\s*:\s*'quick'/);
    assert.match(bookmark, /bookmarkModal\.setAttribute\('aria-hidden',\s*'false'\)/);
    assert.match(bookmark, /bookmarkInputUrl\?\.focus\?\.\(\)/);
    assert.match(bookmark, /export\s+function\s+handleBookmarkModalFocusTrap\b/);
    assert.match(settings, /import\s*\{\s*closeBookmarkModal\s*\}\s*from\s*'\.\/bookmark\.js';/);
    assert.match(settings, /closeAllModals\s*\(\)\s*\{[\s\S]*?closeBookmarkModal\(\);/);
});

test('bookmark-only visibility timing supports synchronous URL focus and polished close', () => {
    const closedRule = cssRule('#bookmarkModal');
    const openRule = cssRule('#bookmarkModal.open');
    assert.match(
        closedRule,
        /z-index:\s*1150;/,
        'quick capture must rise above ordinary dialogs while the confirm overlay remains foreground'
    );
    assert.match(
        closedRule,
        /visibility:\s*hidden;[\s\S]*?pointer-events:\s*none;[\s\S]*?transition:\s*opacity\s+var\(--transition-normal\),\s*visibility\s+0s\s+linear\s+var\(--transition-normal\);/,
        'closed bookmark overlay must fade without intercepting its next opener'
    );
    assert.match(
        openRule,
        /visibility:\s*visible;[\s\S]*?pointer-events:\s*auto;[\s\S]*?transition-delay:\s*0s;/,
        'opening bookmark overlay must be immediately visible and interactive'
    );
    assert.match(css, /\.bookmark-advanced-fields\s+summary/);
    assert.match(css, /@media\s*\(max-width:\s*768px\)[\s\S]*?\.bookmark-advanced-fields\s+summary/);
    assert.match(css, /\.icon-tabs\s*\{[\s\S]*?overflow-x:\s*auto/);
    assert.match(
        css,
        /#bookmarkModal\s+:is\([\s\S]*?\.form-group input,[\s\S]*?\.modal-close[\s\S]*?\)\s*\{[\s\S]*?transition-property:\s*color,\s*background-color,\s*border-color,\s*box-shadow,\s*transform,\s*opacity;/,
        'quick-capture controls must not inherit their generic all-transition for visibility'
    );
});

test('toast messages do not intercept fixed navigation controls', () => {
    const toastRule = cssRule('.toast-message');
    assert.match(
        toastRule,
        /pointer-events:\s*none;/,
        'noninteractive save feedback must not block fixed navigation controls beneath it'
    );
});

test('URL enrichment is controlled by input and blur while close cancels queued work', () => {
    assert.match(events, /import\s*\{[^}]*handleBookmarkUrlInput[^}]*flushBookmarkUrlEnrichment[^}]*\}\s*from\s*'\.\/favicon\.js';/s);
    assert.match(events, /bookmarkInputUrl\.addEventListener\('input',\s*handleBookmarkUrlInput\)/);
    assert.match(events, /bookmarkInputUrl\.addEventListener\('blur',\s*flushBookmarkUrlEnrichment\)/);
    assert.match(events, /document\.addEventListener\('keydown',\s*handleBookmarkModalFocusTrap\)/);
    assert.match(bookmark, /cancelBookmarkUrlEnrichment\(\)/);
});
