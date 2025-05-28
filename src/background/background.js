/**
 * Main background service worker with placeholder header tracking
 */

import { connectWebSocket, getCurrentSources, isWebSocketConnected } from './websocket.js';
import { updateNetworkRules } from './header-manager.js';
import { alarms, runtime, storage, tabs, isFirefox, isChrome, isEdge, isSafari } from '../utils/browser-api.js';

// Store a hash or timestamp of the last update to avoid redundant processing
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;

// Track last saved data hash to avoid redundant updates
let lastSavedDataHash = '';

// Track if we're currently opening a welcome page to prevent duplicates
let welcomePageOpenedBySocket = false;
let welcomePageBeingOpened = false;

// Track last badge state to avoid unnecessary updates
let lastBadgeState = null;

// Track headers using placeholders
let headersUsingPlaceholders = [];

// Track which tabs are making requests to domains with rules
let tabsWithActiveRules = new Map(); // Map of tabId -> Set of matched domains

// Function to generate a simple hash of sources to detect changes
function generateSourcesHash(sources) {
    if (!sources || !Array.isArray(sources)) return '';

    // Create a simplified representation of the sources to compare
    const simplifiedSources = sources.map(source => {
        return {
            id: source.sourceId || source.locationId,
            content: source.sourceContent || source.locationContent
        };
    });

    return JSON.stringify(simplifiedSources);
}

// Function to generate a hash of saved data to detect meaningful changes
function generateSavedDataHash(savedData) {
    if (!savedData) return '';

    // Create a simplified representation of the saved data to compare
    const simplifiedData = Object.entries(savedData).map(([id, entry]) => {
        return {
            id,
            name: entry.headerName,
            value: entry.headerValue,
            isDynamic: entry.isDynamic,
            sourceId: entry.sourceId,
            sourceMissing: entry.sourceMissing
        };
    });

    return JSON.stringify(simplifiedData);
}

/**
 * Re-evaluate tracked requests when rules change
 */
async function revalidateTrackedRequests() {
    console.log('Info: Revalidating tracked requests after rule change');

    // Get current saved data to check which rules are still enabled
    return new Promise((resolve) => {
        storage.sync.get(['savedData'], async (result) => {
            const savedData = result.savedData || {};
            const enabledRules = Object.entries(savedData).filter(([_, entry]) => entry.isEnabled !== false);

            // If no enabled rules, clear all tracking
            if (enabledRules.length === 0) {
                tabsWithActiveRules.clear();
                console.log('Info: No enabled rules, cleared all request tracking');
                resolve();
                return;
            }

            // For each tracked tab, re-evaluate if its requests still match any enabled rules
            for (const [tabId, trackedUrls] of tabsWithActiveRules.entries()) {
                const validUrls = new Set();

                // Check each tracked URL against current enabled rules
                for (const url of trackedUrls) {
                    let stillMatches = false;

                    for (const [id, entry] of enabledRules) {
                        const domains = entry.domains || [];
                        for (const domain of domains) {
                            if (doesUrlMatchPattern(url, domain)) {
                                stillMatches = true;
                                break;
                            }
                        }
                        if (stillMatches) break;
                    }

                    if (stillMatches) {
                        validUrls.add(url);
                    }
                }

                // Update or remove the tab's tracking based on results
                if (validUrls.size > 0) {
                    tabsWithActiveRules.set(tabId, validUrls);
                    console.log(`Info: Tab ${tabId} still has ${validUrls.size} valid tracked requests`);
                } else {
                    tabsWithActiveRules.delete(tabId);
                    console.log(`Info: Tab ${tabId} no longer has valid tracked requests`);
                }
            }

            resolve();
        });
    });
}

/**
 * Set up request monitoring to track which domains tabs are making requests to
 */
