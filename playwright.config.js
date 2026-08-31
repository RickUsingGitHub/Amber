const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: /.*\.spec\.js/,
    timeout: 30000,
    use: {
        baseURL: 'http://127.0.0.1:4173',
        headless: true
    },
    webServer: {
        command: 'node scripts/static-server.js',
        port: 4173,
        reuseExistingServer: true,
        timeout: 15000
    }
});
