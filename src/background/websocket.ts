/**
 * WebSocket connection management
 */
declare const browser: typeof chrome | undefined;

import { runtime, storage, isSafari, isFirefox, isChrome, isEdge } from '../utils/browser-api.js';
import { adaptWebSocketUrl, safariPreCheck } from './safari-websocket-adapter';
import { updateNetworkRules } from './header-manager';
import { getChunkedData, setChunkedData } from '../utils/storage-chunking.js';
import { sendMessageWithCallback } from '../utils/messaging';

import type { Source, OnSourcesReceivedCallback, RulesData, HeaderRuleFromApp, LastSuccessfulConnection } from '../types/websocket';
import type { SavedDataMap } from '../types/header';
import { getBrowserAPI } from '../types/browser';

// Configuration
const WS_SERVER_URL = 'ws://127.0.0.1:59210';
const WSS_SERVER_URL = 'wss://127.0.0.1:59211'; // Secure endpoint for Firefox
const RECONNECT_DELAY_MS = 1000;

// State variables
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let isConnected = false;
let allSources: Source[] = [];
let rules: RulesData = {};
let welcomePageOpenedBySocket = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 6000;

// Debug socket state - exposed on globalThis for service workers
(globalThis as Record<string, unknown>)._debugWebSocket = () => {
    console.log('Socket:', socket);
    console.log('Socket state:', socket?.readyState);
    console.log('Is connected:', isConnected);
    console.log('WebSocket.OPEN:', WebSocket.OPEN);
};

/**
 * Function to generate a simple hash of sources to detect changes
 */
function generateSourcesHash(sources: Source[]): string {
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
 */
function getBrowserName(): string {
    if (isFirefox) return 'firefox';
    if (isChrome) return 'chrome';
    if (isEdge) return 'edge';
    if (isSafari) return 'safari';
    return 'unknown';
}

/**
 * Get browser version
 */
function getBrowserVersion(): string {
    try {
        const _manifest = runtime.getManifest();
        // Try to get browser version from user agent
        if (navigator && navigator.userAgent) {
            const ua = navigator.userAgent;
            let match: RegExpMatchArray | null = null;

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
 */
function sendRulesToElectronApp(rulesData: unknown): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'rules-update',
            data: rulesData
        }));
        console.log('Info: Sent updated rules to Electron app');
    }
}

// Function to broadcast connection status to any open popups
function broadcastConnectionStatus(): void {
    sendMessageWithCallback({
        type: 'connectionStatus',
        connected: isConnected
    }, (_response, _error) => {
        // Ignore errors - this is expected when no popup is open
    });
}

/**
 * Main WebSocket connection function
 */
export function connectWebSocket(onSourcesReceived?: OnSourcesReceivedCallback): Promise<boolean> {
    // Check if already connected
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Info: WebSocket already connected');
        return Promise.resolve(true);
    }

    // Check if connection is already in progress
    if (isConnecting) {
        console.log('Info: Connection already in progress, skipping duplicate attempt');
        return Promise.resolve(false);
    }

    isConnecting = true;

    // Return a Promise for async/await compatibility
    return new Promise<boolean>((resolve, _reject) => {
        // Store original callback and wrap it
        const wrappedCallback: OnSourcesReceivedCallback = (sources: Source[]) => {
            if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                onSourcesReceived(sources);
            }
            resolve(true);
        };

        // Handle browser-specific connection logic
        if (isFirefox) {
            connectWebSocketFirefox(wrappedCallback);
        } else if (isSafari) {
            // Safari needs pre-check
            safariPreCheck(WS_SERVER_URL).then(canConnect => {
                if (canConnect) {
                    connectStandardWebSocket(adaptWebSocketUrl(WS_SERVER_URL), wrappedCallback);
                } else {
                    console.log('Info: Safari pre-check failed, will retry');
                    handleConnectionFailure();
                    resolve(false);
                }
            });
        } else {
            // Chrome/Edge - standard connection
            connectStandardWebSocket(WS_SERVER_URL, wrappedCallback);
        }
    });
}

/**
 * Handle connection failure and schedule reconnection
 */
