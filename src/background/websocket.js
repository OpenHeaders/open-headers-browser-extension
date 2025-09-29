/**
 * WebSocket connection management
 */
import { runtime, storage, isSafari, isFirefox, isChrome, isEdge } from '../utils/browser-api.js';
import { adaptWebSocketUrl, safariPreCheck } from './safari-websocket-adapter.js';
import { updateNetworkRules } from './header-manager.js';
import { getChunkedData, setChunkedData } from '../utils/storage-chunking.js';

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
let rules = {};
let welcomePageOpenedBySocket = false;


// Debug socket state - exposed on globalThis for service workers
globalThis._debugWebSocket = () => {
    console.log('Socket:', socket);
    console.log('Socket state:', socket?.readyState);
    console.log('Is connected:', isConnected);
    console.log('WebSocket.OPEN:', WebSocket.OPEN);
};

// Helper function for safe message sending
const sendMessageSafely = (message, callback) => {
    runtime.sendMessage(message, (response) => {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI.runtime.lastError) {
            // This is expected when no listeners are available
            if (callback) callback(null, browserAPI.runtime.lastError);
        } else {
            if (callback) callback(response, null);
        }
    });
};

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
            id: source.sourceId,
            content: source.sourceContent
        };
    });

    return JSON.stringify(simplifiedSources);
}

// Track last sources hash to avoid redundant updates
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;

/**
 * Get browser name for identification
 * @returns {string} Browser name
 */
function getBrowserName() {
    if (isFirefox) return 'firefox';
    if (isChrome) return 'chrome';
    if (isEdge) return 'edge';
    if (isSafari) return 'safari';
    return 'unknown';
}

/**
 * Get browser version
 * @returns {string} Browser version
 */
function getBrowserVersion() {
    try {
        const manifest = runtime.getManifest();
        // Try to get browser version from user agent
        if (navigator && navigator.userAgent) {
            const ua = navigator.userAgent;
            let match;
            
            if (isFirefox) {
                match = ua.match(/Firefox\/(\S+)/);
            } else if (isEdge) {
                match = ua.match(/Edg\/(\S+)/);
            } else if (isChrome) {
                match = ua.match(/Chrome\/(\S+)/);
            } else if (isSafari) {
                match = ua.match(/Version\/(\S+)/);
            }
            
            if (match && match[1]) {
                return match[1];
            }
        }
    } catch (e) {
        console.log('Info: Could not determine browser version');
    }
    return '';
}

/**
 * Send updated rules to the Electron app
 * @param {Object} rulesData - The updated rules data from browser extension
 */
function sendRulesToElectronApp(rulesData) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'rules-update',
            data: rulesData
        }));
        console.log('Info: Sent updated rules to Electron app');
    }
}

// Function to broadcast connection status to any open popups
function broadcastConnectionStatus() {
    sendMessageSafely({
        type: 'connectionStatus',
        connected: isConnected
    }, (response, error) => {
        // Ignore errors - this is expected when no popup is open
    });
}

/**
 * Main WebSocket connection function
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
export function connectWebSocket(onSourcesReceived) {
    if (isConnecting || (socket && socket.readyState === WebSocket.OPEN)) {
        console.log('Info: Connection already active or in progress');
        return;
    }

    isConnecting = true;

    // Handle browser-specific connection logic
    if (isFirefox) {
        connectWebSocketFirefox(onSourcesReceived);
    } else if (isSafari) {
        // Safari needs pre-check
        safariPreCheck(WS_SERVER_URL).then(canConnect => {
            if (canConnect) {
                connectStandardWebSocket(adaptWebSocketUrl(WS_SERVER_URL), onSourcesReceived);
            } else {
                console.log('Info: Safari pre-check failed, will retry');
                handleConnectionFailure();
            }
        });
    } else {
        // Chrome/Edge - standard connection
        connectStandardWebSocket(WS_SERVER_URL, onSourcesReceived);
    }
}

/**
 * Handle connection failure and schedule reconnection
 */
