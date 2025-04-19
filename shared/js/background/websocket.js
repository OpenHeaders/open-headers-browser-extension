/**
 * WebSocket connection management
 */
import { runtime, storage, isSafari, isFirefox } from '../shared/browser-api.js';
import { adaptWebSocketUrl, safariPreCheck } from './safari-websocket-adapter.js';
import { updateNetworkRules } from './header-manager.js';

// Configuration
const WS_SERVER_URL = 'ws://127.0.0.1:59210';
const RECONNECT_DELAY_MS = 5000;

// State variables
let socket = null;
let reconnectTimer = null;
let isConnecting = false;
let isConnected = false;
let allSources = [];

/**
 * Function to generate a simple hash of sources to detect changes
 * @param {Array} sources - Array of source objects
 * @returns {string} - A hash string representing the sources
 */
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

// Track last sources hash to avoid redundant updates
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;

// Function to broadcast connection status to any open popups
function broadcastConnectionStatus() {
    runtime.sendMessage({
        type: 'connectionStatus',
        connected: isConnected
    }).catch(err => {
        // This error is expected when no popup is open
        if (!err.message.includes("Could not establish connection")) {
            console.log("Info: Could not send connection status - no listeners");
        }
    });
}

/**
 * Pre-checks if the server is reachable before attempting WebSocket connection
 * @returns {Promise<boolean>} - Whether server is reachable
 */
async function preCheckServerAvailable() {
    return new Promise(resolve => {
        try {
            // Try to fetch from the server with a very short timeout
            // This will avoid the WebSocket connection error
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            // Use fetch API to check the server availability before websocket
            // We expect this to fail quickly with a CORS error which is fine
            // The important thing is that it fails with a controlled error
            // rather than a connection refused error
            fetch(`http://127.0.0.1:59210/ping`, {
                mode: 'no-cors',
                signal: controller.signal
            })
                .then(() => {
                    clearTimeout(timeoutId);
                    resolve(true);
                })
                .catch(e => {
                    clearTimeout(timeoutId);
                    // Check if the error is due to the abort (timeout)
                    if (e.name === 'AbortError') {
                        console.log("Info: Server connection pre-check timed out");
                        resolve(false);
                    } else if (e.message && e.message.includes('Failed to fetch')) {
                        console.log("Info: Server connection pre-check failed");
                        resolve(false);
                    } else {
                        // If it's a CORS error or other error, the server might be running
                        resolve(true);
                    }
                });
        } catch (e) {
            console.log("Info: Server pre-check error");
            resolve(false);
        }
    });
}

