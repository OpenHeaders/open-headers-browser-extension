/**
 * Main background service worker
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
let welcomePageBeingOpened = false;

// Track last badge state to avoid unnecessary updates
let lastBadgeState = null;

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
 * Updates the extension badge based on connection status
 * @param {boolean} connected - Whether the WebSocket is connected
 */
function updateExtensionBadge(connected) {
    // Get the appropriate API (chrome.action for MV3, chrome.browserAction for MV2/Firefox)
    const actionAPI = typeof browser !== 'undefined' && browser.browserAction
        ? browser.browserAction
        : (chrome?.action || chrome?.browserAction);

    if (!actionAPI) {
        console.log('Badge API not available');
        return;
    }

    if (!connected) {
        // Show a red dot/exclamation when disconnected
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

        // Optional: Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Disconnected\nDynamic header rules may not work'
            });
        }
    } else {
        // Clear the badge when connected
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
 * Initialize the extension.
 */
async function initializeExtension() {
    // Set initial badge state to disconnected
    updateExtensionBadge(false);
    lastBadgeState = false;

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

        // Check if sources have actually changed
        const newSourcesHash = generateSourcesHash(sources);
        if (newSourcesHash === lastSourcesHash) {
            console.log('Info: Received identical sources from WebSocket, skipping rule update');
            return;
        }

        // Update rules with the new sources
        updateNetworkRules(sources);

        // Update tracking variables
        lastSourcesHash = newSourcesHash;
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
        // Check connection state and update badge if changed
        const isConnected = isWebSocketConnected();

        if (isConnected !== lastBadgeState) {
            console.log('Info: Badge state changed from', lastBadgeState, 'to', isConnected);
            updateExtensionBadge(isConnected);
            lastBadgeState = isConnected;
        }
    }
});

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

        // Use the debounced function to avoid multiple rapid updates
        debouncedUpdateRulesFromSavedData(newSavedData);

        // Don't update hash immediately - let the debounced function do it
    }
});

// Listen for messages from popup
runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'popupOpen') {
        console.log('Info: Popup opened, sending current sources');
        // Send current sources to popup immediately
        sendResponse({ type: 'sourcesUpdated', sources: getCurrentSources() });
    } else if (message.type === 'checkConnection') {
        // Respond with current connection status
        const connected = isWebSocketConnected();

        // Update badge if state changed
        if (connected !== lastBadgeState) {
            updateExtensionBadge(connected);
            lastBadgeState = connected;
        }

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

        // Update network rules with the current sources
        updateNetworkRules(getCurrentSources());

        // Update tracking variables
        lastSourcesHash = generateSourcesHash(getCurrentSources());
        lastRulesUpdateTime = Date.now();

        // Send response if callback provided
        if (sendResponse) {
            sendResponse({ success: true });
        }
    } else if (message.type === 'configurationImported') {
        // Handle configuration import
        console.log('Info: Configuration imported, updating rules');

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