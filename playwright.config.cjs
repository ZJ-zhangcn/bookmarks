const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:43117',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === 'true' ? 'off' : 'retain-on-failure'
    },
    projects: [{
        name: 'chromium',
        use: {
            ...devices['Desktop Chrome'],
            ...(process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === 'true' ? { channel: 'chrome' } : {})
        }
    }],
    webServer: {
        command: 'node tests/e2e/start-server.cjs',
        url: 'http://127.0.0.1:43117/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 30000
    }
});