/**
 * Connects to the WebSocket server.
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
export async function connectWebSocket(onSourcesReceived) {
    // Prevent multiple connection attempts
    if (isConnecting) return;
    isConnecting = true;

    // Clear any pending reconnect timer
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    // Close any existing socket
    if (socket) {
        try {
            socket.close();
        } catch (e) {
            console.log('Info: Error closing existing socket');
        }
    }

    // For Firefox, use a different approach to avoid console errors
    if (isFirefox) {
        console.log('Info: Using Firefox-specific connection approach');

        // First check server availability with fetch to avoid WebSocket errors
        const isServerAvailable = await checkServerAvailabilityForFirefox();
        if (!isServerAvailable) {
            console.log('Info: Server not available for Firefox, skipping connection');
            handleConnectionFailure();
            return;
        }

        // Use a modified approach for Firefox
        connectWebSocketFirefox(onSourcesReceived);
        return;
    }

    // Standard approach for other browsers
    const isServerAvailable = await preCheckServerAvailable();
    if (!isServerAvailable) {
        console.log('Info: Server not available, skipping WebSocket connection');
        handleConnectionFailure();
        return;
    }

    // Connect to the server with error handling
    try {
        // Use a timeout to catch connection errors gracefully
        const connectionTimeout = setTimeout(() => {
            console.log(`Info: WebSocket connection timed out`);
            handleConnectionFailure();
        }, 3000);

        // Use the adapter for the URL
        const effectiveUrl = adaptWebSocketUrl(WS_SERVER_URL);
        console.log('Info: Connecting to WebSocket URL:', effectiveUrl);

        // Create the WebSocket with properly handled events
        socket = new WebSocket(effectiveUrl);

        socket.onopen = () => {
            clearTimeout(connectionTimeout);
            console.log('Info: WebSocket connection opened');
            isConnecting = false;
            isConnected = true;

            // Notify any open popups
            broadcastConnectionStatus();
        };

        socket.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);

                // Handle both initial state and updates
                if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                    // Check if there's a meaningful difference in the sources
                    const newSourcesHash = generateSourcesHash(parsed.sources);
                    const previousSources = [...allSources]; // Make a copy of current sources

                    // Update all sources regardless of hash to ensure we have the latest data
                    allSources = parsed.sources;
                    console.log('Info: WebSocket received sources:', allSources.length, 'at', new Date().toISOString());

                    // Compare source IDs to detect if sources were added or removed
                    const previousSourceIds = new Set(previousSources.map(s => s.sourceId || s.locationId));
                    const newSourceIds = new Set(parsed.sources.map(s => s.sourceId || s.locationId));

                    // Check for removed sources
                    const removedSourceIds = [];
                    previousSourceIds.forEach(id => {
                        if (!newSourceIds.has(id)) {
                            removedSourceIds.push(id);
                        }
                    });

                    // If sources were removed, we need to update the header rules
                    if (removedSourceIds.length > 0) {
                        console.log('Info: Detected removed sources:', removedSourceIds.join(', '));

                        // Check if any saved headers use these sources
                        storage.sync.get(['savedData'], (result) => {
                            const savedData = result.savedData || {};
                            let headersNeedUpdate = false;

                            // Create an updated copy of savedData
                            const updatedSavedData = {...savedData};

                            // Check each header entry
                            for (const id in savedData) {
                                const entry = savedData[id];

                                // If this is a dynamic header that used a removed source
                                if (entry.isDynamic && removedSourceIds.includes(entry.sourceId?.toString())) {
                                    console.log(`Info: Header "${entry.headerName}" was using removed source ${entry.sourceId}`);

                                    // Option 1: Mark the header as having a missing source
                                    updatedSavedData[id] = {
                                        ...entry,
                                        sourceMissing: true
                                    };

                                    headersNeedUpdate = true;
                                }
                            }

                            // Update storage if needed
                            if (headersNeedUpdate) {
                                console.log('Info: Updating header configuration to reflect removed sources');
                                storage.sync.set({ savedData: updatedSavedData }, () => {
                                    console.log('Info: Header configuration updated');
                                });
                            }
                        });
                    }

                    // Save to storage for the popup to access
                    storage.local.set({ dynamicSources: allSources }, () => {
                        console.log('Info: Sources saved to local storage');

                        // Only update network rules if sources actually changed
                        if (newSourcesHash !== lastSourcesHash) {
                            console.log('Info: Sources changed, updating network rules');
                            updateNetworkRules(allSources);
                            lastSourcesHash = newSourcesHash;
                            lastRulesUpdateTime = Date.now();
                        } else {
                            console.log('Info: Sources content unchanged, skipping rule update');
                        }

                        // Call the callback with the sources
                        if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                            onSourcesReceived(allSources);
                        }

                        // Notify any open popups that sources have been updated
                        runtime.sendMessage({
                            type: 'sourcesUpdated',
                            sources: allSources,
                            timestamp: Date.now(),
                            removedSourceIds: removedSourceIds.length > 0 ? removedSourceIds : undefined
                        })
                            .catch(err => {
                                // This error is expected when no popup is listening
                                if (!err.message.includes("Could not establish connection")) {
                                    console.log("Info: No popup listening for source updates");
                                }
                            });
                    });
                }
            } catch (err) {
                console.log('Info: Error parsing message from WebSocket:', err);
            }
        };

        socket.onclose = (event) => {
            clearTimeout(connectionTimeout);
            console.log('Info: WebSocket closed');
            handleConnectionFailure();
        };

        socket.onerror = (error) => {
            clearTimeout(connectionTimeout);
            console.log('Info: WebSocket connection issue detected');
            // We'll let the onclose event handle the reconnection
        };
    } catch (e) {
        console.log('Info: Error creating WebSocket connection');
        handleConnectionFailure();
    }
}

/**
 * Creates a WebSocket directly bypassing Firefox security restrictions
 * This approach uses a workaround to force the ws:// protocol
 */
function createFirefoxWebSocket() {
    console.log('Info: Creating WebSocket with direct constructor bypass');

    try {
        // Force the connection to use non-secure WebSocket
        // We use a JavaScript trick to prevent Firefox from upgrading to wss://
        const wsConstructor = WebSocket;
        const wsUrl = 'ws://127.0.0.1:59210';

        // Log the actual URL we're connecting to
        console.log('Info: Constructing WebSocket with URL:', wsUrl);

        // Create the socket using the native constructor directly
        // This can sometimes bypass Firefox's automatic protocol upgrading
        return new wsConstructor(wsUrl);
    } catch (error) {
        console.error('Info: WebSocket creation error:', error.message || 'Unknown error');
        throw error;
    }
}