function setupRequestMonitoring() {
    // Check if webRequest API is available
    const webRequestAPI = chrome.webRequest || browser.webRequest;

    if (!webRequestAPI) {
        console.log('Info: webRequest API not available');
        return;
    }

    console.log('Info: Setting up request monitoring for badge updates');

    // Monitor all outgoing requests
    webRequestAPI.onBeforeRequest.addListener(
        async (details) => {
            // Skip non-tab requests
            if (details.tabId === -1) return;

            // Check if this request URL matches any of our rules
            const matchesRule = await checkIfUrlMatchesAnyRule(details.url);

            if (matchesRule) {
                // Track this tab as having active rules
                if (!tabsWithActiveRules.has(details.tabId)) {
                    tabsWithActiveRules.set(details.tabId, new Set());
                }
                tabsWithActiveRules.get(details.tabId).add(details.url);

                console.log(`Info: Tab ${details.tabId} made request to ${details.url} which has active rules`);

                // Update badge if this is the active tab
                tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeForCurrentTab();
                    }
                });
            }
        },
        { urls: ["<all_urls>"] }
    );

    // Clear tracking when tab navigates (main frame only)
    if (webRequestAPI.onBeforeNavigate) {
        webRequestAPI.onBeforeNavigate.addListener((details) => {
            if (details.frameId === 0) { // Main frame
                tabsWithActiveRules.delete(details.tabId);
                console.log(`Info: Cleared tracking for tab ${details.tabId} due to navigation`);

                // Update badge if this is the active tab
                tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeForCurrentTab();
                    }
                });
            }
        }, { urls: ["<all_urls>"] });
    }
}

/**
 * Check if a URL matches any active rule
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Whether the URL matches any active rule
 */
async function checkIfUrlMatchesAnyRule(url) {
    return new Promise((resolve) => {
        storage.sync.get(['savedData'], (result) => {
            const savedData = result.savedData || {};

            // Check if this URL matches any enabled rule
            for (const id in savedData) {
                const entry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) continue;

                // Check each domain pattern
                const domains = entry.domains || [];
                for (const domain of domains) {
                    if (doesUrlMatchPattern(url, domain)) {
                        resolve(true);
                        return;
                    }
                }
            }

            resolve(false);
        });
    });
}

/**
 * Check if any rules apply to the current tab
 * @param {string} tabUrl - The URL of the current tab
 * @returns {Promise<boolean>} - Whether any active rules apply
 */
async function checkRulesForTab(tabUrl) {
    if (!tabUrl) return false;

    // First check for direct URL match (when you're ON a domain with rules)
    const directMatch = await new Promise((resolve) => {
        storage.sync.get(['savedData'], (result) => {
            const savedData = result.savedData || {};

            // Debug logging
            const enabledRules = Object.entries(savedData).filter(([_, entry]) => entry.isEnabled !== false);
            console.log(`Info: Checking ${enabledRules.length} enabled rules for URL: ${tabUrl}`);

            // Check if any enabled rules match the current tab URL
            for (const id in savedData) {
                const entry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) {
                    continue;
                }

                // Check if any domain pattern matches the current tab
                const domains = entry.domains || [];
                for (const domain of domains) {
                    if (doesUrlMatchPattern(tabUrl, domain)) {
                        console.log(`Info: Direct rule match! Header: ${entry.headerName}, Type: ${entry.isResponse ? 'Response' : 'Request'}, Domain: ${domain}`);
                        resolve(true);
                        return;
                    }
                }
            }

            resolve(false);
        });
    });

    if (directMatch) return true;

    // Now check if the current tab has made any requests to domains with rules
    const currentTab = await new Promise((resolve) => {
        tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
        });
    });

    if (currentTab && currentTab.id && tabsWithActiveRules.has(currentTab.id)) {
        const matchedDomains = tabsWithActiveRules.get(currentTab.id);
        if (matchedDomains && matchedDomains.size > 0) {
            console.log(`Info: Current tab has made requests to ${matchedDomains.size} domains with rules`);
            return true;
        }
    }

    console.log('Info: No rules matched for current tab');
    return false;
}

/**
 * Check if a URL matches a domain pattern
 * @param {string} url - The URL to check
 * @param {string} pattern - The domain pattern (can include wildcards)
 * @returns {boolean} - Whether the URL matches the pattern
 */
