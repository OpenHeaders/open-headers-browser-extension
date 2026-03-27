/**
 * WebSocket connection management
 */
import { runtime, storage, isSafari, isFirefox, isChrome, isEdge } from '../utils/browser-api.js';
import { adaptWebSocketUrl, safariPreCheck } from './safari-websocket-adapter';
import { getChunkedData, setChunkedData } from '../utils/storage-chunking.js';
import { sendMessageWithCallback } from '../utils/messaging';
import { logger } from '../utils/logger';
import { generateSourcesHash } from './modules/utils';
import { scheduleUpdate } from './modules/rule-engine';

import type { Source, OnSourcesReceivedCallback, RulesData, HeaderRuleFromApp } from '../types/websocket';
import type { SavedDataMap } from '../types/header';

// Configuration
const WS_SERVER_URL = 'ws://127.0.0.1:59210';
const RECONNECT_DELAY_MS = 1000;

// State variables
let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let isConnected = false;
let allSources: Source[] = [];
let rules: RulesData = {};
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 6000;

// Debug socket state - exposed on globalThis for service workers
(globalThis as Record<string, unknown>)._debugWebSocket = () => {
    logger.debug('WebSocket', 'Socket:', socket);
    logger.debug('WebSocket', 'Socket state:', socket?.readyState);
    logger.debug('WebSocket', 'Is connected:', isConnected);
    logger.debug('WebSocket', 'WebSocket.OPEN:', WebSocket.OPEN);
};

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
        logger.debug('WebSocket', 'Could not determine browser version');
    }
    return '';
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
        logger.debug('WebSocket', 'WebSocket already connected');
        return Promise.resolve(true);
    }

    // Check if connection is already in progress
    if (isConnecting) {
        logger.debug('WebSocket', 'Connection already in progress, skipping duplicate attempt');
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
        if (isSafari) {
            // Safari needs pre-check
            safariPreCheck(WS_SERVER_URL).then(canConnect => {
                if (canConnect) {
                    connectStandardWebSocket(adaptWebSocketUrl(WS_SERVER_URL), wrappedCallback);
                } else {
                    logger.info('WebSocket', 'Safari pre-check failed, will retry');
                    handleConnectionFailure();
                    resolve(false);
                }
            });
        } else {
            // Standard connection (Chrome/Edge/Firefox)
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

    logger.debug('WebSocket', `Scheduling reconnection attempt ${reconnectAttempts} in ${delay}ms`);
    reconnectTimer = setTimeout(() => {
        logger.debug('WebSocket', 'Attempting WebSocket reconnection');
        void connectWebSocket();
    }, delay);
}

/**
 * Check if the WebSocket server is reachable
 */
async function checkServerReachable(wsUrl: string): Promise<boolean> {
    try {
        // Convert ws:// to http:// for the check
        const httpUrl = wsUrl.replace('ws://', 'http://');
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
    logger.info('WebSocket', 'Sources received:', allSources.length, 'at', new Date().toISOString());

    const previousSourceIds = new Set(previousSources.map(s => s.sourceId));
    const newSourceIds = new Set(parsed.sources.map(s => s.sourceId || (s as Source & { locationId?: string }).locationId));

    const removedSourceIds: string[] = [];
    previousSourceIds.forEach(id => {
        if (!newSourceIds.has(id)) {
            removedSourceIds.push(id);
        }
    });

    if (removedSourceIds.length > 0) {
        logger.info('WebSocket', 'Detected removed sources:', removedSourceIds.join(', '));

        getChunkedData('savedData', (savedData: SavedDataMap | null) => {
            savedData = savedData || {};
            let headersNeedUpdate = false;
            const updatedSavedData: SavedDataMap = { ...savedData };

            for (const id in savedData) {
                const entry = savedData[id];
                if (entry.isDynamic && removedSourceIds.includes(entry.sourceId?.toString() || '')) {
                    logger.info('WebSocket', `Header "${entry.headerName}" was using removed source ${entry.sourceId}`);
                    updatedSavedData[id] = {
                        ...entry,
                        sourceMissing: true
                    };
                    headersNeedUpdate = true;
                }
            }

            if (headersNeedUpdate) {
                logger.info('WebSocket', 'Updating header configuration to reflect removed sources');
                setChunkedData('savedData', updatedSavedData, () => {
                    if (runtime.lastError) {
                        logger.error('WebSocket', 'Error updating header configuration:', runtime.lastError);
                    }
                });
            }
        });
    }

    storage.local.set({ dynamicSources: allSources }, () => {
        logger.debug('WebSocket', 'Sources saved to storage');

        if (isInitialConnection || newSourcesHash !== lastSourcesHash || !lastRulesUpdateTime) {
            scheduleUpdate('sources', { sources: allSources });

            if (onSourcesReceived && typeof onSourcesReceived === 'function') {
                onSourcesReceived(allSources);
            }

            lastSourcesHash = newSourcesHash;
            lastRulesUpdateTime = Date.now();
        } else {
            const timeSinceLastUpdate = Date.now() - lastRulesUpdateTime;
            const FORCE_UPDATE_INTERVAL = 60 * 1000;
            if (timeSinceLastUpdate > FORCE_UPDATE_INTERVAL) {
                scheduleUpdate('periodic', { sources: allSources });
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
    logger.info('WebSocket', 'WebSocket received unified rules update');

    rules = parsed.data.rules || {};

    const headerRules: HeaderRuleFromApp[] = (rules as RulesData & { header?: HeaderRuleFromApp[] }).header || [];
    logger.info('WebSocket', 'Extracted', headerRules.length, 'header rules from unified format');

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
            logger.error('WebSocket', 'Error saving header rules:', runtime.lastError);
        } else {
            logger.debug('WebSocket', 'Header rules saved to sync storage');
        }

        scheduleUpdate('rules');

        sendMessageWithCallback({
            type: 'rulesUpdated',
            rules: rules,
            timestamp: Date.now()
        }, (_response, _error) => {
            // Ignore errors
        });
    });

    storage.local.set({ rulesData: parsed.data }, () => {
        logger.debug('WebSocket', 'Full rules data saved to local storage');
    });
}

/**
 * Handle other WebSocket message types (hotkeys, video recording, etc.)
 */
function handleOtherMessages(parsed: Record<string, unknown>): void {
    if (parsed.type === 'videoRecordingStateChanged') {
        logger.info('WebSocket', 'WebSocket received video recording state change:', parsed.enabled);
        sendMessageWithCallback({
            type: 'videoRecordingStateChanged',
            enabled: parsed.enabled as boolean
        }, (_response, _error) => {});
    } else if (parsed.type === 'recordingHotkeyResponse' || parsed.type === 'recordingHotkeyChanged') {
        logger.info('WebSocket', 'WebSocket received recording hotkey:', parsed.hotkey, 'enabled:', parsed.enabled);

        if (parsed.type === 'recordingHotkeyChanged') {
            storage.local.set({
                recordingHotkey: parsed.hotkey,
                recordingHotkeyEnabled: parsed.enabled !== undefined ? parsed.enabled : true
            }, () => {
                logger.info('WebSocket', 'Updated recording hotkey in storage:', parsed.hotkey, 'enabled:', parsed.enabled);
            });
        }

        sendMessageWithCallback({
            type: 'recordingHotkeyResponse',
            hotkey: parsed.hotkey as string,
            enabled: parsed.enabled !== undefined ? parsed.enabled as boolean : true
        }, (_response, _error) => {});
    } else if (parsed.type === 'recordingHotkeyPressed') {
        logger.info('WebSocket', 'WebSocket received recording hotkey press');
        storage.local.set({
            hotkeyCommand: {
                type: 'TOGGLE_RECORDING',
                timestamp: Date.now()
            }
        }, () => {
            logger.info('WebSocket', 'Triggered recording toggle from hotkey');
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
            logger.warn('WebSocket', 'Error parsing message from WebSocket:', err);
        }
    };
}

/**
 * Send browser identification info after connection
 */
function sendBrowserInfo(): void {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: 'browserInfo',
            browser: getBrowserName(),
            version: getBrowserVersion(),
            extensionVersion: runtime.getManifest().version
        }));
        logger.info('WebSocket', 'Sent browser info to Electron app');
    }
}

