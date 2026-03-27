/**
 * E2E Tests for OpenHeaders Browser Extension (standalone — no desktop app required)
 *
 * Tests popup UI structure, disconnected state, theme, and static pages.
 * For connected-state tests (rules sync, recording, sources), see extension-connected.spec.ts.
 */

import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, '../../dist/chrome');

let context: BrowserContext;
let extensionId: string;
let page: Page;

test.beforeAll(async () => {
    context = await chromium.launchPersistentContext('', {
        headless: false,
        slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : undefined,
        args: [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            '--no-sandbox',
        ],
    });

    const serviceWorker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    extensionId = serviceWorker.url().split('/')[2];

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.waitForFunction(() => {
        const root = document.getElementById('root');
        return root && root.children.length > 0;
    }, { timeout: 15000 });
});

test.afterAll(async () => {
    await context.close();
});

// ---------------------------------------------------------------------------
// Extension Load & Service Worker
// ---------------------------------------------------------------------------
test.describe('Extension Load', () => {
    test('service worker is registered with valid extension ID', () => {
        expect(extensionId).toBeTruthy();
        expect(extensionId.length).toBeGreaterThan(10);
    });

    test('popup page has correct title', async () => {
        const title = await page.title();
        expect(title).toContain('Open Headers');
    });

    test('React app renders with children in #root', async () => {
        const root = page.locator('#root');
        await expect(root).toBeVisible();
        const children = await root.locator('> *').count();
        expect(children).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// Popup Layout Structure
// ---------------------------------------------------------------------------
test.describe('Popup Layout', () => {
    test('app container with data-theme is present', async () => {
        const appContainer = page.locator('.app-container');
        await expect(appContainer).toBeVisible({ timeout: 5000 });
        const theme = await appContainer.getAttribute('data-theme');
        expect(['light', 'dark']).toContain(theme);
    });

    test('has header, content, and footer sections', async () => {
        await expect(page.locator('.header')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.content')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.footer')).toBeVisible({ timeout: 5000 });
    });

    test('popup body is 800x600', async () => {
        const size = await page.evaluate(() => {
            const style = window.getComputedStyle(document.body);
            return { width: parseInt(style.width), height: parseInt(style.height) };
        });
        expect(size.width).toBe(800);
        expect(size.height).toBe(600);
    });
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
test.describe('Header', () => {
    test('displays "Open Headers" title', async () => {
        const header = page.locator('.header');
        const text = await header.textContent();
        expect(text).toContain('Open Headers');
    });

    test('has interactive controls (buttons or switches)', async () => {
        const header = page.locator('.header');
        const controls = await header.locator('button, .ant-switch, .ant-dropdown-trigger').count();
        expect(controls).toBeGreaterThanOrEqual(1);
    });
});

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------
test.describe('Footer', () => {
    test('displays version number in vX.Y.Z format', async () => {
        const footer = page.locator('.footer');
        const text = await footer.textContent();
        expect(text).toMatch(/v\d+\.\d+\.\d+/);
    });

    test('has recording button', async () => {
        const footer = page.locator('.footer');
        const firstButton = footer.locator('button').first();
        await expect(firstButton).toBeVisible();
    });

    test('has "View Workflows" button', async () => {
        await expect(page.getByText('View Workflows')).toBeVisible();
    });

    test('has "Options" button', async () => {
        await expect(page.getByText('Options')).toBeVisible();
    });

    test('has website link (globe icon)', async () => {
        const globeIcon = page.locator('.footer .anticon-global').first();
        await expect(globeIcon).toBeVisible();
    });
});

// ---------------------------------------------------------------------------
// Disconnected State (no desktop app)
// ---------------------------------------------------------------------------
test.describe('Disconnected State', () => {
    test('popup renders content despite no app connection', async () => {
        const content = page.locator('.content');
        await expect(content).toBeVisible();
        const text = await content.textContent();
        expect(text).toBeTruthy();
    });

    test('rules list area is present', async () => {
        const entriesList = page.locator('.entries-list');
        await expect(entriesList).toBeVisible();
    });

    test('"View Workflows" button reflects connection state', async () => {
        const btn = page.getByRole('button', { name: /View Workflows/i });
        await expect(btn).toBeVisible();
        // When the desktop app is not running, this button is disabled.
        // When connected, it's enabled. Both states are valid.
        const isDisabled = await btn.isDisabled();
        const connectionBadge = page.locator('.header .ant-badge-status-success');
        const isConnected = await connectionBadge.isVisible().catch(() => false);
        expect(isDisabled).toBe(!isConnected);
    });
});

// ---------------------------------------------------------------------------
// Options Dropdown
// ---------------------------------------------------------------------------
test.describe('Options Dropdown', () => {
    test('opens and shows recording options', async () => {
        await page.getByText('Options').click();
        await page.waitForTimeout(300);

        const dropdown = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)');
        await expect(dropdown).toBeVisible({ timeout: 3000 });

        // Should have multiple menu items
        const items = await dropdown.locator('.ant-dropdown-menu-item').count();
        expect(items).toBeGreaterThanOrEqual(3);

        // Verify key options are present
        await expect(dropdown.getByText('Show Widget')).toBeVisible();
        await expect(dropdown.getByText('Session')).toBeVisible();
        await expect(dropdown.getByText('Video')).toBeVisible();

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
    });

    test('hotkey info is displayed', async () => {
        await page.getByRole('button', { name: /Options/i }).click();
        await page.waitForTimeout(300);

        const dropdown = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)');
        await expect(dropdown.getByText('Hotkey')).toBeVisible();

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
    });
});

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
test.describe('Theme', () => {
    test('app container has styled background', async () => {
        const bgColor = await page.locator('.app-container').evaluate(
            el => window.getComputedStyle(el).backgroundColor
        );
        expect(bgColor).toBeTruthy();
        expect(bgColor).not.toBe('');
    });

    test('footer has a border-top style', async () => {
        const borderTop = await page.locator('.footer').evaluate(
            el => window.getComputedStyle(el).borderTop
        );
        expect(borderTop).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// Static Pages
// ---------------------------------------------------------------------------
test.describe('Welcome Page', () => {
    test('welcome.html loads and has content', async () => {
        const welcomePage = await context.newPage();
        await welcomePage.goto(`chrome-extension://${extensionId}/welcome.html`);
        await welcomePage.waitForLoadState('domcontentloaded');

        const body = await welcomePage.textContent('body');
        expect(body).toBeTruthy();
        expect(body!.length).toBeGreaterThan(0);

        await welcomePage.close();
    });
});

// ---------------------------------------------------------------------------
// Manifest & Extension Assets
// ---------------------------------------------------------------------------
test.describe('Extension Assets', () => {
    test('manifest.json is accessible and valid', async () => {
        const manifestPage = await context.newPage();
        await manifestPage.goto(`chrome-extension://${extensionId}/manifest.json`);

        const text = await manifestPage.textContent('body');
        expect(text).toBeTruthy();

        const manifest = JSON.parse(text!);
        expect(manifest.name).toBe('Open Headers');
        expect(manifest.manifest_version).toBe(3);
        expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);

        await manifestPage.close();
    });
});