function doesUrlMatchPattern(url, pattern) {
    try {
        // Normalize the pattern
        let urlFilter = pattern.trim();

        // Convert pattern to a regex
        // Handle different pattern formats
        if (urlFilter === '*') {
            return true; // Matches everything
        }

        // If pattern doesn't have protocol, add wildcard
        if (!urlFilter.includes('://')) {
            // Handle localhost specially
            if (urlFilter.startsWith('localhost') || urlFilter.match(/^(\d{1,3}\.){3}\d{1,3}/)) {
                urlFilter = '*://' + urlFilter;
            } else {
                urlFilter = '*://' + urlFilter;
            }
        }

        // Ensure pattern has a path
        if (!urlFilter.includes('/', urlFilter.indexOf('://') + 3)) {
            urlFilter = urlFilter + '/*';
        }

        // Convert to regex pattern
        let regexPattern = urlFilter
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
            .replace(/\*/g, '.*'); // Replace * with .*

        // Create regex
        const regex = new RegExp('^' + regexPattern + '$', 'i'); // Case insensitive

        // Test the URL
        const matches = regex.test(url);

        // Debug log for troubleshooting
        if (matches) {
            console.log(`Info: URL "${url}" matches pattern "${pattern}"`);
        }

        return matches;
    } catch (e) {
        console.log('Error matching URL pattern:', e);
        return false;
    }
}

/**
 * Updates the extension badge based on connection status, active rules, and placeholder usage
 * @param {boolean} connected - Whether the WebSocket is connected
 * @param {string} currentTabUrl - The URL of the current active tab
 * @param {boolean} hasPlaceholders - Whether any headers are using placeholders
 */
async function updateExtensionBadge(connected, currentTabUrl, hasPlaceholders) {
    // Get the appropriate API (chrome.action for MV3, chrome.browserAction for MV2/Firefox)
    const actionAPI = typeof browser !== 'undefined' && browser.browserAction
        ? browser.browserAction
        : (chrome?.action || chrome?.browserAction);

    if (!actionAPI) {
        console.log('Badge API not available');
        return;
    }

    // Determine badge state
    let badgeState = 'none';

    // Priority: placeholders > disconnected > active > none
    if (hasPlaceholders) {
        badgeState = 'placeholders';
    } else if (!connected) {
        badgeState = 'disconnected';
    } else if (currentTabUrl) {
        // Check if any rules apply to current tab (including requests it makes)
        const hasActiveRules = await checkRulesForTab(currentTabUrl);
        if (hasActiveRules) {
            badgeState = 'active';
        }
    }

    // Only update if state changed
    if (badgeState === lastBadgeState) {
        return;
    }

    lastBadgeState = badgeState;

    if (badgeState === 'placeholders') {
        // Show a red exclamation when headers are using placeholders
        actionAPI.setBadgeText({ text: '!' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge text error:', chrome.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#ff4d4f' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge color error:', chrome.runtime.lastError);
            }
        });

        // Update the tooltip with specific information
        if (actionAPI.setTitle) {
            const placeholderReasons = headersUsingPlaceholders.map(h => h.reason);
            const hasDisconnected = placeholderReasons.includes('app_disconnected');
            const hasNotFound = placeholderReasons.includes('source_not_found');
            const hasEmpty = placeholderReasons.includes('empty_source');

            let messages = [];
            if (hasDisconnected) messages.push('App disconnected');
            if (hasNotFound) messages.push('Sources missing');
            if (hasEmpty) messages.push('Sources empty');

            actionAPI.setTitle({
                title: `Open Headers - Warning\n${headersUsingPlaceholders.length} headers using placeholder values\n${messages.join(', ')}`
            });
        }
    } else if (badgeState === 'disconnected') {
        // Show a yellow dot/exclamation when disconnected
        actionAPI.setBadgeText({ text: '!' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge text error:', chrome.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#ffcd04' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge color error:', chrome.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Disconnected\nDynamic header rules may not work'
            });
        }
    } else if (badgeState === 'active') {
        // Show a green checkmark when rules are active for current site
        actionAPI.setBadgeText({ text: '✓' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge text error:', chrome.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#52c41a' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge color error:', chrome.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Active\nHeader rules are active for this site'
            });
        }
    } else {
        // Clear the badge when connected but no active rules
        actionAPI.setBadgeText({ text: '' });

        // Reset the tooltip to default
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers'
            });
        }
    }
}

