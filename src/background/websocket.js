/**
 * WebSocket connection management
 */
import { runtime, storage, isSafari, isFirefox } from '../utils/browser-api.js';
import { adaptWebSocketUrl, safariPreCheck } from './safari-websocket-adapter.js';
import { updateNetworkRules } from './header-manager.js';

// Configuration
const WS_SERVER_URL = 'ws://127.0.0.1:59210';
const WSS_SERVER_URL = 'wss://127.0.0.1:59211'; // Secure endpoint for Firefox
const RECONNECT_DELAY_MS = 5000;

// Certificate fingerprint that matches the hardcoded certificate
const EXPECTED_CERT_FINGERPRINT = "53:64:0A:FA:73:44:F3:14:DA:9D:C9:5E:F1:93:1F:82:45:62:B5:5E";

// State variables
let socket = null;
let reconnectTimer = null;
let isConnecting = false;
let isConnected = false;
let allSources = [];
let welcomePageOpenedBySocket = false;

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
 * Opens the Firefox welcome/onboarding page instead of directly showing the certificate error
 */
function openFirefoxOnboardingPage() {
    console.log('Info: Opening Firefox welcome page');

    try {
        if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.create) {
            const welcomePageUrl = browser.runtime.getURL('welcome.html');
            console.log('Info: Welcome page URL:', welcomePageUrl);

            browser.tabs.create({
                url: welcomePageUrl,
                active: true
            }).then(tab => {
                console.log('Info: Opened Firefox welcome tab:', tab.id);
            }).catch(err => {
                console.log('Info: Failed to open welcome page:', err.message);
                // Fallback to direct method if welcome page fails
                tryDirectCertificateHelp();
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            tryDirectCertificateHelp();
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', e.message);
        tryDirectCertificateHelp();
    }
}

/**
 * Fallback method to directly open certificate page if welcome page fails
 */
function tryDirectCertificateHelp() {
    try {
        if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.create) {
            browser.tabs.create({
                url: 'https://127.0.0.1:59211/ping',
                active: true
            }).catch(err => {
                console.log('Info: Failed to open certificate page directly:', err.message);
            });
        }
    } catch (e) {
        console.log('Info: Error with direct certificate help:', e.message);
    }
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

    // For Firefox, use the specialized approach
    if (isFirefox) {
        console.log('Info: Using Firefox-specific connection approach');

        // First check server availability with Firefox-specific check
        const isServerAvailable = await checkServerAvailabilityForFirefox();
        if (!isServerAvailable) {
            console.log('Info: Server not available for Firefox, skipping connection');
            handleConnectionFailure();
            return;
        }

        // Use Firefox-specific connection logic
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
 * Firefox-specific implementation for WebSocket connection
 * Uses smart selection between WS and WSS based on previous success
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
function connectWebSocketFirefox(onSourcesReceived) {
    storage.local.get(['lastSuccessfulConnection', 'certificateAccepted', 'setupCompleted'], (result) => {
        // Check if we've successfully used WS in the past
        const lastConnection = result.lastSuccessfulConnection;
        const certificateAccepted = result.certificateAccepted;
        const setupCompleted = result.setupCompleted;

        // If certificate is already accepted or setup is completed, don't show welcome page
        if (certificateAccepted || setupCompleted) {
            console.log('Info: Certificate already accepted or setup completed, skipping welcome page');

            // If the last successful connection was WS, try that first
            if (lastConnection && lastConnection.type === 'ws-fallback' &&
                Date.now() - lastConnection.timestamp < 86400000) { // Last 24 hours
                console.log('Info: Using previous successful WS connection');
                connectFirefoxWs(onSourcesReceived);
            } else {
                // Try WSS with accepted certificate
                connectFirefoxWss(onSourcesReceived);
            }
        } else if (!certificateAccepted && !welcomePageOpenedBySocket) {
            // First time user - show welcome page (but only once) and try WSS
            welcomePageOpenedBySocket = true;
            console.log('Info: First time user detected, showing welcome page');

            // Check if a welcome page is already open before creating a new one
            if (typeof browser !== 'undefined' && browser.tabs && browser.tabs.query) {
                const welcomePageUrl = browser.runtime.getURL('welcome.html');

                browser.tabs.query({}).then(tabs => {
                    const welcomeTabs = tabs.filter(tab =>
                        tab.url === welcomePageUrl ||
                        tab.url.startsWith(welcomePageUrl)
                    );

                    if (welcomeTabs.length > 0) {
                        // Welcome page is already open, just focus it
                        console.log('Info: Welcome page already exists, focusing it');
                        browser.tabs.update(welcomeTabs[0].id, {active: true}).catch(err => {
                            console.log('Info: Error focusing existing welcome tab:', err.message);
                        });
                    } else {
                        // Only open a new welcome page if one doesn't exist
                        console.log('Info: Opening Firefox welcome page');
                        browser.tabs.create({
                            url: welcomePageUrl,
                            active: true
                        }).then(tab => {
                            console.log('Info: Opened Firefox welcome tab:', tab.id);
                        }).catch(err => {
                            console.log('Info: Failed to open welcome page:', err.message);
                        });
                    }
                }).catch(err => {
                    console.log('Info: Error checking for existing welcome tabs:', err.message);
                });
            }

            // Connect to WSS endpoint
            connectFirefoxWss(onSourcesReceived);
        } else {
            // Existing logic for connection attempts
            if (lastConnection && lastConnection.type === 'ws-fallback' &&
                Date.now() - lastConnection.timestamp < 86400000) { // Last 24 hours
                console.log('Info: Using previous successful WS connection');
                connectFirefoxWs(onSourcesReceived);
            } else {
                // Try WSS with accepted certificate
                connectFirefoxWss(onSourcesReceived);
            }
        }
    });
}

/**
 * Connect to WSS endpoint for Firefox
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
function connectFirefoxWss(onSourcesReceived) {
    console.log('Info: Starting Firefox WebSocket connection using WSS');

    try {
        const connectionTimeout = setTimeout(() => {
            console.log('Info: Firefox WebSocket connection timed out');
            handleConnectionFailure();
        }, 3000);

        try {
            // Connect to the secure WSS endpoint
            console.log('Info: Connecting to secure endpoint:', WSS_SERVER_URL);
            socket = new WebSocket(WSS_SERVER_URL);

            // Log connection status
            console.log('Info: Firefox WSS connection created, readyState:', socket.readyState);

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox secure WebSocket connection opened successfully!');
                isConnecting = false;
                isConnected = true;
                broadcastConnectionStatus();

                // Record successful connection in storage
                storage.local.set({
                    lastSuccessfulConnection: {
                        timestamp: Date.now(),
                        type: 'wss'
                    },
                    certificateAccepted: true
                });
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
                                    storage.sync.set({ savedData: updatedSavedData });
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
                            }).catch(() => {});
                        });
                    }
                } catch (err) {
                    console.log('Info: Error parsing Firefox WebSocket message:', err.message || 'Unknown error');
                }
            };

            socket.onclose = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WSS connection closed');

                // If onopen was never called, this might be a certificate issue
                if (isConnecting) {
                    console.log('Info: WSS connection failed, trying WS fallback');
                    connectFirefoxWs(onSourcesReceived);
                } else {
                    handleConnectionFailure();
                }
            };

            socket.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WSS connection error:', error.message || 'Unknown error');

                // Try WS as fallback
                connectFirefoxWs(onSourcesReceived);
            };
        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Error creating Firefox WSS connection:', e.message || 'Unknown error');

            // Fall back to regular WS
            connectFirefoxWs(onSourcesReceived);
        }
    } catch (e) {
        console.log('Info: Firefox WSS setup error:', e.message || 'Unknown error');
        handleConnectionFailure();
    }
}

/**
 * Connect to WS endpoint for Firefox (fallback)
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
function connectFirefoxWs(onSourcesReceived) {
    console.log('Info: Trying standard WS connection as fallback in Firefox');

    try {
        // Use standard WS instead of WSS as a fallback
        const wsUrl = 'ws://127.0.0.1:59210';

        console.log('Info: Connecting to fallback endpoint:', wsUrl);
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('Info: Firefox fallback WebSocket connection opened successfully!');
            isConnecting = false;
            isConnected = true;
            broadcastConnectionStatus();

            // Record successful fallback connection
            storage.local.set({
                lastSuccessfulConnection: {
                    timestamp: Date.now(),
                    type: 'ws-fallback'
                }
            });
        };

        // Set up the same message handler as the main connection
        socket.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);
                if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                    allSources = parsed.sources;
                    console.log('Info: Firefox fallback received sources:', allSources.length);

                    // Save sources and update rules
                    storage.local.set({ dynamicSources: allSources }, () => {
                        // Update network rules with the new sources
                        if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                            onSourcesReceived(allSources);
                        }

                        // Record the hash to prevent redundant updates
                        lastSourcesHash = generateSourcesHash(allSources);
                        lastRulesUpdateTime = Date.now();

                        // Notify popups
                        runtime.sendMessage({
                            type: 'sourcesUpdated',
                            sources: allSources,
                            timestamp: Date.now()
                        }).catch(() => {});
                    });
                }
            } catch (err) {
                console.log('Info: Error parsing fallback message:', err.message || 'Unknown error');
            }
        };

        socket.onclose = () => {
            console.log('Info: Firefox fallback WebSocket closed');
            handleConnectionFailure();
        };

        socket.onerror = (error) => {
            console.log('Info: Firefox fallback WebSocket error:', error.message || 'Unknown error');
            handleConnectionFailure();
        };

    } catch (e) {
        console.log('Info: Fallback connection failed:', e.message || 'Unknown error');
        handleConnectionFailure();
    }
}

/**
 * Modified server pre-check for Firefox that checks both WS and WSS endpoints
 */
async function checkServerAvailabilityForFirefox() {
    console.log('Info: Running Firefox server availability check for both WS and WSS...');

    return new Promise(resolve => {
        try {
            // First check last successful connection type
            storage.local.get(['lastSuccessfulConnection', 'certificateAccepted'], (result) => {
                const lastConnection = result.lastSuccessfulConnection;
                const certificateAccepted = result.certificateAccepted;

                // If we've accepted the certificate, check WSS first
                if (certificateAccepted) {
                    console.log('Info: Certificate previously accepted, checking WSS first');

                    checkWssEndpoint().then(wssAvailable => {
                        if (wssAvailable) {
                            console.log('Info: WSS endpoint available for Firefox');
                            resolve(true);
                            return;
                        }

                        // Fall back to checking the WS endpoint
                        console.log('Info: WSS endpoint not available, checking WS endpoint');
                        checkWsEndpoint().then(wsAvailable => {
                            console.log('Info: WS endpoint availability:', wsAvailable);
                            resolve(wsAvailable);
                        });
                    });
                }
                // If we had a recent successful WS fallback connection, check that first
                else if (lastConnection && lastConnection.type === 'ws-fallback' &&
                    Date.now() - lastConnection.timestamp < 86400000) { // Last 24 hours
                    console.log('Info: Using previous successful WS fallback connection type');

                    // Try WS first
                    checkWsEndpoint().then(wsAvailable => {
                        if (wsAvailable) {
                            console.log('Info: WS endpoint available for Firefox');
                            resolve(true);
                            return;
                        }

                        // Try WSS as a fallback if WS fails
                        console.log('Info: WS endpoint not available, checking WSS endpoint');
                        checkWssEndpoint().then(wssAvailable => {
                            console.log('Info: WSS endpoint availability:', wssAvailable);
                            resolve(wssAvailable);
                        });
                    });
                } else {
                    // Default to trying WSS first, then WS as fallback
                    checkWssEndpoint().then(wssAvailable => {
                        if (wssAvailable) {
                            console.log('Info: WSS endpoint available for Firefox');
                            resolve(true);
                            return;
                        }

                        // Fall back to checking the WS endpoint
                        console.log('Info: WSS endpoint not available, checking WS endpoint');
                        checkWsEndpoint().then(wsAvailable => {
                            console.log('Info: WS endpoint availability:', wsAvailable);
                            resolve(wsAvailable);
                        });
                    });
                }
            });
        } catch (e) {
            console.log('Info: Server check failed:', e.message);
            resolve(false);
        }
    });
}

/**
 * Check if the WSS endpoint is available
 * @returns {Promise<boolean>}
 */
function checkWssEndpoint() {
    return new Promise(resolve => {
        try {
            // Use fetch to check if the WSS endpoint responds
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);

            fetch('https://127.0.0.1:59211/ping', {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            })
                .then(() => {
                    clearTimeout(timeoutId);
                    console.log('Info: WSS endpoint responded to fetch check');

                    // Mark the certificate as accepted since we made a successful request
                    storage.local.set({ certificateAccepted: true });

                    resolve(true);
                })
                .catch(error => {
                    clearTimeout(timeoutId);
                    console.log('Info: WSS endpoint check failed:', error.message);
                    resolve(false);
                });
        } catch (e) {
            console.log('Info: WSS check exception:', e.message);
            resolve(false);
        }
    });
}

/**
 * Check if the WS endpoint is available
 * @returns {Promise<boolean>}
 */
function checkWsEndpoint() {
    return new Promise(resolve => {
        try {
            // Create a standard XMLHttpRequest
            const xhr = new XMLHttpRequest();
            xhr.open('HEAD', 'http://127.0.0.1:59210/ping', true);
            xhr.timeout = 1000;

            xhr.onload = function() {
                console.log('Info: WS server response status:', xhr.status);
                // 426 Upgrade Required means the server is running
                if (xhr.status === 426 || (xhr.status >= 200 && xhr.status < 300)) {
                    resolve(true);
                    return;
                }
                resolve(false);
            };

            xhr.onerror = function() {
                console.log('Info: WS server check error');
                resolve(false);
            };

            xhr.ontimeout = function() {
                console.log('Info: WS server check timed out');
                resolve(false);
            };

            xhr.send();
        } catch (e) {
            console.log('Info: WS check exception:', e.message);
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