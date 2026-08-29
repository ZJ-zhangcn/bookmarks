const { test, expect } = require('@playwright/test');

async function addBookmark(page, name, url) {
    await page.locator('.header-action-btn.add-btn').first().click();
    await page.locator('#bookmarkInputName').fill(name);
    await page.locator('#bookmarkInputUrl').fill(url);
    await page.locator('#saveBookmarkBtn').click();
    await expect(page.locator('.bookmark-name', { hasText: name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.loading-overlay')).toBeHidden();
});

test('serves hashed assets immutably while keeping entry files revalidatable', async ({ page }) => {
    const htmlResponse = await page.request.get('/index.html');
    expect(htmlResponse.ok()).toBeTruthy();
    expect(htmlResponse.headers()['cache-control']).toBe('no-cache');

    const html = await htmlResponse.text();
    const hashedAsset = html.match(/(?:src|href)="(\/assets\/[^"?]+-[A-Za-z0-9_-]{8,}\.(?:js|css))"/)?.[1];
    expect(hashedAsset).toBeTruthy();

    const assetResponse = await page.request.get(hashedAsset);
    expect(assetResponse.ok()).toBeTruthy();
    expect(assetResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

    const workerResponse = await page.request.get('/service-worker.js');
    expect(workerResponse.ok()).toBeTruthy();
    expect(workerResponse.headers()['cache-control']).toContain('no-store');
});

test('creates, searches, edits and deletes a bookmark', async ({ page }) => {
    let bootstrapRequests = 0;
    page.on('request', request => {
        if (new URL(request.url()).pathname === '/api/bootstrap-v2') bootstrapRequests += 1;
    });
    const name = `E2E 书签 ${Date.now()}`;
    const updatedName = `${name} 已更新`;
    await addBookmark(page, name, 'https://example.com/e2e');

    await page.locator('#searchInput').fill(name);
    await expect(page.locator('.bookmark-card', { hasText: name })).toHaveCount(1);
    await page.locator('#searchClear').click();

    const card = page.locator('.bookmark-card', { hasText: name });
    await card.locator('.bookmark-action-btn.edit').click();
    await page.locator('#bookmarkInputName').fill(updatedName);
    await page.locator('#saveBookmarkBtn').click();
    await expect(page.locator('.bookmark-name', { hasText: updatedName })).toBeVisible();

    await page.locator('.bookmark-card', { hasText: updatedName }).locator('.bookmark-action-btn.delete').click();
    await page.locator('#confirmAccept').click();
    await expect(page.locator('.bookmark-card', { hasText: updatedName })).toHaveCount(0);
    expect(bootstrapRequests).toBe(0);
});

test('records a visit while keeping the warm bootstrap cache', async ({ page }) => {
    const first = await page.request.get('/api/bootstrap-v2');
    expect(first.ok()).toBeTruthy();
    const payload = await first.json();
    const bookmark = payload.data.bookmarks[0];

    const visit = await page.request.post(`/api/bookmarks/${encodeURIComponent(bookmark.id)}/visit`);
    expect(visit.ok()).toBeTruthy();

    const second = await page.request.get('/api/bootstrap-v2');
    expect(second.headers()['x-cache']).toBe('HIT');
    const refreshed = await second.json();
    const updated = refreshed.data.bookmarks.find(item => item.id === bookmark.id);
    expect(updated.visit_count).toBe((Number(bookmark.visit_count) || 0) + 1);
    expect(updated.last_visited_at).toBeTruthy();
});

test('reorders bookmarks and persists the new order', async ({ page }) => {
    const section = page.locator('.category-section').first();
    const cards = section.locator('.bookmark-card');
    const initialIds = await cards.evaluateAll(nodes => nodes.slice(0, 2).map(node => node.dataset.id));
    expect(initialIds).toHaveLength(2);

    await section.locator('.sort-btn').click();
    await page.evaluate(({ sectionIndex, secondId, firstId }) => {
        const sections = document.querySelectorAll('.category-section');
        const grid = sections[sectionIndex].querySelector('.bookmarks-grid');
        const second = grid.querySelector(`.bookmark-card[data-id="${secondId}"]`);
        const first = grid.querySelector(`.bookmark-card[data-id="${firstId}"]`);
        grid.insertBefore(second, first);
    }, { sectionIndex: 0, secondId: initialIds[1], firstId: initialIds[0] });
    await expect(section.locator('.bookmark-card').first()).toHaveAttribute('data-id', initialIds[1]);
    await section.locator('.save-sort-btn').click();
    await expect(section.locator('.save-sort-btn')).toHaveCount(0);
    await expect.poll(() => section.locator('.bookmark-card').evaluateAll(nodes => nodes.slice(0, 2).map(node => node.dataset.id)))
        .toEqual([initialIds[1], initialIds[0]]);
});

test('exports data and shows traceable release information', async ({ page }) => {
    await page.locator('#settingsBtn').click();
    await page.locator('.settings-tab[data-tab="sync"]').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^bookmarks.*\.json$/);

    await page.locator('.settings-tab[data-tab="about"]').click();
    await expect(page.locator('#aboutVersion')).toHaveText('版本 e2e');
    await expect(page.locator('#aboutBuildInfo')).toContainText('playwright');
    await expect(page.locator('#aboutBuildInfo')).toContainText('SQLite schema v1');
});

test('restores a validated snapshot and refreshes AI tags immediately', async ({ page }) => {
    const bookmark = page.locator('.bookmark-card').first();
    const id = await bookmark.getAttribute('data-id');
    const originalName = await bookmark.locator('.bookmark-name').textContent();
    await page.request.post('/api/ai?action=bookmark', {
        data: { bookmarkId: id, tags: 'E2E恢复标签' }
    });
    await page.reload();
    await expect(page.locator('.bookmark-card').first()).toHaveAttribute('data-id', id);

    const exportResponse = await page.request.get('/api/data?includeIcons=false');
    const backup = await exportResponse.json();
    backup.bookmarks.find(item => item.id === id).name = `${originalName} 恢复版`;
    backup.bookmark_ai.find(item => item.bookmark_id === id).tags = ['E2E恢复标签'];
    const restorePromise = page.waitForResponse(response => response.url().includes('/api/data?mode=restore') && response.request().method() === 'POST');

    await page.locator('#settingsBtn').click();
    await page.locator('.settings-tab[data-tab="sync"]').click();
    await page.locator('#importMode').selectOption('restore');
    await page.locator('#importFile').setInputFiles({
        name: 'snapshot.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backup))
    });
    await page.locator('#confirmAccept').click();
    await restorePromise;
    await expect(page.locator('.bookmark-card', { hasText: `${originalName} 恢复版` })).toBeVisible();

    await page.locator('#settingsModalClose').click();
    await page.locator('.bookmark-card', { hasText: `${originalName} 恢复版` }).locator('.bookmark-action-btn.edit').click();
    await expect(page.locator('#bookmarkInputTags')).toHaveValue('E2E恢复标签');
});

test('WebDAV download only reports success after imported data refreshes', async ({ page }) => {
    const response = await page.request.get('/api/data?includeIcons=false');
    const backup = await response.json();
    await page.route('**/api/webdav?action=download', route => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: backup })
    }));

    await page.locator('#settingsBtn').click();
    await page.locator('.settings-tab[data-tab="sync"]').click();
    await page.locator('#webdavUrl').fill('https://dav.example.com/');
    await page.locator('#webdavUser').fill('e2e');
    await page.locator('#webdavPass').fill('secret');
    await page.locator('#webdavDownloadBtn').click();
    await expect(page.locator('#webdavStatus')).toContainText('下载成功');
});