/**
 * Update badge for the current active tab
 */
async function updateBadgeForCurrentTab() {
    const isConnected = isWebSocketConnected();
    const hasPlaceholders = headersUsingPlaceholders.length > 0;

    // Get current active tab
    tabs.query({ active: true, currentWindow: true }, async (tabList) => {
        const currentTab = tabList[0];
        const currentUrl = currentTab?.url || '';

        await updateExtensionBadge(isConnected, currentUrl, hasPlaceholders);
    });
}

/**
 * Initialize the extension.
 */
async function initializeExtension() {
    // Set initial badge state to disconnected
    await updateExtensionBadge(false, null, false);

    // Set up request monitoring
    setupRequestMonitoring();

    // First try to restore any previous dynamic sources
    storage.local.get(['dynamicSources'], (result) => {
        if (result.dynamicSources && Array.isArray(result.dynamicSources) && result.dynamicSources.length > 0) {
            console.log('Info: Restored dynamic sources from storage:', result.dynamicSources.length);

            // Store the hash of the restored sources
            lastSourcesHash = generateSourcesHash(result.dynamicSources);
            lastRulesUpdateTime = Date.now();

            // Apply the sources immediately to network rules, even before WebSocket connects
            updateNetworkRules(result.dynamicSources);
        }
    });

    // Get the initial savedData hash to prevent unnecessary updates
    storage.sync.get(['savedData'], (result) => {
        if (result.savedData) {
            lastSavedDataHash = generateSavedDataHash(result.savedData);
            console.log('Info: Initialized saved data hash');
        }
    });

    // Connect to WebSocket and update rules when we receive new data
    await connectWebSocket((sources) => {
        console.log('Info: WebSocket provided fresh sources, updating rules immediately');

        // Always update rules when we get sources from a fresh connection
        updateNetworkRules(sources);

        // Update tracking variables
        lastSourcesHash = generateSourcesHash(sources);
        lastRulesUpdateTime = Date.now();
    });

    // Initial update of network rules (with empty sources until we get data)
    setTimeout(() => {
        const sources = getCurrentSources();
        if (sources.length === 0) {
            updateNetworkRules([]);
        }
    }, 1000);
}

/**
 * Opens the welcome page directly, bypassing setup checks.
 * This is only called from the "Open Setup Guide" button.
 */