function handleConnectionFailure(): void {
    socket = null;
    isConnecting = false;
    isConnected = false;
    broadcastConnectionStatus();

    // Clear any existing reconnect timer
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
    }

    // Implement exponential backoff with max delay
    reconnectAttempts++;
    const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);

    console.log(`Info: Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`);
    reconnectTimer = setTimeout(() => {
        console.log('Info: Attempting WebSocket reconnection');
        connectWebSocket();
    }, delay);
}

/**
 * Check if the WebSocket server is reachable
 */
async function checkServerReachable(wsUrl: string): Promise<boolean> {
    try {
        // Convert ws:// to http:// for the check
        const httpUrl = wsUrl.replace('ws://', 'http://').replace('wss://', 'https://');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 500); // Quick timeout

        await fetch(httpUrl, {
            method: 'GET',
            signal: controller.signal,
            mode: 'no-cors' // Avoid CORS issues for the check
        });

        clearTimeout(timeoutId);
        return true;
    } catch (error) {
        // Server is not reachable - this is expected when app is closed
        return false;
    }
}

/**
 * Handle incoming WebSocket messages for sources
 */
function handleSourcesMessage(
    parsed: { type: string; sources: Source[] },
    onSourcesReceived: OnSourcesReceivedCallback | undefined
): void {
    const newSourcesHash = generateSourcesHash(parsed.sources);
    const previousSources = [...allSources];
    const isInitialConnection = parsed.type === 'sourcesInitial';

    allSources = parsed.sources;
    console.log('Info: Sources received:', allSources.length, 'at', new Date().toISOString());

    const previousSourceIds = new Set(previousSources.map(s => s.sourceId));
    const newSourceIds = new Set(parsed.sources.map(s => s.sourceId || (s as Source & { locationId?: string }).locationId));

    const removedSourceIds: string[] = [];
    previousSourceIds.forEach(id => {
        if (!newSourceIds.has(id)) {
            removedSourceIds.push(id);
        }
    });

    if (removedSourceIds.length > 0) {
        console.log('Info: Detected removed sources:', removedSourceIds.join(', '));

        getChunkedData('savedData', (savedData: SavedDataMap | null) => {
            savedData = savedData || {};
            let headersNeedUpdate = false;
            const updatedSavedData: SavedDataMap = { ...savedData };

            for (const id in savedData) {
                const entry = savedData[id];
                if (entry.isDynamic && removedSourceIds.includes(entry.sourceId?.toString() || '')) {
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
                        console.error('Error updating header configuration:', runtime.lastError);
                    }
                });
            }
        });
    }

    storage.local.set({ dynamicSources: allSources }, () => {
        console.log('Info: Sources saved to storage');

        if (isInitialConnection || newSourcesHash !== lastSourcesHash || !lastRulesUpdateTime) {
            console.log('Info: Initial connection or sources changed, updating network rules');
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
                console.log('Info: Periodic network rules update');
                updateNetworkRules(allSources);
                lastRulesUpdateTime = Date.now();
            }
        }

        sendMessageWithCallback({
            type: 'sourcesUpdated',
            sources: allSources,
            timestamp: Date.now(),
            removedSourceIds: removedSourceIds.length > 0 ? removedSourceIds : undefined
        }, (_response, _error) => {
            // Ignore errors
        });
    });
}

/**
 * Handle incoming rules-update messages
 */
function handleRulesUpdateMessage(parsed: { data: { rules: RulesData } }): void {
    console.log('Info: WebSocket received unified rules update');

    rules = parsed.data.rules || {};

    const headerRules: HeaderRuleFromApp[] = (rules as RulesData & { header?: HeaderRuleFromApp[] }).header || [];
    console.log('Info: Extracted', headerRules.length, 'header rules from unified format');

    const savedData: SavedDataMap = {};
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
            tag: rule.tag || '',
            createdAt: rule.createdAt || new Date().toISOString()
        };
    });

    setChunkedData('savedData', savedData, () => {
        if (runtime.lastError) {
            console.error('Error saving header rules:', runtime.lastError);
        } else {
            console.log('Info: Header rules saved to sync storage');
        }

        updateNetworkRules(allSources);

        sendMessageWithCallback({
            type: 'rulesUpdated',
            rules: rules,
            timestamp: Date.now()
        }, (_response, _error) => {
            // Ignore errors
        });
    });

    storage.local.set({ rulesData: parsed.data }, () => {
        console.log('Info: Full rules data saved to local storage');
    });
}