/**
 * Standard WebSocket connection implementation
 */
function connectStandardWebSocket(url: string, onSourcesReceived: OnSourcesReceivedCallback | undefined): void {
    const log = reconnectAttempts === 0 ? logger.info : logger.debug;
    log.call(logger, 'WebSocket', 'Starting WebSocket connection using URL:', url);

    checkServerReachable(url).then(isReachable => {
        if (!isReachable) {
            logger.debug('WebSocket', 'WebSocket server not reachable, will retry later');
            handleConnectionFailure();
            return;
        }

        let connectionTimeout: ReturnType<typeof setTimeout> | undefined;
        try {
            connectionTimeout = setTimeout(() => {
                logger.debug('WebSocket', 'WebSocket connection timed out');
                handleConnectionFailure();
            }, 3000);

            socket = new WebSocket(url);

            socket.onerror = (_error: Event) => {
                clearTimeout(connectionTimeout);
                logger.debug('WebSocket', 'WebSocket connection issue detected');
            };

            socket.onopen = () => {
                clearTimeout(connectionTimeout);
                logger.info('WebSocket', 'WebSocket connection opened successfully!');
                isConnecting = false;
                isConnected = true;
                reconnectAttempts = 0;
                broadcastConnectionStatus();
                sendBrowserInfo();
            };

            socket.onmessage = createMessageHandler(onSourcesReceived);

            socket.onclose = (_event: CloseEvent) => {
                clearTimeout(connectionTimeout);
                logger.info('WebSocket', 'WebSocket closed');
                handleConnectionFailure();
            };
        } catch (e) {
            clearTimeout(connectionTimeout);
            logger.debug('WebSocket', 'Error creating WebSocket connection');
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
 * Check if a WebSocket connection attempt is in progress
 */
export function isWebSocketConnecting(): boolean {
    return isConnecting;
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
 * Send data via WebSocket
 */
export function sendViaWebSocket(data: Record<string, unknown>): boolean {
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify(data));
            return true;
        } catch (error) {
            logger.error('WebSocket', 'Error sending via WebSocket:', error);
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
        logger.info('WebSocket', 'Not connected, cannot send workflow');
        return false;
    }

    try {
        const message = {
            type: 'saveWorkflow',
            recording: recording
        };

        socket.send(JSON.stringify(message));
        logger.info('WebSocket', 'Workflow sent to app');
        return true;
    } catch (error) {
        logger.error('WebSocket', 'Error sending workflow:', error);
        return false;
    }
}