function handleConnectionFailure() {
    socket = null;
    isConnecting = false;
    isConnected = false;
    broadcastConnectionStatus();

    // Clear any existing reconnect timer
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }

    console.log(`Info: Scheduling reconnection in ${RECONNECT_DELAY_MS}ms`);
    reconnectTimer = setTimeout(() => {
        console.log('Info: Attempting WebSocket reconnection');
        connectWebSocket();
    }, RECONNECT_DELAY_MS);
}

/**
 * Check if the WebSocket server is reachable
 * @param {string} wsUrl - WebSocket URL
 * @returns {Promise<boolean>} - True if server is reachable
 */
async function checkServerReachable(wsUrl) {
    try {
        // Convert ws:// to http:// for the check
        const httpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 500); // Quick timeout
        
        const response = await fetch(httpUrl, {
            method: 'GET',
            signal: controller.signal,
            mode: 'no-cors' // Avoid CORS issues for the check
        });
        
        clearTimeout(timeoutId);
        // In no-cors mode, we can't read the response, but if fetch succeeds, server is reachable
        return true;
    } catch (error) {
        // Server is not reachable - this is expected when app is closed
        return false;
    }
}


/**
 * Standard WebSocket connection implementation
 * @param {string} url - WebSocket URL to connect to
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
function connectStandardWebSocket(url, onSourcesReceived) {
    console.log('Info: Starting WebSocket connection using URL:', url);

    // Check if server is reachable before attempting WebSocket connection
    checkServerReachable(url).then(isReachable => {
        if (!isReachable) {
            console.log('Info: WebSocket server not reachable, will retry later');
            handleConnectionFailure();
            return;
        }

        // Server is reachable, proceed with WebSocket connection
        let connectionTimeout;
        try {
            connectionTimeout = setTimeout(() => {
                console.log('Info: WebSocket connection timed out');
                handleConnectionFailure();
            }, 3000);

            socket = new WebSocket(url);
            
            // Add error handler immediately to catch any connection errors
            socket.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.log('Info: WebSocket connection issue detected');
                // We'll let the onclose event handle the reconnection
            };

            socket.onopen = () => {
                    clearTimeout(connectionTimeout);
                    console.log('Info: WebSocket connection opened successfully!');
                    isConnecting = false;
                    isConnected = true;
                    broadcastConnectionStatus();

                    // Send browser information
                    if (socket.readyState === WebSocket.OPEN) {
                        const browserInfo = {
                            type: 'browserInfo',
                            browser: getBrowserName(),
                            version: getBrowserVersion(),
                            extensionVersion: runtime.getManifest().version
                        };
                        socket.send(JSON.stringify(browserInfo));
                        console.log('Info: Sent browser info to Electron app');
                        
                        // Request rules from Electron app
                        socket.send(JSON.stringify({ type: 'requestRules' }));
                        console.log('Info: Requested rules from Electron app');
                    }
                };

                socket.onmessage = (event) => {
                    try {
                        const parsed = JSON.parse(event.data);

                // Handle both initial state and updates
                if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                    // Check if there's a meaningful difference in the sources
                    const newSourcesHash = generateSourcesHash(parsed.sources);
                    const previousSources = [...allSources]; // Make a copy of current sources
                    const isInitialConnection = parsed.type === 'sourcesInitial';

                    // Update all sources regardless of hash to ensure we have the latest data
                    allSources = parsed.sources;
                    console.log('Info: Sources received:', allSources.length, 'at', new Date().toISOString());

                    // Compare source IDs to detect if sources were added or removed
                    const previousSourceIds = new Set(previousSources.map(s => s.sourceId));
                    const newSourceIds = new Set(parsed.sources.map(s => s.sourceId));

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
                        getChunkedData('savedData', (savedData) => {
                            savedData = savedData || {};
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
                                setChunkedData('savedData', updatedSavedData, () => {
                                    if (runtime.lastError) {
                                        console.error('Error updating header configuration:', runtime.lastError);
                                    }
                                });
                            }
                        });
                    }

                    storage.local.set({ dynamicSources: allSources }, () => {
                        console.log('Info: Sources saved to storage');

                        // Always update network rules on initial connection or if sources changed
                        if (isInitialConnection || newSourcesHash !== lastSourcesHash || !lastRulesUpdateTime) {
                            console.log('Info: Initial connection or sources changed, updating network rules');

                            // Update network rules first
                            updateNetworkRules(allSources);

                            // Call the callback with the sources
                            if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                                onSourcesReceived(allSources);
                            }

                            lastSourcesHash = newSourcesHash;
                            lastRulesUpdateTime = Date.now();
                        } else {
                            const timeSinceLastUpdate = Date.now() - lastRulesUpdateTime;
                            const FORCE_UPDATE_INTERVAL = 60 * 1000; // 1 minute
                            if (timeSinceLastUpdate > FORCE_UPDATE_INTERVAL) {
                                console.log('Info: Periodic network rules update');
                                updateNetworkRules(allSources);
                                lastRulesUpdateTime = Date.now();
                            }
                        }

                        // Notify any open popups
                        sendMessageSafely({
                            type: 'sourcesUpdated',
                            sources: allSources,
                            timestamp: Date.now(),
                            removedSourceIds: removedSourceIds.length > 0 ? removedSourceIds : undefined
                        }, (response, error) => {
                            // Ignore errors - expected when no popup is listening
                        });
                    });
                } else if (parsed.type === 'rules-update' && parsed.data) {
                    // Handle unified rules format
                    console.log('Info: WebSocket received unified rules update');
                    
                    // Store the full rules data
                    rules = parsed.data.rules || {};
                    
                    // Extract header rules for network rule updates
                    const headerRules = rules.header || [];
                    console.log('Info: Extracted', headerRules.length, 'header rules from unified format');
                    
                    // Convert header rules to savedData format for storage
                    const savedData = {};
                    headerRules.forEach((rule) => {
                        savedData[rule.id] = {
                            headerName: rule.headerName,
                            headerValue: rule.headerValue || '',
                            domains: rule.domains || [],
                            isDynamic: rule.isDynamic || false,
                            sourceId: rule.sourceId || '',
                            prefix: rule.prefix || '',
                            suffix: rule.suffix || '',
                            isResponse: rule.isResponse || false,
                            isEnabled: rule.isEnabled !== false,
                            tag: rule.tag || '',  // Include the tag field
                            createdAt: rule.createdAt || new Date().toISOString()
                        };
                    });
                    
                    // Save to storage using chunking to avoid quota errors
                    setChunkedData('savedData', savedData, () => {
                        if (runtime.lastError) {
                            console.error('Error saving header rules:', runtime.lastError);
                        } else {
                            console.log('Info: Header rules saved to sync storage');
                        }
                        
                        // Update network rules with new header rules
                        updateNetworkRules(allSources);
                        
                        // Notify any open popups
                        sendMessageSafely({
                            type: 'rulesUpdated',
                            rules: rules,
                            timestamp: Date.now()
                        }, (response, error) => {
                            // Ignore errors - expected when no popup is listening
                        });
                    });
                    
                    // Store the full rules data for future use
                    storage.local.set({ rulesData: parsed.data }, () => {
                        console.log('Info: Full rules data saved to local storage');
                    });
                } else if (parsed.type === 'videoRecordingStateChanged') {
                    // Handle video recording state change
                    console.log('Info: WebSocket received video recording state change:', parsed.enabled);
                    
                    // Broadcast to any open popups
                    sendMessageSafely({
                        type: 'videoRecordingStateChanged',
                        enabled: parsed.enabled
                    }, (response, error) => {
                        // Ignore errors - expected when no popup is listening
                    });
                } else if (parsed.type === 'recordingHotkeyResponse' || parsed.type === 'recordingHotkeyChanged') {
                    // Handle recording hotkey response or hotkey change broadcast
                    console.log('Info: WebSocket received recording hotkey:', parsed.hotkey, 'enabled:', parsed.enabled);
                    
                    // Store the new hotkey in storage for persistence
                    if (parsed.type === 'recordingHotkeyChanged') {
                        storage.local.set({ 
                            recordingHotkey: parsed.hotkey,
                            recordingHotkeyEnabled: parsed.enabled !== undefined ? parsed.enabled : true
                        }, () => {
                            console.log('Info: Updated recording hotkey in storage:', parsed.hotkey, 'enabled:', parsed.enabled);
                        });
                    }
                    
                    // Broadcast to any open popups
                    sendMessageSafely({
                        type: 'recordingHotkeyResponse',
                        hotkey: parsed.hotkey,
                        enabled: parsed.enabled !== undefined ? parsed.enabled : true
                    }, (response, error) => {
                        // Ignore errors - expected when no popup is listening
                    });
                } else if (parsed.type === 'recordingHotkeyPressed') {
                    // Handle recording hotkey press from desktop app
                    console.log('Info: WebSocket received recording hotkey press');
                    
                    // Broadcast to background script via storage event
                    // Background will handle the toggle logic
                    storage.local.set({ 
                        hotkeyCommand: {
                            type: 'TOGGLE_RECORDING',
                            timestamp: Date.now()
                        }
                    }, () => {
                        console.log('Info: Triggered recording toggle from hotkey');
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
        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Error creating WebSocket connection');
            handleConnectionFailure();
        }
    });
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

    // Check if server is reachable before attempting WebSocket connection
    checkServerReachable(WSS_SERVER_URL).then(isReachable => {
        if (!isReachable) {
            console.log('Info: Firefox WSS server not reachable, trying WS fallback');
            connectFirefoxWs(onSourcesReceived);
            return;
        }

        // Server is reachable, proceed with WebSocket connection
        let connectionTimeout;
        try {
            connectionTimeout = setTimeout(() => {
                console.log('Info: Firefox WebSocket connection timed out');
                handleConnectionFailure();
            }, 3000);

            // Connect to the secure WSS endpoint
            console.log('Info: Connecting to secure endpoint:', WSS_SERVER_URL);
            socket = new WebSocket(WSS_SERVER_URL);

            // Add error handler immediately to catch any connection errors
            socket.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WebSocket error:', error);
                // We'll let the onclose event handle the reconnection
            };

            // Log connection status
            console.log('Info: Firefox WSS connection created, readyState:', socket.readyState);

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox secure WebSocket connection opened successfully!');
                isConnecting = false;
                isConnected = true;
                broadcastConnectionStatus();

                // Send browser information
                if (socket.readyState === WebSocket.OPEN) {
                    const browserInfo = {
                        type: 'browserInfo',
                        browser: getBrowserName(),
                        version: getBrowserVersion(),
                        extensionVersion: runtime.getManifest().version
                    };
                    socket.send(JSON.stringify(browserInfo));
                    console.log('Info: Sent browser info to Electron app');
                    
                    // Request rules from Electron app
                    socket.send(JSON.stringify({ type: 'requestRules' }));
                    console.log('Info: Requested rules from Electron app');
                }

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
                        const isInitialConnection = parsed.type === 'sourcesInitial';

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
                            getChunkedData('savedData', (savedData) => {
                                savedData = savedData || {};
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
                                    setChunkedData('savedData', updatedSavedData, () => {
                                        if (runtime.lastError) {
                                            console.error('Error updating Firefox header configuration:', runtime.lastError);
                                        }
                                    });
                                }
                            });
                        }

                        storage.local.set({ dynamicSources: allSources }, () => {
                            console.log('Info: Sources saved to Firefox storage');

                            // Always update network rules on initial connection or if sources changed
                            if (isInitialConnection || newSourcesHash !== lastSourcesHash || !lastRulesUpdateTime) {
                                console.log('Info: Firefox initial connection or sources changed, updating network rules');

                                // Update network rules first
                                updateNetworkRules(allSources);

                                // Call the callback with the sources
                                if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                                    onSourcesReceived(allSources);
                                }

                                lastSourcesHash = newSourcesHash;
                                lastRulesUpdateTime = Date.now();
                            } else {
                                const timeSinceLastUpdate = Date.now() - lastRulesUpdateTime;
                                const FORCE_UPDATE_INTERVAL = 60 * 1000; // 1 minute
                                if (timeSinceLastUpdate > FORCE_UPDATE_INTERVAL) {
                                    console.log('Info: Firefox periodic network rules update');
                                    updateNetworkRules(allSources);
                                    lastRulesUpdateTime = Date.now();
                                }
                            }

                            // Notify any open popups
                            sendMessageSafely({
                                type: 'sourcesUpdated',
                                sources: allSources,
                                timestamp: Date.now(),
                                removedSourceIds: removedSourceIds.length > 0 ? removedSourceIds : undefined
                            }, (response, error) => {
                                // Ignore errors - expected when no popup is listening
                            });
                        });
                    } else if (parsed.type === 'rules-update' && parsed.data) {
                        // Handle unified rules format
                        console.log('Info: Firefox WebSocket received unified rules update');
                        
                        // Store the full rules data
                        rules = parsed.data.rules || {};
                        
                        // Extract header rules for network rule updates
                        const headerRules = rules.header || [];
                        console.log('Info: Extracted', headerRules.length, 'header rules from unified format');
                        
                        // Convert header rules to savedData format for storage
                        const savedData = {};
                        headerRules.forEach((rule) => {
                            savedData[rule.id] = {
                                headerName: rule.headerName,
                                headerValue: rule.headerValue || '',
                                domains: rule.domains || [],
                                isDynamic: rule.isDynamic || false,
                                sourceId: rule.sourceId || '',
                                prefix: rule.prefix || '',
                                suffix: rule.suffix || '',
                                isResponse: rule.isResponse || false,
                                isEnabled: rule.isEnabled !== false,
                                tag: rule.tag || '',  // Include the tag field
                                createdAt: rule.createdAt || new Date().toISOString()
                            };
                        });
                        
                        // Save to storage using chunking to avoid quota errors
                        setChunkedData('savedData', savedData, () => {
                            if (runtime.lastError) {
                                console.error('Error saving Firefox header rules:', runtime.lastError);
                            } else {
                                console.log('Info: Firefox header rules saved to sync storage');
                            }
                            
                            // Update network rules with new header rules
                            updateNetworkRules(allSources);
                            
                            // Notify any open popups
                            sendMessageSafely({
                                type: 'rulesUpdated',
                                rules: rules,
                                timestamp: Date.now()
                            }, (response, error) => {
                                // Ignore errors - expected when no popup is listening
                            });
                        });
                        
                        // Store the full rules data for future use
                        storage.local.set({ rulesData: parsed.data }, () => {
                            console.log('Info: Firefox full rules data saved to local storage');
                        });
                    } else if (parsed.type === 'videoRecordingStateChanged') {
                        // Handle video recording state change
                        console.log('Info: Firefox WebSocket received video recording state change:', parsed.enabled);
                        
                        // Broadcast to any open popups
                        sendMessageSafely({
                            type: 'videoRecordingStateChanged',
                            enabled: parsed.enabled
                        }, (response, error) => {
                            // Ignore errors - expected when no popup is listening
                        });
                    } else if (parsed.type === 'recordingHotkeyResponse' || parsed.type === 'recordingHotkeyChanged') {
                        // Handle recording hotkey response or hotkey change broadcast
                        console.log('Info: Firefox WebSocket received recording hotkey:', parsed.hotkey, 'enabled:', parsed.enabled);
                        
                        // Store the new hotkey in storage for persistence
                        if (parsed.type === 'recordingHotkeyChanged') {
                            storage.local.set({ 
                                recordingHotkey: parsed.hotkey,
                                recordingHotkeyEnabled: parsed.enabled !== undefined ? parsed.enabled : true
                            }, () => {
                                console.log('Info: Firefox updated recording hotkey in storage:', parsed.hotkey, 'enabled:', parsed.enabled);
                            });
                        }
                        
                        // Broadcast to any open popups
                        sendMessageSafely({
                            type: 'recordingHotkeyResponse',
                            hotkey: parsed.hotkey,
                            enabled: parsed.enabled !== undefined ? parsed.enabled : true
                        }, (response, error) => {
                            // Ignore errors - expected when no popup is listening
                        });
                    } else if (parsed.type === 'recordingHotkeyPressed') {
                        // Handle recording hotkey press from desktop app
                        console.log('Info: Firefox WebSocket received recording hotkey press');
                        
                        // Broadcast to background script via storage event
                        storage.local.set({ 
                            hotkeyCommand: {
                                type: 'TOGGLE_RECORDING',
                                timestamp: Date.now()
                            }
                        }, () => {
                            console.log('Info: Firefox triggered recording toggle from hotkey');
                        });
                    }
                } catch (err) {
                    console.log('Info: Firefox error parsing message from WebSocket:', err);
                }
            };

            socket.onclose = (event) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WSS WebSocket closed with code:', event.code);
                
                if (event.code === 1015) {
                    console.log('Info: Firefox TLS handshake failure detected');
                    
                    // Check if certificate might be the issue
                    storage.local.get(['certificateAccepted'], (result) => {
                        if (!result.certificateAccepted) {
                            console.log('Info: Firefox certificate not accepted, prompting user');
                            
                            // Set flag to prevent showing multiple welcome pages
                            storage.local.set({ certificateAccepted: false });
                        }
                    });
                    
                    // Try fallback to WS
                    console.log('Info: Firefox attempting fallback to regular WebSocket');
                    connectFirefoxWs(onSourcesReceived);
                } else {
                    // Normal close, schedule reconnection
                    handleConnectionFailure();
                }
            };
        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WSS connection failed:', e.message);
            
            // Try fallback to regular WebSocket
            console.log('Info: Firefox falling back to regular WebSocket');
            connectFirefoxWs(onSourcesReceived);
        }
    });
}

/**
 * Connect to WS endpoint for Firefox (fallback)
 * @param {Function} onSourcesReceived - Callback when sources are received
 */
