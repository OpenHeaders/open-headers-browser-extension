/**
 * Welcome Page Manager - Handles welcome page opening logic
 */

import { storage, isFirefox } from '../../utils/browser-api.js';
import { tabs, runtime } from '../../utils/browser-api.js';
import { logger } from '../../utils/logger';

// Track if we're currently opening a welcome page to prevent duplicates
let welcomePageBeingOpened = false;

/**
 * Opens the welcome page directly, bypassing setup checks.
 * This is only called from the "Open Setup Guide" button.
 */
export function openWelcomePageDirectly(): void {
    logger.info(' Directly opening welcome page (bypassing setup checks)');
    welcomePageBeingOpened = true;

    try {
        const welcomePageUrl: string = runtime.getURL('welcome.html');
        tabs.create({ url: welcomePageUrl, active: true }, (tab: chrome.tabs.Tab) => {
            logger.info(' Force-opened welcome tab:', tab?.id);
            welcomePageBeingOpened = false;
        });
    } catch (e) {
        logger.info(' Error opening welcome page:', (e as Error).message);
        welcomePageBeingOpened = false;
    }
}

/**
 * Opens the welcome page ONLY on first install
 */
export function openWelcomePageOnInstall(): void {
    if (welcomePageBeingOpened) {
        logger.info(' Welcome page already being opened, skipping');
        return;
    }

    welcomePageBeingOpened = true;
    logger.info(' Opening welcome page for first install');

    try {
        const welcomePageUrl: string = runtime.getURL('welcome.html');

        // Check if a welcome page is already open
        tabs.query({}, (allTabs: chrome.tabs.Tab[]) => {
            const welcomeTabs = (allTabs || []).filter((tab: chrome.tabs.Tab) =>
                tab.url === welcomePageUrl ||
                (tab.url && tab.url.startsWith(welcomePageUrl))
            );

            if (welcomeTabs.length > 0) {
                logger.info(' Welcome page already exists, focusing it');
                tabs.update(welcomeTabs[0].id!, { active: true }, () => {
                    welcomePageBeingOpened = false;
                });
            } else {
                tabs.create({ url: welcomePageUrl, active: true }, (tab: chrome.tabs.Tab) => {
                    logger.info(' Opened welcome tab:', tab?.id);
                    welcomePageBeingOpened = false;
                });
            }
        });
    } catch (e) {
        logger.info(' Error opening welcome page:', (e as Error).message);
        welcomePageBeingOpened = false;
    }
}

/**
 * Check and open welcome page for Firefox development
 */
export function checkFirefoxFirstRun(): void {
    if (isFirefox) {
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result: Record<string, unknown>) => {
            if (!result.hasSeenWelcome && !result.setupCompleted) {
                logger.info(' First run detected in Firefox, opening welcome page');
                storage.local.set({ hasSeenWelcome: true }, () => {
                    setTimeout(() => {
                        openWelcomePageOnInstall();
                    }, 1000);
                });
            }
        });
    }
}
