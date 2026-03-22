/**
 * Welcome Page Manager - Handles welcome page opening logic
 */

import { storage, isFirefox } from '../../utils/browser-api.js';
import { tabs, runtime } from '../../utils/browser-api.js';

const browserAPI = { tabs, runtime };

// Track if we're currently opening a welcome page to prevent duplicates
let welcomePageBeingOpened = false;

/**
 * Opens the welcome page directly, bypassing setup checks.
 * This is only called from the "Open Setup Guide" button.
 */
export function openWelcomePageDirectly(): void {
    console.log('Info: Directly opening welcome page (bypassing setup checks)');

    // Track that we're opening a page to prevent duplicates
    welcomePageBeingOpened = true;

    try {
        // Use appropriate API based on browser
        const api = browserAPI;

        if (api.tabs && api.tabs.create) {
            const welcomePageUrl: string = api.runtime.getURL('welcome.html');
            console.log('Info: Welcome page URL:', welcomePageUrl);

            // Create a new welcome page without any checks
            const createResult = api.tabs.create({ url: welcomePageUrl, active: true });
            const createPromise: Promise<chrome.tabs.Tab> =
                createResult && typeof (createResult as unknown as Promise<chrome.tabs.Tab>).then === 'function'
                    ? (createResult as unknown as Promise<chrome.tabs.Tab>)
                    : new Promise<chrome.tabs.Tab>((resolve) => api.tabs.create({ url: welcomePageUrl, active: true }, resolve));

            createPromise.then((tab: chrome.tabs.Tab) => {
                console.log('Info: Force-opened welcome tab:', tab.id);
                welcomePageBeingOpened = false;
            }).catch((err: Error | null) => {
                console.log('Info: Failed to force-open welcome page:', err ? err.message : 'unknown error');
                welcomePageBeingOpened = false;
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            welcomePageBeingOpened = false;
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', (e as Error).message);
        welcomePageBeingOpened = false;
    }
}

/**
 * Opens the welcome page ONLY on first install
 */
export function openWelcomePageOnInstall(): void {
    // Don't open if we're already opening a page
    if (welcomePageBeingOpened) {
        console.log('Info: Welcome page already being opened, skipping');
        return;
    }

    // Set flag immediately to prevent race conditions
    welcomePageBeingOpened = true;
    console.log('Info: Opening welcome page for first install');

    try {
        // Use appropriate API based on browser
        const api = browserAPI;

        if (api.tabs && api.tabs.query) {
            const welcomePageUrl: string = api.runtime.getURL('welcome.html');

            // First check if a welcome page is already open
            const queryResult = api.tabs.query({});
            const queryPromise: Promise<chrome.tabs.Tab[]> =
                queryResult && typeof (queryResult as unknown as Promise<chrome.tabs.Tab[]>).then === 'function'
                    ? (queryResult as unknown as Promise<chrome.tabs.Tab[]>)
                    : new Promise<chrome.tabs.Tab[]>((resolve) => api.tabs.query({}, resolve));

            queryPromise.then((allTabs: chrome.tabs.Tab[]) => {
                const welcomeTabs = allTabs.filter((tab: chrome.tabs.Tab) =>
                    tab.url === welcomePageUrl ||
                    (tab.url && tab.url.startsWith(welcomePageUrl))
                );

                if (welcomeTabs.length > 0) {
                    // Welcome page is already open, just focus it
                    console.log('Info: Welcome page already exists, focusing it');

                    const updateResult = api.tabs.update(welcomeTabs[0].id!, { active: true });
                    const updatePromise: Promise<chrome.tabs.Tab | undefined> =
                        updateResult && typeof (updateResult as unknown as Promise<chrome.tabs.Tab | undefined>).then === 'function'
                            ? (updateResult as unknown as Promise<chrome.tabs.Tab | undefined>)
                            : new Promise<chrome.tabs.Tab | undefined>((resolve) => api.tabs.update(welcomeTabs[0].id!, { active: true }, resolve));

                    updatePromise.then(() => {
                        welcomePageBeingOpened = false;
                    }).catch((err: Error | null) => {
                        console.log('Info: Error focusing existing welcome tab:', err ? err.message : 'unknown error');
                        welcomePageBeingOpened = false;
                    });
                } else {
                    // Create a new welcome page
                    const createResult = api.tabs.create({ url: welcomePageUrl, active: true });
                    const createPromise: Promise<chrome.tabs.Tab> =
                        createResult && typeof (createResult as unknown as Promise<chrome.tabs.Tab>).then === 'function'
                            ? (createResult as unknown as Promise<chrome.tabs.Tab>)
                            : new Promise<chrome.tabs.Tab>((resolve) => api.tabs.create({ url: welcomePageUrl, active: true }, resolve));

                    createPromise.then((tab: chrome.tabs.Tab) => {
                        console.log('Info: Opened welcome tab:', tab.id);
                        welcomePageBeingOpened = false;
                    }).catch((err: Error | null) => {
                        console.log('Info: Failed to open welcome page:', err ? err.message : 'unknown error');
                        welcomePageBeingOpened = false;
                    });
                }
            }).catch((err: Error | null) => {
                console.log('Info: Error checking for existing welcome tabs:', err ? err.message : 'unknown error');
                welcomePageBeingOpened = false;
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            welcomePageBeingOpened = false;
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', (e as Error).message);
        welcomePageBeingOpened = false;
    }
}

/**
 * Check and open welcome page for Firefox development
 */
export function checkFirefoxFirstRun(): void {
    if (isFirefox) {
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result: Record<string, unknown>) => {
            // If we haven't seen the welcome page and setup isn't completed
            if (!result.hasSeenWelcome && !result.setupCompleted) {
                console.log('Info: First run detected in Firefox, opening welcome page');

                // Mark that we've attempted to show the welcome page
                storage.local.set({ hasSeenWelcome: true }, () => {
                    // Open the welcome page after a short delay
                    setTimeout(() => {
                        openWelcomePageOnInstall();
                    }, 1000);
                });
            }
        });
    }
}
