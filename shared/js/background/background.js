/**
 * Main background service worker
 */
import { connectWebSocket, getCurrentSources, isWebSocketConnected } from './websocket.js';
import { updateNetworkRules } from './header-manager.js';
import { alarms, runtime, storage } from '../shared/browser-api.js';

// Store a hash or timestamp of the last update to avoid redundant processing
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;

// Track last saved data hash to avoid redundant updates
let lastSavedDataHash = '';

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
    }
});

// Register for startup to reconnect if browser restarts
runtime.onStartup.addListener(() => {
    console.log('Info: Browser started up, connecting WebSocket...');
    initializeExtension();
});

// Keep track of when we're active by listening for install/update events
runtime.onInstalled.addListener(() => {
    console.log('Info: Extension installed or updated, connecting WebSocket...');
    initializeExtension();
});

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
        sendResponse({ connected: isWebSocketConnected() });
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
    }
    // Return true to indicate we'll use sendResponse asynchronously
    return true;
});

/**
 * Initialize the extension.
 */
async function initializeExtension() {
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

// Start the extension when loaded
console.log('Info: Background script started, initializing...');
initializeExtension();