function openWelcomePageDirectly() {
    console.log('Info: Directly opening welcome page (bypassing setup checks)');

    // Track that we're opening a page to prevent duplicates
    welcomePageBeingOpened = true;

    try {
        // Use appropriate API based on browser
        const api = typeof browser !== 'undefined' ? browser : chrome;

        if (api.tabs && api.tabs.create) {
            const welcomePageUrl = api.runtime.getURL('welcome.html');
            console.log('Info: Welcome page URL:', welcomePageUrl);

            // Create a new welcome page without any checks
            const createPromise = typeof api.tabs.create.then === 'function'
                ? api.tabs.create({ url: welcomePageUrl, active: true })
                : new Promise((resolve) => api.tabs.create({ url: welcomePageUrl, active: true }, resolve));

            createPromise.then(tab => {
                console.log('Info: Force-opened welcome tab:', tab.id);
                welcomePageBeingOpened = false;
            }).catch(err => {
                console.log('Info: Failed to force-open welcome page:', err ? err.message : 'unknown error');
                welcomePageBeingOpened = false;
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            welcomePageBeingOpened = false;
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', e.message);
        welcomePageBeingOpened = false;
    }
}

// Create a debounce function to avoid too many rapid updates
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Create a debounced version of updateNetworkRules for sources
const debouncedUpdateRules = debounce((sources) => {
    console.log('Info: Debounced rule update executing with', sources.length, 'sources');
    updateNetworkRules(sources);

    // Update our tracking variables
    lastSourcesHash = generateSourcesHash(sources);
    lastRulesUpdateTime = Date.now();
}, 100); // Only wait 100ms to avoid noticeable delay but still prevent multiple calls

// Create a debounced version of updateNetworkRules for saved data
const debouncedUpdateRulesFromSavedData = debounce((savedData) => {
    console.log('Info: Debounced rule update from saved data changes');
    updateNetworkRules(getCurrentSources());
    lastSavedDataHash = generateSavedDataHash(savedData);

    // Force immediate badge update
    updateBadgeForCurrentTab();
}, 100);

// Create a debounced version of badge update
const debouncedUpdateBadge = debounce(() => {
    updateBadgeForCurrentTab();
}, 100);

// Set up alarms to keep the service worker alive
alarms.create('keepAlive', { periodInMinutes: 0.5 }); // Every 30 seconds

// Create a more frequent alarm for badge updates
alarms.create('updateBadge', {
    delayInMinutes: 0.01,  // Start after 0.6 seconds
    periodInMinutes: 0.033 // Repeat every ~2 seconds
});

alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        // This will keep the service worker alive
        console.log('Info: Keep alive ping');

        // Check if sources have changed since last update
        const currentSources = getCurrentSources();
        const currentHash = generateSourcesHash(currentSources);

        // Skip update if no changes
        if (currentHash === lastSourcesHash) {
            console.log('Info: Skipping rule update - no changes detected');
            return;
        }

        // Update rules only if sources have changed
        console.log('Info: Updating rules due to source changes');
        updateNetworkRules(currentSources);
        lastSourcesHash = currentHash;
        lastRulesUpdateTime = Date.now();
    } else if (alarm.name === 'updateBadge') {
        // Update badge for current tab
        updateBadgeForCurrentTab();
    }
});

// Listen for tab updates and activations
tabs.onActivated?.addListener((activeInfo) => {
    // Update badge when user switches tabs
    setTimeout(() => {
        debouncedUpdateBadge();
    }, 100);
});

tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
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

    // Update badge when tab URL changes or completes loading
    if ((changeInfo.url || changeInfo.status === 'complete') && tab.active) {
        setTimeout(() => {
            debouncedUpdateBadge();
        }, 100);
    }
});

// Clean up tracking when tabs are closed
tabs.onRemoved?.addListener((tabId) => {
    tabsWithActiveRules.delete(tabId);
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
                updateBadgeForCurrentTab();
            }
        });
    }
});

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

/**
 * Opens the welcome page ONLY on first install
 */
