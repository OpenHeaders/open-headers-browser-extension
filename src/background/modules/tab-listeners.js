/**
 * Tab Listeners - Handles all tab-related events
 */

import { tabs, windows, webNavigation, runtime } from '../../utils/browser-api.js';
import { isTrackableUrl, normalizeUrlForTracking } from './url-utils.js';
import { tabsWithActiveRules, checkIfUrlMatchesAnyRule } from './request-tracker.js';

/**
 * Set up all tab-related listeners
 */
export function setupTabListeners(updateBadgeCallback, recordingService) {
    // Listen for tab updates and activations
    tabs.onActivated?.addListener(() => {
        // Update badge when user switches tabs
        setTimeout(() => {
            updateBadgeCallback();
        }, 100);
    });

    tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
        // Handle various state changes that might indicate navigation
        if (changeInfo.url || changeInfo.status === 'loading') {
            // For URL changes without full page load (History API)
            if (changeInfo.url && !changeInfo.status) {
                console.log(`Info: Detected potential SPA navigation in tab ${tabId}`);

                // Check if this is a significant navigation (different origin or path)
                if (tabsWithActiveRules.has(tabId)) {
                    const trackedUrls = tabsWithActiveRules.get(tabId);
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
                            console.log(`Info: Significant SPA navigation detected, clearing tracked requests for tab ${tabId}`);
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
                const trackedUrls = tabsWithActiveRules.get(tabId);
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
                            console.log(`Info: Tab ${tabId} navigated to different origin, clearing tracked requests`);
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
    tabs.onRemoved?.addListener((tabId) => {
        tabsWithActiveRules.delete(tabId);
        if (recordingService) {
            recordingService.cleanupTab(tabId);
        }
        console.log(`Info: Cleaned up tracking for closed tab ${tabId}`);
    });

    // Clear tracking when tab is replaced (e.g., when navigating to a completely new site)
    tabs.onReplaced?.addListener((addedTabId, removedTabId) => {
        console.log(`Info: Tab ${removedTabId} replaced by ${addedTabId}, transferring tracking`);

        // Transfer tracking from old tab to new tab if any exists
        if (tabsWithActiveRules.has(removedTabId)) {
            const trackedUrls = tabsWithActiveRules.get(removedTabId);
            tabsWithActiveRules.set(addedTabId, trackedUrls);
            tabsWithActiveRules.delete(removedTabId);

            // Update badge if this is the active tab
            tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                if (tabsList[0] && tabsList[0].id === addedTabId) {
                    updateBadgeCallback();
                }
            });
        }
    });

    // Add handler for when browser starts with existing tabs
    tabs.onCreated?.addListener((tab) => {
        // When a new tab is created, check if it should be tracked
        if (tab.url && tab.id && isTrackableUrl(tab.url)) {
            checkIfUrlMatchesAnyRule(tab.url).then(matches => {
                if (matches) {
                    if (!tabsWithActiveRules.has(tab.id)) {
                        tabsWithActiveRules.set(tab.id, new Set());
                    }
                    tabsWithActiveRules.get(tab.id).add(normalizeUrlForTracking(tab.url));
                    console.log(`Info: New tab ${tab.id} created with URL that matches rules`);

                    if (tab.active) {
                        updateBadgeCallback();
                    }
                }
            });
        }
    });

    // Handle window focus changes
    windows?.onFocusChanged?.addListener((windowId) => {
        if (windowId === windows.WINDOW_ID_NONE) return;

        // When window focus changes, update badge for the active tab in that window
        tabs.query({ active: true, windowId: windowId }, (tabsList) => {
            if (tabsList[0]) {
                console.log(`Info: Window focus changed, updating badge for tab ${tabsList[0].id}`);
                updateBadgeCallback();
            }
        });
    });

    // Handle extension suspend/resume
    runtime.onSuspend?.addListener(() => {
        console.log('Info: Extension suspending, clearing tracked requests');
        tabsWithActiveRules.clear();
    });

    // Add listener for when popup closes to ensure badge is updated
    runtime.onConnect?.addListener((port) => {
        if (port.name === 'popup') {
            // Check if this is from an incognito context
            if (port.sender?.tab?.incognito || port.sender?.incognito) {
                console.log('Info: Popup opened in incognito mode');
                // You might want to handle incognito differently
            }

            port.onDisconnect.addListener(() => {
                // Check for errors when popup disconnects
                if (runtime.lastError) {
                    console.log('Info: Popup disconnect error:', runtime.lastError.message);
                } else {
                    console.log('Info: Popup closed, updating badge');
                }

                setTimeout(() => {
                    updateBadgeCallback();
                }, 100);
            });
        }
    });

    // Handle navigation for recording
    if (webNavigation && recordingService) {
        console.log('[TabListeners] Setting up webNavigation listener');
        webNavigation.onCommitted?.addListener(async (details) => {
            console.log('[TabListeners] Navigation committed:', details.tabId, details.url, 'frameId:', details.frameId);
            if (details.frameId !== 0) return;
            
            await recordingService.handleNavigation(details.tabId, details.url);
        });
    } else {
        console.error('[TabListeners] webNavigation or recordingService not available!', 
            'webNavigation:', !!webNavigation, 'recordingService:', !!recordingService);
    }

    // Handle back/forward navigation by monitoring webNavigation API if available
    if (webNavigation) {
        webNavigation.onHistoryStateUpdated?.addListener((details) => {
            if (details.frameId === 0) { // Main frame only
                console.log(`Info: History state updated in tab ${details.tabId}`);

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
                        tabsWithActiveRules.get(details.tabId).add(normalizeUrlForTracking(details.url));
                    }

                    // Update badge
                    tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                        if (tabsList[0] && tabsList[0].id === details.tabId) {
                            updateBadgeCallback();
                        }
                    });
                });
            }
        });

        // Handle pre-rendered pages (Chrome)
        webNavigation.onTabReplaced?.addListener((details) => {
            console.log(`Info: Tab ${details.replacedTabId} replaced with ${details.tabId} (likely pre-render)`);

            // Transfer any tracking from the old tab to the new one
            if (tabsWithActiveRules.has(details.replacedTabId)) {
                const trackedUrls = tabsWithActiveRules.get(details.replacedTabId);
                tabsWithActiveRules.set(details.tabId, trackedUrls);
                tabsWithActiveRules.delete(details.replacedTabId);

                console.log(`Info: Transferred ${trackedUrls.size} tracked URLs to new tab`);

                // Update badge if needed
                tabs.query({ active: true, currentWindow: true }, (tabsList) => {
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
export function setupPeriodicCleanup() {
    // Periodic cleanup of stale tab tracking (tabs that might have been closed without proper cleanup)
    setInterval(() => {
        if (tabsWithActiveRules.size > 0) {
            tabs.query({}, (allTabs) => {
                const activeTabIds = new Set(allTabs.map(tab => tab.id));
                let cleaned = 0;

                for (const [tabId] of tabsWithActiveRules) {
                    if (!activeTabIds.has(tabId)) {
                        tabsWithActiveRules.delete(tabId);
                        cleaned++;
                    }
                }

                if (cleaned > 0) {
                    console.log(`Info: Cleaned up ${cleaned} stale tab tracking entries`);
                }
            });
        }
    }, 30000); // Every 30 seconds
}