/**
 * Firefox-specific implementation for WebSocket connection
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
function connectWebSocketFirefox(onSourcesReceived) {
    console.log('Info: Starting Firefox WebSocket connection (direct bypass)');

    try {
        const connectionTimeout = setTimeout(() => {
            console.log('Info: Firefox WebSocket connection timed out');
            handleConnectionFailure();
        }, 3000);

        try {
            // Use our special bypass method instead of direct WebSocket constructor
            socket = createFirefoxWebSocket();

            // Check if the socket was created successfully
            console.log('Info: WebSocket created, readyState:', socket.readyState);

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WebSocket connection opened successfully!');
                isConnecting = false;
                isConnected = true;
                broadcastConnectionStatus();
            };

            socket.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);

                    // Handle both initial state and updates
                    if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                        // Check if there's a meaningful difference in the sources
                        const newSourcesHash = generateSourcesHash(parsed.sources);
                        const previousSources = [...allSources]; // Make a copy of current sources

                        // Update all sources regardless of hash to ensure we have the latest data
                        allSources = parsed.sources;
                        console.log('Info: Firefox sources received:', allSources.length);

                        // Compare source IDs to detect if sources were added or removed
                        const previousSourceIds = new Set(previousSources.map(s => s.sourceId || s.locationId));
                        const newSourceIds = new Set(parsed.sources.map(s => s.sourceId || s.locationId));

                        // Check for removed sources
                        const removedSourceIds = [];
                        previousSourceIds.forEach(id => {
                            if (!newSourceIds.has(id)) {
                                removedSourceIds.push(id);
                            }
                        });

                        // If sources were removed, we need to update the header rules
                        if (removedSourceIds.length > 0) {
                            console.log('Info: Detected removed sources:', removedSourceIds.join(', '));

                            // Check if any saved headers use these sources
                            storage.sync.get(['savedData'], (result) => {
                                const savedData = result.savedData || {};
                                let headersNeedUpdate = false;

                                // Create an updated copy of savedData
                                const updatedSavedData = {...savedData};

                                // Check each header entry
                                for (const id in savedData) {
                                    const entry = savedData[id];

                                    // If this is a dynamic header that used a removed source
                                    if (entry.isDynamic && removedSourceIds.includes(entry.sourceId?.toString())) {
                                        console.log(`Info: Header "${entry.headerName}" was using removed source ${entry.sourceId}`);

                                        // Option 1: Mark the header as having a missing source
                                        updatedSavedData[id] = {
                                            ...entry,
                                            sourceMissing: true
                                        };

                                        headersNeedUpdate = true;
                                    }
                                }

                                // Update storage if needed
                                if (headersNeedUpdate) {
                                    console.log('Info: Updating header configuration to reflect removed sources');
                                    storage.sync.set({ savedData: updatedSavedData }, () => {
                                        console.log('Info: Header configuration updated');
                                    });
                                }
                            });
                        }

                        storage.local.set({ dynamicSources: allSources }, () => {
                            console.log('Info: Sources saved to Firefox storage');

                            // Only update network rules if sources actually changed
                            if (newSourcesHash !== lastSourcesHash) {
                                console.log('Info: Sources changed, updating network rules');

                                // Call the callback with the sources
                                if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                                    onSourcesReceived(allSources);
                                }

                                lastSourcesHash = newSourcesHash;
                                lastRulesUpdateTime = Date.now();
                            } else {
                                console.log('Info: Sources content unchanged, skipping rule update');
                            }

                            // Notify any open popups that sources have been updated
                            runtime.sendMessage({
                                type: 'sourcesUpdated',
                                sources: allSources,
                                timestamp: Date.now(),
                                removedSourceIds: removedSourceIds.length > 0 ? removedSourceIds : undefined
                            })
                                .catch(() => {
                                    console.log('Info: No Firefox popup listening');
                                });
                        });
                    }
                } catch (err) {
                    console.log('Info: Error parsing Firefox WebSocket message:', err.message || 'Unknown error');
                }
            };

            socket.onclose = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WebSocket closed');
                handleConnectionFailure();
            };

            socket.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WebSocket error:', error.message || 'Unknown error');
                handleConnectionFailure();
            };

        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WebSocket creation error:', e.message || 'Unknown error');
            handleConnectionFailure();
        }
    } catch (e) {
        console.log('Info: Firefox WebSocket setup error:', e.message || 'Unknown error');
        handleConnectionFailure();
    }
}

/**
 * Modified server pre-check for Firefox that properly handles 426 responses
 */