function openWelcomePageOnInstall() {
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
        const api = typeof browser !== 'undefined' ? browser : chrome;

        if (api.tabs && api.tabs.query) {
            const welcomePageUrl = api.runtime.getURL('welcome.html');

            // First check if a welcome page is already open
            const queryPromise = typeof api.tabs.query.then === 'function'
                ? api.tabs.query({})  // Firefox uses promises
                : new Promise((resolve) => api.tabs.query({}, resolve)); // Chrome uses callbacks

            queryPromise.then(tabs => {
                const welcomeTabs = tabs.filter(tab =>
                    tab.url === welcomePageUrl ||
                    tab.url.startsWith(welcomePageUrl)
                );

                if (welcomeTabs.length > 0) {
                    // Welcome page is already open, just focus it
                    console.log('Info: Welcome page already exists, focusing it');

                    const updatePromise = typeof api.tabs.update.then === 'function'
                        ? api.tabs.update(welcomeTabs[0].id, {active: true})
                        : new Promise((resolve) => api.tabs.update(welcomeTabs[0].id, {active: true}, resolve));

                    updatePromise.then(() => {
                        welcomePageBeingOpened = false;
                    }).catch(err => {
                        console.log('Info: Error focusing existing welcome tab:', err ? err.message : 'unknown error');
                        welcomePageBeingOpened = false;
                    });
                } else {
                    // Create a new welcome page
                    const createPromise = typeof api.tabs.create.then === 'function'
                        ? api.tabs.create({ url: welcomePageUrl, active: true })
                        : new Promise((resolve) => api.tabs.create({ url: welcomePageUrl, active: true }, resolve));

                    createPromise.then(tab => {
                        console.log('Info: Opened welcome tab:', tab.id);
                        welcomePageBeingOpened = false;
                    }).catch(err => {
                        console.log('Info: Failed to open welcome page:', err ? err.message : 'unknown error');
                        welcomePageBeingOpened = false;
                    });
                }
            }).catch(err => {
                console.log('Info: Error checking for existing welcome tabs:', err ? err.message : 'unknown error');
                welcomePageBeingOpened = false;
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            welcomePageBeingOpened = false;
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', e.message);
        welcomePageBeingOpened = false;
    }
}

// Register for startup to reconnect if browser restarts
runtime.onStartup.addListener(() => {
    console.log('Info: Browser started up, connecting WebSocket...');
    initializeExtension();
});

// Keep track of when we're active by listening for install/update events
runtime.onInstalled.addListener((details) => {
    console.log('Info: Extension installed or updated:', details.reason);
    console.log('Info: Browser detected:', isFirefox ? 'Firefox' : 'Other');

    // Show welcome page on fresh install OR if it's Firefox and we haven't shown it yet
    if (details.reason === 'install') {
        console.log('Info: Fresh install detected, opening welcome page');
        setTimeout(() => {
            openWelcomePageOnInstall();
        }, 500);
    } else if (isFirefox && details.reason === 'update') {
        // In Firefox dev mode, sometimes it reports as 'update' instead of 'install'
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result) => {
            if (!result.setupCompleted) {
                console.log('Info: Firefox update detected but setup not completed, opening welcome page');
                storage.local.set({ hasSeenWelcome: true }, () => {
                    setTimeout(() => {
                        openWelcomePageOnInstall();
                    }, 500);
                });
            }
        });
    }

    // Always initialize the extension regardless of install/update
    initializeExtension();
});

// Start the extension when loaded
console.log('Info: Background script started, initializing...');
initializeExtension();

// For Firefox development - check if this is a first run
if (isFirefox) {
    storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result) => {
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

// Listen for changes to dynamic sources in storage
storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dynamicSources) {
        const newSources = changes.dynamicSources.newValue || [];
        const newSourcesHash = generateSourcesHash(newSources);

        // Skip if hash hasn't changed
        if (newSourcesHash === lastSourcesHash) {
            console.log('Info: Dynamic sources changed but content is identical, skipping update');
            return;
        }

        console.log('Info: Dynamic sources changed with new content, triggering rule update');

        // Use the debounced update to avoid multiple rapid updates
        debouncedUpdateRules(newSources);
    }
});

// Listen for changes to saved data with hash check and debouncing
storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.savedData) {
        const newSavedData = changes.savedData.newValue || {};
        const newSavedDataHash = generateSavedDataHash(newSavedData);

        // Skip if hash hasn't changed (prevents loop)
        if (newSavedDataHash === lastSavedDataHash) {
            console.log('Info: Saved data changed but content is identical, skipping update');
            return;
        }

        console.log('Info: Saved header data changed with new content, debouncing update');

        // Revalidate tracked requests when rules change
        revalidateTrackedRequests().then(() => {
            // Then update rules
            debouncedUpdateRulesFromSavedData(newSavedData);
        });
    }
});