/**
 * Handle other WebSocket message types (hotkeys, video recording, etc.)
 */
function handleOtherMessages(parsed: Record<string, unknown>): void {
    if (parsed.type === 'videoRecordingStateChanged') {
        console.log('Info: WebSocket received video recording state change:', parsed.enabled);
        sendMessageWithCallback({
            type: 'videoRecordingStateChanged',
            enabled: parsed.enabled as boolean
        }, (_response, _error) => {});
    } else if (parsed.type === 'recordingHotkeyResponse' || parsed.type === 'recordingHotkeyChanged') {
        console.log('Info: WebSocket received recording hotkey:', parsed.hotkey, 'enabled:', parsed.enabled);

        if (parsed.type === 'recordingHotkeyChanged') {
            storage.local.set({
                recordingHotkey: parsed.hotkey,
                recordingHotkeyEnabled: parsed.enabled !== undefined ? parsed.enabled : true
            }, () => {
                console.log('Info: Updated recording hotkey in storage:', parsed.hotkey, 'enabled:', parsed.enabled);
            });
        }

        sendMessageWithCallback({
            type: 'recordingHotkeyResponse',
            hotkey: parsed.hotkey as string,
            enabled: parsed.enabled !== undefined ? parsed.enabled as boolean : true
        }, (_response, _error) => {});
    } else if (parsed.type === 'recordingHotkeyPressed') {
        console.log('Info: WebSocket received recording hotkey press');
        storage.local.set({
            hotkeyCommand: {
                type: 'TOGGLE_RECORDING',
                timestamp: Date.now()
            }
        }, () => {
            console.log('Info: Triggered recording toggle from hotkey');
        });
    }
}

/**
 * Create a message handler for WebSocket messages
 */
function createMessageHandler(onSourcesReceived: OnSourcesReceivedCallback | undefined): (event: MessageEvent) => void {
    return (event: MessageEvent) => {
        try {
            const parsed = JSON.parse(event.data as string);

            if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                handleSourcesMessage(parsed, onSourcesReceived);
            } else if (parsed.type === 'rules-update' && parsed.data) {
                handleRulesUpdateMessage(parsed);
            } else {
                handleOtherMessages(parsed);
            }
        } catch (err) {
            console.log('Info: Error parsing message from WebSocket:', err);
        }
    };
}

/**
 * Send browser info and request rules after connection
 */
function sendBrowserInfoAndRequestRules(): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const browserInfo = {
            type: 'browserInfo',
            browser: getBrowserName(),
            version: getBrowserVersion(),
            extensionVersion: runtime.getManifest().version
        };
        socket.send(JSON.stringify(browserInfo));
        console.log('Info: Sent browser info to Electron app');

        socket.send(JSON.stringify({ type: 'requestRules' }));
        console.log('Info: Requested rules from Electron app');
    }
}

/**
 * Standard WebSocket connection implementation
 */
