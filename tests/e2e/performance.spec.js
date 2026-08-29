const { test, expect } = require('@playwright/test');

function largeBootstrapPayload(bookmarkCount = 5000, categoryCount = 10) {
    const categories = Array.from({ length: categoryCount }, (_, index) => ({
        id: `perf-cat-${index}`,
        name: `性能分类 ${index}`,
        icon: '📁',
        sort_order: index
    }));
    const bookmarks = Array.from({ length: bookmarkCount }, (_, index) => ({
        id: `perf-bm-${index}`,
        category_id: categories[index % categoryCount].id,
        name: index === bookmarkCount - 1 ? '唯一性能命中项' : `性能书签 ${index}`,
        url: `https://example.com/${index}`,
        description: `用于大数据量渲染基线的书签 ${index}`,
        icon: '🌐',
        icon_type: 'emoji',
        icon_data: '',
        sort_order: index,
        tags: index === bookmarkCount - 1 ? ['唯一性能标签'] : []
    }));
    return {
        success: true,
        data: {
            categories,
            bookmarks,
            engines: [{ id: 'perf-engine', name: 'Google', icon: '🌐', url: 'https://google.com/search?q=' }],
            todos: [],
            config: null
        }
    };
}

test('5000-bookmark startup, JSON parse, virtual render and search baseline', async ({ page }) => {
    const payload = largeBootstrapPayload();
    const serialized = JSON.stringify(payload);
    const parseMs = await page.evaluate(value => {
        const start = performance.now();
        JSON.parse(value);
        return performance.now() - start;
    }, serialized);
    await page.route('**/api/bootstrap-v2', route => route.fulfill({
        contentType: 'application/json',
        body: serialized
    }));

    const startup = Date.now();
    await page.goto('/');
    await expect(page.locator('.loading-overlay')).toBeHidden();
    const startupMs = Date.now() - startup;
    const renderedCards = await page.locator('.bookmark-card').count();

    const searchStart = Date.now();
    await page.locator('#searchInput').fill('唯一性能命中项');
    await expect(page.locator('.bookmark-card', { hasText: '唯一性能命中项' })).toHaveCount(1);
    const searchMs = Date.now() - searchStart;

    console.log(JSON.stringify({
        bookmarks: 5000,
        payloadBytes: Buffer.byteLength(serialized),
        parseMs: Math.round(parseMs * 100) / 100,
        startupMs,
        searchMs,
        renderedCards
    }));
    expect(Buffer.byteLength(serialized)).toBeLessThan(4 * 1024 * 1024);
    expect(parseMs).toBeLessThan(250);
    expect(startupMs).toBeLessThan(5000);
    expect(searchMs).toBeLessThan(2000);
    expect(renderedCards).toBeLessThan(500);
});