function connectFirefoxWs(onSourcesReceived) {
    console.log('Info: Starting Firefox WebSocket connection using WS (fallback)');

    // Check if server is reachable before attempting WebSocket connection
    checkServerReachable(WS_SERVER_URL).then(isReachable => {
        if (!isReachable) {
            console.log('Info: Firefox WS server not reachable, will retry later');
            handleConnectionFailure();
            return;
        }

        // Server is reachable, proceed with WebSocket connection
        let connectionTimeout;
        try {
            connectionTimeout = setTimeout(() => {
                console.log('Info: Firefox WS connection timed out');
                handleConnectionFailure();
            }, 3000);

            socket = new WebSocket(WS_SERVER_URL);

            // Add error handler immediately to catch any connection errors
            socket.onerror = (error) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WS WebSocket error:', error);
                // We'll let the onclose event handle the reconnection
            };

            socket.onopen = () => {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WebSocket connection opened (WS fallback)!');
            isConnecting = false;
            isConnected = true;
            broadcastConnectionStatus();

            // Send browser information
            if (socket.readyState === WebSocket.OPEN) {
                const browserInfo = {
                    type: 'browserInfo',
                    browser: getBrowserName(),
                    version: getBrowserVersion(),
                    extensionVersion: runtime.getManifest().version
                };
                socket.send(JSON.stringify(browserInfo));
                console.log('Info: Sent browser info to Electron app');
                
                // Request rules from Electron app
                socket.send(JSON.stringify({ type: 'requestRules' }));
                console.log('Info: Requested rules from Electron app');
            }

            // Record successful connection
            storage.local.set({
                lastSuccessfulConnection: {
                    timestamp: Date.now(),
                    type: 'ws-fallback'
                }
            });
        };

        // Reuse the same message handler as WSS
        socket.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);

                // Handle both initial state and updates
                if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                    // Same handling as WSS
                    const newSourcesHash = generateSourcesHash(parsed.sources);
                    const previousSources = [...allSources];
                    const isInitialConnection = parsed.type === 'sourcesInitial';

                    allSources = parsed.sources;
                    console.log('Info: Firefox WS sources received:', allSources.length);

                    // Check for removed sources
                    const previousSourceIds = new Set(previousSources.map(s => s.sourceId));
                    const newSourceIds = new Set(parsed.sources.map(s => s.sourceId));

                    const removedSourceIds = [];
                    previousSourceIds.forEach(id => {
                        if (!newSourceIds.has(id)) {
                            removedSourceIds.push(id);
                        }
                    });

                    if (removedSourceIds.length > 0) {
                        console.log('Info: Detected removed sources:', removedSourceIds.join(', '));

                        getChunkedData('savedData', (savedData) => {
                            savedData = savedData || {};
                            let headersNeedUpdate = false;
                            const updatedSavedData = {...savedData};

                            for (const id in savedData) {
                                const entry = savedData[id];
                                if (entry.isDynamic && removedSourceIds.includes(entry.sourceId?.toString())) {
                                    console.log(`Info: Header "${entry.headerName}" was using removed source ${entry.sourceId}`);
                                    updatedSavedData[id] = {
                                        ...entry,
                                        sourceMissing: true
                                    };
                                    headersNeedUpdate = true;
                                }
                            }

                            if (headersNeedUpdate) {
                                console.log('Info: Updating header configuration to reflect removed sources');
                                setChunkedData('savedData', updatedSavedData, () => {
                                    if (runtime.lastError) {
                                        console.error('Error updating Firefox WS header configuration:', runtime.lastError);
                                    }
                                });
                            }
                        });
                    }

                    storage.local.set({ dynamicSources: allSources }, () => {
                        console.log('Info: Sources saved to Firefox storage (WS)');

                        if (isInitialConnection || newSourcesHash !== lastSourcesHash || !lastRulesUpdateTime) {
                            console.log('Info: Firefox WS initial connection or sources changed, updating network rules');
                            updateNetworkRules(allSources);

                            if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                                onSourcesReceived(allSources);
                            }

                            lastSourcesHash = newSourcesHash;
                            lastRulesUpdateTime = Date.now();
                        } else {
                            const timeSinceLastUpdate = Date.now() - lastRulesUpdateTime;
                            const FORCE_UPDATE_INTERVAL = 60 * 1000;
                            if (timeSinceLastUpdate > FORCE_UPDATE_INTERVAL) {
                                console.log('Info: Firefox WS periodic network rules update');
                                updateNetworkRules(allSources);
                                lastRulesUpdateTime = Date.now();
                            }
                        }

                        sendMessageSafely({
                            type: 'sourcesUpdated',
                            sources: allSources,
                            timestamp: Date.now(),
                            removedSourceIds: removedSourceIds.length > 0 ? removedSourceIds : undefined
                        }, (response, error) => {
                            // Ignore errors
                        });
                    });
                } else if (parsed.type === 'rules-update' && parsed.data) {
                    // Handle unified rules format
                    console.log('Info: Firefox WS WebSocket received unified rules update');
                    
                    // Store the full rules data
                    rules = parsed.data.rules || {};
                    
                    // Extract header rules for network rule updates
                    const headerRules = rules.header || [];
                    console.log('Info: Extracted', headerRules.length, 'header rules from unified format');
                    
                    // Convert header rules to savedData format for storage
                    const savedData = {};
                    headerRules.forEach((rule) => {
                        savedData[rule.id] = {
                            headerName: rule.headerName,
                            headerValue: rule.headerValue || '',
                            domains: rule.domains || [],
                            isDynamic: rule.isDynamic || false,
                            sourceId: rule.sourceId || '',
                            prefix: rule.prefix || '',
                            suffix: rule.suffix || '',
                            isResponse: rule.isResponse || false,
                            isEnabled: rule.isEnabled !== false,
                            tag: rule.tag || '',  // Include the tag field
                            createdAt: rule.createdAt || new Date().toISOString()
                        };
                    });
                    
                    // Save to storage using chunking to avoid quota errors
                    setChunkedData('savedData', savedData, () => {
                        if (runtime.lastError) {
                            console.error('Error saving Firefox WS header rules:', runtime.lastError);
                        } else {
                            console.log('Info: Firefox WS header rules saved to sync storage');
                        }
                        
                        // Update network rules with new header rules
                        updateNetworkRules(allSources);
                        
                        // Notify any open popups
                        sendMessageSafely({
                            type: 'rulesUpdated',
                            rules: rules,
                            timestamp: Date.now()
                        }, (response, error) => {
                            // Ignore errors - expected when no popup is listening
                        });
                    });
                    
                    // Store the full rules data for future use
                    storage.local.set({ rulesData: parsed.data }, () => {
                        console.log('Info: Firefox WS full rules data saved to local storage');
                    });
                } else if (parsed.type === 'videoRecordingStateChanged') {
                    // Handle video recording state change
                    console.log('Info: Firefox WS received video recording state change:', parsed.enabled);
                    
                    // Broadcast to any open popups
                    sendMessageSafely({
                        type: 'videoRecordingStateChanged',
                        enabled: parsed.enabled
                    }, (response, error) => {
                        // Ignore errors - expected when no popup is listening
                    });
                } else if (parsed.type === 'recordingHotkeyResponse' || parsed.type === 'recordingHotkeyChanged') {
                    // Handle recording hotkey response or hotkey change broadcast
                    console.log('Info: Firefox WS received recording hotkey:', parsed.hotkey, 'enabled:', parsed.enabled);
                    
                    // Store the new hotkey in storage for persistence
                    if (parsed.type === 'recordingHotkeyChanged') {
                        storage.local.set({ 
                            recordingHotkey: parsed.hotkey,
                            recordingHotkeyEnabled: parsed.enabled !== undefined ? parsed.enabled : true
                        }, () => {
                            console.log('Info: Firefox WS updated recording hotkey in storage:', parsed.hotkey, 'enabled:', parsed.enabled);
                        });
                    }
                    
                    // Broadcast to any open popups
                    sendMessageSafely({
                        type: 'recordingHotkeyResponse',
                        hotkey: parsed.hotkey,
                        enabled: parsed.enabled !== undefined ? parsed.enabled : true
                    }, (response, error) => {
                        // Ignore errors - expected when no popup is listening
                    });
                } else if (parsed.type === 'recordingHotkeyPressed') {
                    // Handle recording hotkey press from desktop app
                    console.log('Info: Firefox WS received recording hotkey press');
                    
                    // Broadcast to background script via storage event
                    storage.local.set({ 
                        hotkeyCommand: {
                            type: 'TOGGLE_RECORDING',
                            timestamp: Date.now()
                        }
                    }, () => {
                        console.log('Info: Firefox WS triggered recording toggle from hotkey');
                    });
                }
            } catch (err) {
                console.log('Info: Firefox WS error parsing message:', err);
            }
        };

        socket.onclose = (event) => {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WS closed');
            handleConnectionFailure();
        };
        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WS connection failed:', e.message);
            handleConnectionFailure();
        }
    });
}