function connectStandardWebSocket(url: string, onSourcesReceived: OnSourcesReceivedCallback | undefined): void {
    console.log('Info: Starting WebSocket connection using URL:', url);

    checkServerReachable(url).then(isReachable => {
        if (!isReachable) {
            console.log('Info: WebSocket server not reachable, will retry later');
            handleConnectionFailure();
            return;
        }

        let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
            connectionTimeout = setTimeout(() => {
                console.log('Info: WebSocket connection timed out');
                handleConnectionFailure();
            }, 3000);

            socket = new WebSocket(url);

            socket.onerror = (_error: Event) => {
                clearTimeout(connectionTimeout);
                console.log('Info: WebSocket connection issue detected');
            };

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: WebSocket connection opened successfully!');
                isConnecting = false;
                isConnected = true;
                reconnectAttempts = 0;
                broadcastConnectionStatus();
                sendBrowserInfoAndRequestRules();
            };

            socket.onmessage = createMessageHandler(onSourcesReceived);

            socket.onclose = (_event: CloseEvent) => {
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
 */
function connectWebSocketFirefox(onSourcesReceived: OnSourcesReceivedCallback | undefined): void {
    storage.local.get(['lastSuccessfulConnection', 'certificateAccepted', 'setupCompleted'], (result: Record<string, unknown>) => {
        const lastConnection = result.lastSuccessfulConnection as LastSuccessfulConnection | undefined;
        const certificateAccepted = result.certificateAccepted as boolean | undefined;
        const setupCompleted = result.setupCompleted as boolean | undefined;

        if (certificateAccepted || setupCompleted) {
            console.log('Info: Certificate already accepted or setup completed, skipping welcome page');

            if (lastConnection && lastConnection.type === 'ws-fallback' &&
                Date.now() - lastConnection.timestamp < 86400000) {
                console.log('Info: Using previous successful WS connection');
                connectFirefoxWs(onSourcesReceived);
            } else {
                connectFirefoxWss(onSourcesReceived);
            }
        } else if (!certificateAccepted && !welcomePageOpenedBySocket) {
            welcomePageOpenedBySocket = true;
            console.log('Info: First time user detected, showing welcome page');

            if (typeof browser !== 'undefined' && browser!.tabs) {
                const welcomePageUrl = browser!.runtime.getURL('welcome.html');

                (browser!.tabs.query({}) as unknown as Promise<chrome.tabs.Tab[]>).then((tabsList: chrome.tabs.Tab[]) => {
                    const welcomeTabs = tabsList.filter((tab: chrome.tabs.Tab) =>
                        tab.url === welcomePageUrl ||
                        (tab.url && tab.url.startsWith(welcomePageUrl))
                    );

                    if (welcomeTabs.length > 0) {
                        console.log('Info: Welcome page already exists, focusing it');
                        (browser!.tabs.update(welcomeTabs[0].id!, { active: true }) as unknown as Promise<chrome.tabs.Tab>).catch((err: Error) => {
                            console.log('Info: Error focusing existing welcome tab:', err.message);
                        });
                    } else {
                        console.log('Info: Opening Firefox welcome page');
                        (browser!.tabs.create({
                            url: welcomePageUrl,
                            active: true
                        }) as unknown as Promise<chrome.tabs.Tab>).then((tab: chrome.tabs.Tab) => {
                            console.log('Info: Opened Firefox welcome tab:', tab.id);
                        }).catch((err: Error) => {
                            console.log('Info: Failed to open welcome page:', err.message);
                        });
                    }
                }).catch((err: Error) => {
                    console.log('Info: Error checking for existing welcome tabs:', err.message);
                });
            }

            connectFirefoxWss(onSourcesReceived);
        } else {
            if (lastConnection && lastConnection.type === 'ws-fallback' &&
                Date.now() - lastConnection.timestamp < 86400000) {
                console.log('Info: Using previous successful WS connection');
                connectFirefoxWs(onSourcesReceived);
            } else {
                connectFirefoxWss(onSourcesReceived);
            }
        }
    });
}

/**
 * Connect to WSS endpoint for Firefox
 */
function connectFirefoxWss(onSourcesReceived: OnSourcesReceivedCallback | undefined): void {
    console.log('Info: Starting Firefox WebSocket connection using WSS');

    checkServerReachable(WSS_SERVER_URL).then(isReachable => {
        if (!isReachable) {
            console.log('Info: Firefox WSS server not reachable, trying WS fallback');
            connectFirefoxWs(onSourcesReceived);
            return;
        }

        let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
            connectionTimeout = setTimeout(() => {
                console.log('Info: Firefox WebSocket connection timed out');
                handleConnectionFailure();
            }, 3000);

            console.log('Info: Connecting to secure endpoint:', WSS_SERVER_URL);
            socket = new WebSocket(WSS_SERVER_URL);

            socket.onerror = (_error: Event) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WebSocket error');
            };

            console.log('Info: Firefox WSS connection created, readyState:', socket.readyState);

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox secure WebSocket connection opened successfully!');
                isConnecting = false;
                isConnected = true;
                reconnectAttempts = 0;
                broadcastConnectionStatus();
                sendBrowserInfoAndRequestRules();

                storage.local.set({
                    lastSuccessfulConnection: {
                        timestamp: Date.now(),
                        type: 'wss'
                    },
                    certificateAccepted: true
                });
            };

            socket.onmessage = createMessageHandler(onSourcesReceived);

            socket.onclose = (event: CloseEvent) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WSS WebSocket closed with code:', event.code);

                if (event.code === 1015) {
                    console.log('Info: Firefox TLS handshake failure detected');

                    storage.local.get(['certificateAccepted'], (certResult: Record<string, unknown>) => {
                        if (!certResult.certificateAccepted) {
                            console.log('Info: Firefox certificate not accepted, prompting user');
                            storage.local.set({ certificateAccepted: false });
                        }
                    });

                    console.log('Info: Firefox attempting fallback to regular WebSocket');
                    connectFirefoxWs(onSourcesReceived);
                } else {
                    handleConnectionFailure();
                }
            };
        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WSS connection failed:', (e as Error).message);
            console.log('Info: Firefox falling back to regular WebSocket');
            connectFirefoxWs(onSourcesReceived);
        }
    });
}

