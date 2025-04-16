/**
 * WebSocket connection management
 */

// Configuration
const WS_SERVER_URL = 'ws://127.0.0.1:59210';
const RECONNECT_DELAY_MS = 5000;

// State variables
let socket = null;
let reconnectTimer = null;
let isConnecting = false;
let isConnected = false;
let allSources = [];

// Function to broadcast connection status to any open popups
function broadcastConnectionStatus() {
    chrome.runtime.sendMessage({
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

    // First check if the server is available
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

        // Create the WebSocket with properly handled events
        socket = new WebSocket(WS_SERVER_URL);

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
                    allSources = parsed.sources;
                    console.log('Info: Sources received:', allSources.length);

                    // Save to storage for the popup to access
                    chrome.storage.local.set({ dynamicSources: allSources }, () => {
                        console.log('Info: Sources saved to local storage');

                        // Call the callback with the sources
                        if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                            onSourcesReceived(allSources);
                        }

                        // Notify any open popups that sources have been updated
                        chrome.runtime.sendMessage({ type: 'sourcesUpdated', sources: allSources })
                            .catch(err => {
                                // This error is expected when no popup is listening
                                if (!err.message.includes("Could not establish connection")) {
                                    console.log("Info: No popup listening for source updates");
                                }
                            });
                    });
                }
            } catch (err) {
                console.log('Info: Error parsing message from WebSocket');
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
            chrome.runtime.sendMessage({ type: 'sourcesUpdated', sources: sources })
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
            // We can only use chrome.storage.local in service workers, not localStorage
            chrome.storage.local.get(['dynamicSources'], (result) => {
                if (result.dynamicSources && Array.isArray(result.dynamicSources) &&
                    result.dynamicSources.length > 0 && allSources.length === 0) {
                    allSources = result.dynamicSources;
                    console.log('Info: Loaded sources from chrome.storage.local:', allSources.length);
                }
            });
        } catch (e) {
            console.log('Info: Error loading from storage:', e);
        }
    }

    return [...allSources]; // Return a copy to prevent mutation
}