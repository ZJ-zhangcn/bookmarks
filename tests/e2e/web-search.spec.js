const { test, expect } = require('@playwright/test');

function scrollingBookmarks() {
    const categories = Array.from({ length: 3 }, (_, index) => ({
        id: `search-category-${index}`, name: `搜索布局分类 ${index + 1}`, icon: '📁', sort_order: index
    }));
    return {
        success: true,
        data: {
            categories,
            bookmarks: Array.from({ length: 120 }, (_, index) => ({
                id: `search-bookmark-${index}`,
                category_id: categories[Math.floor(index / 40)].id,
                name: `布局验证书签 ${index + 1}`,
                description: '用于验证深度滚动后的搜索栏布局',
                url: `https://example.com/bookmark/${index}`,
                icon: '🌐', icon_type: 'emoji', tags: [], sort_order: index
            })),
            engines: [
                { id: 'search-google', name: 'Google', icon: '🌐', url: 'https://www.google.com/search?q=' },
                { id: 'search-bing', name: 'Bing', icon: '🌐', url: 'https://www.bing.com/search?q=' }
            ],
            todos: [], config: null
        }
    };
}

async function scrollPastSearch(page) {
    await page.evaluate(() => window.scrollTo(0, Math.round(document.documentElement.scrollHeight / 2)));
    await expect.poll(() => page.locator('#webSearchContainer').evaluate(node => {
        return Math.abs(node.getBoundingClientRect().top - parseFloat(getComputedStyle(node).top));
    })).toBeLessThan(1);
}

test.beforeEach(async ({ page }) => {
    await page.route('**/api/bootstrap-v2', route => route.fulfill({ json: scrollingBookmarks() }));
    await page.route('**/api/config', route => route.fulfill({ json: { success: true, data: null } }));
    await page.route('**/api/suggest?*', route => route.fulfill({
        json: { success: true, data: ['吸顶搜索示例', '吸顶搜索帮助'] }
    }));
    await page.goto('/');
    await expect(page.locator('.loading-overlay')).toBeHidden();
    await expect(page.locator('.bookmark-card')).toHaveCount(120);
});

for (const viewport of [
    { width: 1280, height: 900 },
    { width: 800, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 }
]) {
    test(`web search stays usable after scrolling at ${viewport.width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize(viewport);
        await scrollPastSearch(page);
        const layout = await page.evaluate(() => {
            const bar = document.getElementById('webSearchContainer');
            const rect = bar.getBoundingClientRect();
            const actions = document.getElementById('fixedButtons').getBoundingClientRect();
            const header = document.querySelector('.category-header');
            return {
                top: rect.top, bottom: rect.bottom, right: rect.right,
                actionsLeft: actions.left,
                headerOffset: parseFloat(getComputedStyle(header).top),
                hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
                scrollY: window.scrollY
            };
        });
        expect(layout.scrollY).toBeGreaterThan(500);
        expect(layout.right).toBeLessThan(layout.actionsLeft - 4);
        expect(layout.headerOffset).toBeGreaterThan(layout.bottom);
        expect(layout.hasHorizontalOverflow).toBe(false);
        await expect(page.locator('#webSearchForm')).toHaveCount(1);
        await page.locator('#webSearchInput').fill('example.com/scroll');
        await expect(page.locator('#webSearchInput')).toBeFocused();
        expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(layout.scrollY, 0);
        await page.screenshot({ path: testInfo.outputPath(`sticky-${viewport.width}.png`) });
    });
}

test('engine menu and suggestions remain clickable above category headers while sticky', async ({ page }) => {
    await scrollPastSearch(page);
    await page.locator('#engineBtn').click();
    await expect(page.locator('#engineDropdown')).toBeVisible();
    const engine = page.locator('.engine-option').filter({ hasText: 'Bing' });
    expect(await engine.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await engine.click();
    await expect(page.locator('#engineName')).toHaveText('Bing');
    await page.locator('#webSearchInput').fill('吸顶搜索');
    const suggestion = page.locator('.suggestion-item').first();
    await expect(suggestion).toBeVisible();
    expect(await suggestion.evaluate(node => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
});

test('sticky web search opens URLs and keywords in safe new tabs without filtering bookmarks', async ({ page, context }) => {
    await context.route('https://example.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>URL target</title>' }));
    await context.route('https://www.google.com/search?*', route => route.fulfill({ contentType: 'text/html', body: '<title>Search target</title>' }));
    await scrollPastSearch(page);
    const scrollY = await page.evaluate(() => window.scrollY);

    for (const [query, target] of [
        ['example.com/sticky?q=test#section', 'https://example.com/sticky?q=test#section'],
        ['测试关键词', `https://www.google.com/search?q=${encodeURIComponent('测试关键词')}`]
    ]) {
        const popupPromise = context.waitForEvent('page');
        await page.locator('#webSearchInput').fill(query);
        await page.locator('#webSearchInput').press('Enter');
        const popup = await popupPromise;
        await expect(popup).toHaveURL(target);
        expect(await popup.evaluate(() => window.opener === null)).toBe(true);
        await popup.close();
        await expect(page.locator('#webSearchInput')).toHaveValue('');
        await expect(page.locator('.bookmark-card')).toHaveCount(120);
        expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scrollY, 0);
    }
});

test('legacy bookmark search is gone and Ctrl/Cmd+F is not intercepted', async ({ page }) => {
    await expect(page.locator('#searchInput, #searchClear, #bookmarkSearchBtn, #bookmarkSearchOverlay, #bookmarkFilterShow')).toHaveCount(0);
    const prevented = await page.evaluate(() => [false, true].map(metaKey => {
        const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: !metaKey, metaKey, bubbles: true, cancelable: true });
        document.dispatchEvent(event);
        return event.defaultPrevented;
    }));
    expect(prevented).toEqual([false, false]);
    await scrollPastSearch(page);
    await page.keyboard.press('Control+k');
    await page.locator('.command-palette-input').fill('网页搜索');
    await page.locator('[data-command="focus-web-search"]').click();
    await expect(page.locator('#webSearchInput')).toBeFocused();
});

test('hiding the search component removes the whole sticky bar and its category offset', async ({ page }) => {
    await page.locator('#settingsBtn').click();
    await page.locator('.settings-tab[data-tab="personalization"]').click();
    const checkbox = page.locator('#searchBarShow');
    const toggle = page.locator('label.switch').filter({ has: checkbox });
    await toggle.click();
    await expect(checkbox).not.toBeChecked();
    await page.locator('#savePersonalization').click();
    await expect(page.locator('#webSearchContainer')).toHaveCSS('display', 'none');
    await expect.poll(() => page.locator('.category-header').first().evaluate(node => getComputedStyle(node).top)).toBe('0px');
    await toggle.click();
    await expect(checkbox).toBeChecked();
    await page.locator('#savePersonalization').click();
    await expect(page.locator('#webSearchContainer')).not.toHaveCSS('display', 'none');
    await expect.poll(() => page.locator('.category-header').first().evaluate(node => parseFloat(getComputedStyle(node).top))).toBeGreaterThan(0);
});