async function checkServerAvailabilityForFirefox() {
    console.log('Info: Running enhanced Firefox server availability check');

    return new Promise(resolve => {
        try {
            // Create a standard XMLHttpRequest for better error handling than fetch()
            const xhr = new XMLHttpRequest();
            xhr.open('HEAD', 'http://127.0.0.1:59210/ping', true);

            // Set a timeout
            xhr.timeout = 1000;

            xhr.onload = function() {
                // Any response means the server is running
                console.log('Info: Server response status:', xhr.status);

                // 426 Upgrade Required is actually a success for our purposes!
                // It means the server is running and wants a WebSocket connection
                if (xhr.status === 426) {
                    console.log('Info: Server is available (426 response)');
                    resolve(true);
                    return;
                }

                // Any 2xx status means the server is running
                if (xhr.status >= 200 && xhr.status < 300) {
                    console.log('Info: Server is available (200 response)');
                    resolve(true);
                    return;
                }

                // Other status codes might be problematic
                console.log('Info: Server responded with status:', xhr.status);
                resolve(true);  // Still consider server available
            };

            xhr.onerror = function(e) {
                // Most errors mean the server isn't available
                // But we need to check the error type
                console.log('Info: Server check error:', e.type);

                // Network errors usually mean server isn't running
                resolve(false);
            };

            xhr.ontimeout = function() {
                console.log('Info: Server check timed out');
                resolve(false);
            };

            // Send the request
            xhr.send();

        } catch (e) {
            console.log('Info: Server check failed with exception:', e.message || 'Unknown error');
            resolve(false);
        }
    });
}

/**
 * Special check for Firefox to avoid console errors
 * @returns {Promise<boolean>} - Whether server is available
 */
async function checkServerAvailabilityForFirefoxOriginal() {
    return new Promise(resolve => {
        try {
            // Use a more reliable method than WebSocket for checking
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            // Use fetch with very short timeout
            fetch('http://127.0.0.1:59210/ping', {
                mode: 'no-cors',
                signal: controller.signal,
                method: 'HEAD' // Use HEAD request for minimal traffic
            })
                .then(() => {
                    clearTimeout(timeoutId);
                    resolve(true);
                })
                .catch(() => {
                    clearTimeout(timeoutId);
                    // Any error means server is not available
                    resolve(false);
                });
        } catch (e) {
            resolve(false);
        }
    });
}

/**
 * Common handler for connection failures
 */
function handleConnectionFailure() {
    isConnecting = false;
    isConnected = false;

    // Notify any open popups
    broadcastConnectionStatus();

    // Try again after delay
    reconnectTimer = setTimeout(() => {
        console.log('Info: Attempting to reconnect WebSocket...');
        connectWebSocket((sources) => {
            // This is the callback that will be used when reconnected
            runtime.sendMessage({ type: 'sourcesUpdated', sources: sources })
                .catch(() => {
                    // Ignore errors when no popup is listening
                });
        });
    }, RECONNECT_DELAY_MS);
}

/**
 * Gets the current connection status.
 * @returns {boolean} - True if connected
 */
export function isWebSocketConnected() {
    // Return true only if both flag is set AND socket exists in OPEN state
    return isConnected && socket && socket.readyState === WebSocket.OPEN;
}

/**
 * Gets the current sources from WebSocket.
 * @returns {Array} - Array of sources
 */
export function getCurrentSources() {
    // If we don't have any sources in memory, try to load from storage
    if (allSources.length === 0) {
        try {
            // Use browser-agnostic storage API instead of chrome.storage.local
            storage.local.get(['dynamicSources'], (result) => {
                if (result.dynamicSources && Array.isArray(result.dynamicSources) &&
                    result.dynamicSources.length > 0 && allSources.length === 0) {
                    allSources = result.dynamicSources;
                    console.log('Info: Loaded sources from storage.local:', allSources.length);
                }
            });
        } catch (e) {
            console.log('Info: Error loading from storage:', e);
        }
    }

    return [...allSources]; // Return a copy to prevent mutation
}