test('WebDAV upload sends a complete export payload', async ({ page }) => {
    let uploadedData;
    await page.route('**/api/webdav?action=upload', async route => {
        uploadedData = (await route.request().postDataJSON()).data;
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ success: true, data: null })
        });
    });

    await page.locator('#settingsBtn').click();
    await page.locator('.settings-tab[data-tab="sync"]').click();
    await page.locator('#webdavUrl').fill('https://dav.example.com/');
    await page.locator('#webdavUser').fill('e2e');
    await page.locator('#webdavPass').fill('secret');
    await page.locator('#webdavUploadBtn').click();
    await expect(page.locator('#webdavStatus')).toContainText('上传成功');
    expect(uploadedData.version).toBeTruthy();
    expect(uploadedData.bookmarks.length).toBeGreaterThan(0);
});

test('PWA update prompt activates a waiting worker only after user confirmation', async ({ page }) => {
    const pwaSource = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../../frontend/modules/pwa.js'), 'utf8');
    await page.route('**/e2e/pwa.js*', route => route.fulfill({
        contentType: 'text/javascript',
        body: pwaSource.replace("'./ux.js'", "'/assets/ux-e2e.js'")
    }));
    await page.route('**/assets/ux-e2e.js', route => route.fulfill({
        contentType: 'text/javascript',
        body: `export function showActionToast(message, actionText, onAction) {
            const toast = document.createElement('div');
            toast.className = 'toast-message';
            const text = document.createElement('span');
            text.textContent = message;
            const button = document.createElement('button');
            button.className = 'toast-action';
            button.textContent = actionText;
            button.addEventListener('click', () => onAction(toast));
            toast.append(text, button);
            document.body.appendChild(toast);
            return toast;
        }`
    }));
    const result = await page.evaluate(async () => {
        const messages = [];
        const worker = { postMessage(message) { messages.push(message); } };
        const before = messages.length;
        const module = await import(`/e2e/pwa.js?e2e=${Date.now()}`);
        module.promptForUpdate(worker);
        return { before, messages };
    });
    const action = page.locator('.toast-action', { hasText: '立即刷新' });
    await expect(action).toBeVisible();
    await action.click();
    const messages = await page.evaluate(() => window.__pwaE2eMessages || []);
    expect(result.before).toBe(0);
    expect(result.messages).toEqual([]);
    // 使用公开回调再次验证消息在点击后才发送。
    await page.evaluate(async () => {
        window.__pwaE2eMessages = [];
        document.querySelectorAll('.toast-message').forEach(node => node.remove());
        const module = await import(`/e2e/pwa.js?e2e-click=${Date.now()}`);
        module.promptForUpdate({ postMessage(message) { window.__pwaE2eMessages.push(message); } });
    });
    await page.locator('.toast-action', { hasText: '立即刷新' }).click();
    expect(await page.evaluate(() => window.__pwaE2eMessages)).toEqual([{ type: 'SKIP_WAITING' }]);
});
