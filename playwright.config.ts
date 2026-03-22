import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    outputDir: './tests/e2e/test-results',
    timeout: 60000,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                browserName: 'chromium',
            },
        },
    ],
});
