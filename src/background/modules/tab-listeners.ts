/**
 * Tab Listeners - Handles all tab-related events
 */

import { tabs, windows, webNavigation, runtime } from '../../utils/browser-api.js';
import { isTrackableUrl, normalizeUrlForTracking } from './url-utils';
import { tabsWithActiveRules, checkIfUrlMatchesAnyRule } from './request-tracker';

import type { IRecordingService } from '../../types/recording';
import { logger } from '../../utils/logger';

/**
 * Set up all tab-related listeners
 */
export function setupTabListeners(updateBadgeCallback: () => void, recordingService: IRecordingService): void {
    // Listen for tab updates and activations
    tabs.onActivated?.addListener(() => {
        // Update badge when user switches tabs
        setTimeout(() => {
            updateBadgeCallback();
        }, 100);
    });

    tabs.onUpdated?.addListener((tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
        // Handle various state changes that might indicate navigation
        if (changeInfo.url || changeInfo.status === 'loading') {
            // For URL changes without full page load (History API)
            if (changeInfo.url && !changeInfo.status) {
                logger.info('TabListeners', `Detected potential SPA navigation in tab ${tabId}`);

                // Check if this is a significant navigation (different origin or path)
                if (tabsWithActiveRules.has(tabId)) {
                    const trackedUrls = tabsWithActiveRules.get(tabId)!;
                    const normalizedNewUrl = normalizeUrlForTracking(changeInfo.url);

                    // Parse URLs to check if it's a significant navigation
                    try {
                        const newUrl = new URL(normalizedNewUrl);
                        let significantChange = true;

                        // Check if any tracked URL is from the same origin and path
                        for (const trackedUrl of trackedUrls) {
                            try {
                                const oldUrl = new URL(trackedUrl);
                                // If same origin and same pathname, it's not a significant change
                                if (oldUrl.origin === newUrl.origin && oldUrl.pathname === newUrl.pathname) {
                                    significantChange = false;
                                    break;
                                }
                            } catch (e) {
                                // Invalid URL in tracking
                            }
                        }

                        if (significantChange) {
                            logger.info('TabListeners', `Significant SPA navigation detected, clearing tracked requests for tab ${tabId}`);
                            tabsWithActiveRules.delete(tabId);
                        }
                    } catch (e) {
                        // If URL parsing fails, clear to be safe
                        tabsWithActiveRules.delete(tabId);
                    }
                }
            }

            // Clear tracking when URL changes (main navigation)
            if (changeInfo.url && tabsWithActiveRules.has(tabId)) {
                const trackedUrls = tabsWithActiveRules.get(tabId)!;
                if (trackedUrls && trackedUrls.size > 0) {
                    // Check if new URL is different origin than tracked URLs
                    try {
                        const newOrigin = new URL(changeInfo.url).origin;
                        let differentOrigin = true;

                        for (const trackedUrl of trackedUrls) {
                            try {
                                const trackedOrigin = new URL(trackedUrl).origin;
                                if (newOrigin === trackedOrigin) {
                                    differentOrigin = false;
                                    break;
                                }
                            } catch (e) {
                                // Invalid URL in tracking, ignore
                            }
                        }

                        if (differentOrigin) {
                            logger.info('TabListeners', `Tab ${tabId} navigated to different origin, clearing tracked requests`);
                            tabsWithActiveRules.delete(tabId);
                        }
                    } catch (e) {
                        // Invalid URL, clear tracking to be safe
                        tabsWithActiveRules.delete(tabId);
                    }
                }
            }
        }

        // Update badge when tab URL changes or completes loading
        if ((changeInfo.url || changeInfo.status === 'complete') && tab.active) {
            setTimeout(() => {
                updateBadgeCallback();
            }, 100);
        }
    });

    // Clean up tracking when tabs are closed
    tabs.onRemoved?.addListener((tabId: number) => {
        tabsWithActiveRules.delete(tabId);
        if (recordingService) {
            recordingService.cleanupTab(tabId);
        }
        logger.info('TabListeners', `Cleaned up tracking for closed tab ${tabId}`);
    });

    // Clear tracking when tab is replaced (e.g., when navigating to a completely new site)
    tabs.onReplaced?.addListener((addedTabId: number, removedTabId: number) => {
        logger.info('TabListeners', `Tab ${removedTabId} replaced by ${addedTabId}, transferring tracking`);

        // Transfer tracking from old tab to new tab if any exists
        if (tabsWithActiveRules.has(removedTabId)) {
            const trackedUrls = tabsWithActiveRules.get(removedTabId)!;
            tabsWithActiveRules.set(addedTabId, trackedUrls);
            tabsWithActiveRules.delete(removedTabId);

            // Update badge if this is the active tab
            tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                if (tabsList[0] && tabsList[0].id === addedTabId) {
                    updateBadgeCallback();
                }
            });
        }
    });

    // Add handler for when browser starts with existing tabs
    tabs.onCreated?.addListener((tab: chrome.tabs.Tab) => {
        // When a new tab is created, check if it should be tracked
        if (tab.url && tab.id && isTrackableUrl(tab.url)) {
            checkIfUrlMatchesAnyRule(tab.url).then(matches => {
                if (matches) {
                    if (!tabsWithActiveRules.has(tab.id!)) {
                        tabsWithActiveRules.set(tab.id!, new Set());
                    }
                    tabsWithActiveRules.get(tab.id!)!.add(normalizeUrlForTracking(tab.url!));
                    logger.info('TabListeners', `New tab ${tab.id} created with URL that matches rules`);

                    if (tab.active) {
                        updateBadgeCallback();
                    }
                }
            });
        }
    });

    // Handle window focus changes
    windows?.onFocusChanged?.addListener((windowId: number) => {
        if (windowId === windows!.WINDOW_ID_NONE) return;

        // When window focus changes, update badge for the active tab in that window
        tabs.query({ active: true, windowId: windowId }, (tabsList: chrome.tabs.Tab[]) => {
            if (tabsList[0]) {
                logger.info('TabListeners', `Window focus changed, updating badge for tab ${tabsList[0].id}`);
                updateBadgeCallback();
            }
        });
    });

    // Handle extension suspend/resume
    runtime.onSuspend?.addListener(() => {
        logger.info('TabListeners', 'Extension suspending, clearing tracked requests');
        tabsWithActiveRules.clear();
    });

    // Add listener for when popup closes to ensure badge is updated
    runtime.onConnect?.addListener((port: chrome.runtime.Port) => {
        if (port.name === 'popup') {
            // Check if this is from an incognito context
            if (port.sender?.tab?.incognito || (port.sender as chrome.runtime.MessageSender & { incognito?: boolean })?.incognito) {
                logger.info('TabListeners', 'Popup opened in incognito mode');
            }

            port.onDisconnect.addListener(() => {
                // Check for errors when popup disconnects
                if (runtime.lastError) {
                    logger.info('TabListeners', 'Popup disconnect error:', (runtime.lastError as chrome.runtime.LastError).message);
                } else {
                    logger.info('TabListeners', 'Popup closed, updating badge');
                }

                setTimeout(() => {
                    updateBadgeCallback();
                }, 100);
            });
        }
    });

    // Handle navigation for recording
    if (webNavigation && recordingService) {
        logger.info('TabListeners', 'Setting up webNavigation listener');
        webNavigation.onCommitted?.addListener(async (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
            if (details.frameId !== 0) {
                logger.debug('TabListeners', 'Sub-frame navigation:', details.tabId, details.url, 'frameId:', details.frameId);
                return;
            }

            if (!isTrackableUrl(details.url)) {
                logger.debug('TabListeners', 'Internal navigation:', details.tabId, details.url);
            } else {
                logger.info('TabListeners', 'Navigation committed:', details.tabId, details.url);
            }

            await recordingService.handleNavigation(details.tabId, details.url);
        });
    } else {
        logger.error('TabListeners', 'webNavigation or recordingService not available!',
            'webNavigation:', !!webNavigation, 'recordingService:', !!recordingService);
    }

    // Handle back/forward navigation by monitoring webNavigation API if available
    if (webNavigation) {
        webNavigation.onHistoryStateUpdated?.addListener((details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
            if (details.frameId === 0) { // Main frame only
                logger.info('TabListeners', `History state updated in tab ${details.tabId}`);

                // Skip non-trackable URLs
                if (!isTrackableUrl(details.url)) {
                    return;
                }

                // Re-evaluate if this URL should be tracked
                checkIfUrlMatchesAnyRule(normalizeUrlForTracking(details.url)).then(matches => {
                    if (matches) {
                        // URL matches rules, ensure it's tracked
                        if (!tabsWithActiveRules.has(details.tabId)) {
                            tabsWithActiveRules.set(details.tabId, new Set());
                        }
                        tabsWithActiveRules.get(details.tabId)!.add(normalizeUrlForTracking(details.url));
                    }

                    // Update badge
                    tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                        if (tabsList[0] && tabsList[0].id === details.tabId) {
                            updateBadgeCallback();
                        }
                    });
                });
            }
        });

        // Handle pre-rendered pages (Chrome)
        webNavigation.onTabReplaced?.addListener((details: { replacedTabId: number; tabId: number; timeStamp: number }) => {
            logger.info('TabListeners', `Tab ${details.replacedTabId} replaced with ${details.tabId} (likely pre-render)`);

            // Transfer any tracking from the old tab to the new one
            if (tabsWithActiveRules.has(details.replacedTabId)) {
                const trackedUrls = tabsWithActiveRules.get(details.replacedTabId)!;
                tabsWithActiveRules.set(details.tabId, trackedUrls);
                tabsWithActiveRules.delete(details.replacedTabId);

                logger.info('TabListeners', `Transferred ${trackedUrls.size} tracked URLs to new tab`);

                // Update badge if needed
                tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeCallback();
                    }
                });
            }
        });
    }
}

/**
 * Set up periodic cleanup of stale tab tracking
 */
export function setupPeriodicCleanup(): void {
    // Periodic cleanup of stale tab tracking (tabs that might have been closed without proper cleanup)
    setInterval(() => {
        if (tabsWithActiveRules.size > 0) {
            tabs.query({}, (allTabs: chrome.tabs.Tab[]) => {
                const activeTabIds = new Set(allTabs.map(tab => tab.id));
                let cleaned = 0;

                for (const [tabId] of tabsWithActiveRules) {
                    if (!activeTabIds.has(tabId)) {
                        tabsWithActiveRules.delete(tabId);
                        cleaned++;
                    }
                }

                if (cleaned > 0) {
                    logger.info('TabListeners', `Cleaned up ${cleaned} stale tab tracking entries`);
                }
            });
        }
    }, 30000); // Every 30 seconds
}