/**
 * Connect to WS endpoint for Firefox (fallback)
 */
function connectFirefoxWs(onSourcesReceived: OnSourcesReceivedCallback | undefined): void {
    console.log('Info: Starting Firefox WebSocket connection using WS (fallback)');

    checkServerReachable(WS_SERVER_URL).then(isReachable => {
        if (!isReachable) {
            console.log('Info: Firefox WS server not reachable, will retry later');
            handleConnectionFailure();
            return;
        }

        let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
            connectionTimeout = setTimeout(() => {
                console.log('Info: Firefox WS connection timed out');
                handleConnectionFailure();
            }, 3000);

            socket = new WebSocket(WS_SERVER_URL);

            socket.onerror = (_error: Event) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WS WebSocket error');
            };

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WebSocket connection opened (WS fallback)!');
                isConnecting = false;
                isConnected = true;
                reconnectAttempts = 0;
                broadcastConnectionStatus();
                sendBrowserInfoAndRequestRules();

                storage.local.set({
                    lastSuccessfulConnection: {
                        timestamp: Date.now(),
                        type: 'ws-fallback'
                    }
                });
            };

            // Create message handler with extra handling for certificateTrustChanged
            socket.onmessage = (event: MessageEvent) => {
                try {
                    const parsed = JSON.parse(event.data as string);

                    if ((parsed.type === 'sourcesInitial' || parsed.type === 'sourcesUpdated') && Array.isArray(parsed.sources)) {
                        handleSourcesMessage(parsed, onSourcesReceived);
                    } else if (parsed.type === 'rules-update' && parsed.data) {
                        handleRulesUpdateMessage(parsed);
                    } else if (parsed.type === 'certificateTrustChanged' && parsed.trusted) {
                        checkServerReachable(WSS_SERVER_URL).then(reachable => {
                            if (reachable) {
                                console.log('Info: Certificate trusted and WSS reachable, upgrading to WSS');
                                storage.local.remove(['lastSuccessfulConnection'], () => {
                                    if (socket) { socket.close(); }
                                });
                            } else {
                                console.log('Info: Certificate trusted in OS but WSS not reachable in Firefox, staying on WS');
                            }
                        });
                    } else {
                        handleOtherMessages(parsed);
                    }
                } catch (err) {
                    console.log('Info: Firefox WS error parsing message:', err);
                }
            };

            socket.onclose = (_event: CloseEvent) => {
                clearTimeout(connectionTimeout);
                console.log('Info: Firefox WS closed');
                handleConnectionFailure();
            };
        } catch (e) {
            clearTimeout(connectionTimeout);
            console.log('Info: Firefox WS connection failed:', (e as Error).message);
            handleConnectionFailure();
        }
    });
}

/**
 * Check if WebSocket is connected
 */
export function isWebSocketConnected(): boolean {
    return isConnected && socket !== null && socket.readyState === WebSocket.OPEN;
}

/**
 * Get current reconnect attempts count
 */
export function getReconnectAttempts(): number {
    return reconnectAttempts;
}

/**
 * Get current sources
 */
export function getCurrentSources(): Source[] {
    return allSources;
}

/**
 * Get current rules
 */
export function getCurrentRules(): RulesData {
    return rules;
}

/**
 * Send data via WebSocket
 */
export function sendViaWebSocket(data: Record<string, unknown>): boolean {
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
 * Send workflow to app via WebSocket (simple version like browserInfo)
 */
export function sendRecordingViaWebSocket(recording: unknown): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log('[WebSocket] Not connected, cannot send workflow');
        return false;
    }

    try {
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