/**
 * Check if WebSocket is connected
 * @returns {boolean} Connection status
 */
export function isWebSocketConnected() {
    return isConnected && socket && socket.readyState === WebSocket.OPEN;
}

/**
 * Get current sources
 * @returns {Array} Current sources array
 */
export function getCurrentSources() {
    return allSources;
}

/**
 * Get current rules
 * @returns {Object} Current rules object
 */
export function getCurrentRules() {
    return rules;
}

/**
 * Send data via WebSocket
 * @param {Object} data - Data to send
 * @returns {boolean} Success status
 */
export function sendViaWebSocket(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.log('Error sending via WebSocket:', error);
            return false;
        }
    }
    return false;
}

/**
 * Send data via WebSocket and wait for response
 * @param {Object} data - Data to send
 * @param {string} responseType - Expected response type
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Object>} Response data
 */

/**
 * Send workflow to app via WebSocket (simple version like browserInfo)
 * @param {Object} recording - Workflow data to send
 * @returns {boolean} Whether the message was sent successfully
 */
export function sendRecordingViaWebSocket(recording) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log('[WebSocket] Not connected, cannot send workflow');
        return false;
    }
    
    try {
        // Send workflow just like browserInfo
        const message = {
            type: 'saveWorkflow',
            recording: recording
        };
        
        socket.send(JSON.stringify(message));
        console.log('[WebSocket] Workflow sent to app');
        return true;
    } catch (error) {
        console.error('[WebSocket] Error sending workflow:', error);
        return false;
    }
}

// Export for use in other modules
export { sendRulesToElectronApp };