// Listen for messages from popup and header-manager
runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'popupOpen') {
        console.log('Info: Popup opened, sending current sources');
        // Send current sources to popup immediately
        sendResponse({ type: 'sourcesUpdated', sources: getCurrentSources() });
    } else if (message.type === 'checkConnection') {
        // Respond with current connection status
        const connected = isWebSocketConnected();
        sendResponse({ connected: connected });
    } else if (message.type === 'getDynamicSources') {
        // Get the current sources and send them back
        const currentSources = getCurrentSources();
        sendResponse({
            sources: currentSources,
            connected: isWebSocketConnected()
        });
    } else if (message.type === 'rulesUpdated') {
        // Handle rule update request (for enable/disable toggle)
        console.log('Info: Rule update requested due to enable/disable toggle');

        // First revalidate tracked requests
        revalidateTrackedRequests().then(() => {
            // Update network rules with the current sources
            updateNetworkRules(getCurrentSources());

            // Update tracking variables
            lastSourcesHash = generateSourcesHash(getCurrentSources());
            lastRulesUpdateTime = Date.now();

            // Force immediate badge update
            updateBadgeForCurrentTab();

            // Send response if callback provided
            if (sendResponse) {
                sendResponse({ success: true });
            }
        });

        // Return true to indicate async response
        return true;
    } else if (message.type === 'headersUsingPlaceholders') {
        // Update placeholder tracking from header-manager
        headersUsingPlaceholders = message.headers || [];
        console.log('Info: Headers using placeholders:', headersUsingPlaceholders.length);

        // Update badge immediately
        updateBadgeForCurrentTab();

        if (sendResponse) {
            sendResponse({ acknowledged: true });
        }
    } else if (message.type === 'configurationImported') {
        // Handle configuration import
        console.log('Info: Configuration imported, updating rules');

        // Clear all request tracking when importing new config
        tabsWithActiveRules.clear();
        console.log('Info: Cleared all request tracking after configuration import');

        // If dynamic sources were provided, update them in storage
        if (message.dynamicSources && Array.isArray(message.dynamicSources)) {
            storage.local.set({ dynamicSources: message.dynamicSources }, () => {
                console.log('Info: Imported dynamic sources saved to storage:', message.dynamicSources.length);
            });
        }

        // Update network rules with the current sources
        // First try to get dynamic sources from the message
        let dynamicSources = message.dynamicSources || [];

        // If no sources in the message, get them from getCurrentSources()
        if (dynamicSources.length === 0) {
            dynamicSources = getCurrentSources();
        }

        // Apply the rules
        updateNetworkRules(dynamicSources);

        // Update tracking variables
        lastSourcesHash = generateSourcesHash(dynamicSources);
        lastRulesUpdateTime = Date.now();

        // Update saved data hash if available
        if (message.savedData) {
            lastSavedDataHash = generateSavedDataHash(message.savedData);
        }

        // Update badge for current tab
        updateBadgeForCurrentTab();

        // Send response if callback provided
        if (sendResponse) {
            sendResponse({ success: true });
        }
    } else if (message.type === 'sourcesUpdated') {
        // This catches messages sent from the WebSocket to ensure the background
        // script stays active and processes the updates immediately
        console.log('Info: Background received sources update notification:',
            message.sources ? message.sources.length : 0, 'sources at',
            new Date(message.timestamp).toISOString());

        // No need to update rules here as the WebSocket handler already does this
        if (sendResponse) {
            sendResponse({ acknowledged: true });
        }
    } else if (message.type === 'openWelcomePage') {
        // This message type is no longer used - we don't want to open welcome page randomly
        console.log('Info: Ignoring openWelcomePage request - welcome page should only open on install');
        if (sendResponse) {
            sendResponse({ acknowledged: true });
        }
    } else if (message.type === 'forceOpenWelcomePage') {
        // FORCE open the welcome page (from the Guide button in popup)
        console.log('Info: Force opening welcome page requested from popup');
        openWelcomePageDirectly();
        if (sendResponse) {
            sendResponse({ acknowledged: true });
        }
    } else if (message.type === 'openTab') {
        // Open a new tab with the specified URL
        tabs.create({ url: message.url }, (tab) => {
            sendResponse({ success: true, tabId: tab.id });
        });
    }

    // Return true to indicate we'll use sendResponse asynchronously
    return true;
});