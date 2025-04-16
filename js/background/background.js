/**
 * Main background service worker
 */
import { connectWebSocket, getCurrentSources, isWebSocketConnected } from './websocket.js';
import { updateNetworkRules } from './header-manager.js';

// Set up alarms to keep the service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        // This will keep the service worker alive
        console.log('Info: Keep alive ping');

        // Update network rules periodically to ensure they stay current
        updateNetworkRules(getCurrentSources());
    }
});

// Register for startup to reconnect if Chrome restarts
chrome.runtime.onStartup.addListener(() => {
    console.log('Info: Chrome started up, connecting WebSocket...');
    initializeExtension();
});

// Keep track of when we're active by listening for install/update events
chrome.runtime.onInstalled.addListener(() => {
    console.log('Info: Extension installed or updated, connecting WebSocket...');
    initializeExtension();
});

// Listen for changes to saved data
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.savedData) {
        // Update network rules when saved data changes
        updateNetworkRules(getCurrentSources());
    }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'popupOpen') {
        console.log('Info: Popup opened, sending current sources');
        // Send current sources to popup immediately
        sendResponse({ type: 'sourcesUpdated', sources: getCurrentSources() });
    } else if (message.type === 'checkConnection') {
        // Respond with current connection status
        sendResponse({ connected: isWebSocketConnected() });
    } else if (message.type === 'configurationImported') {
        // Handle configuration import
        console.log('Info: Configuration imported, updating rules');

        // If dynamic sources were provided, update them in storage
        if (message.dynamicSources && Array.isArray(message.dynamicSources)) {
            chrome.storage.local.set({ dynamicSources: message.dynamicSources }, () => {
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

        // Send response if callback provided
        if (sendResponse) {
            sendResponse({ success: true });
        }
    }
    // Return true to indicate we'll use sendResponse asynchronously
    return true;
});

/**
 * Initialize the extension.
 */
async function initializeExtension() {
    // First try to restore any previous dynamic sources
    chrome.storage.local.get(['dynamicSources'], (result) => {
        if (result.dynamicSources && Array.isArray(result.dynamicSources) && result.dynamicSources.length > 0) {
            console.log('Info: Restored dynamic sources from storage:', result.dynamicSources.length);

            // Apply the sources immediately to network rules, even before WebSocket connects
            updateNetworkRules(result.dynamicSources);
        }
    });

    // Connect to WebSocket and update rules when we receive new data
    await connectWebSocket((sources) => {
        updateNetworkRules(sources);
    });

    // Initial update of network rules (with empty sources until we get data)
    setTimeout(() => updateNetworkRules([]), 1000);
}

// Start the extension when loaded
console.log('Info: Background script started, initializing...');
initializeExtension();