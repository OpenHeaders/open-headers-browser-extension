/**
 * Main Message Handler - Handles non-recording messages
 */

import { tabs, runtime as browserRuntime } from '../../utils/browser-api.js';
import { openWelcomePageDirectly } from './welcome-page';
import { clearAllTracking, getActiveRulesForTab } from './request-tracker';
import { generateSourcesHash, generateSavedDataHash } from './utils';
import { getChunkedData, setChunkedData } from '../../utils/storage-chunking.js';
import { setSourcesFromApp } from './sources-store';

import type { MessageHandlerContext, SendResponse } from '../../types/browser';
import type { SavedDataMap } from '../../types/header';
import type { Source } from '../../types/websocket';
import { logger } from '../../utils/logger';

const browserAPI = { runtime: browserRuntime };

/**
 * Create a safe response function that checks if the channel is still open
 */
function createSafeResponse(sendResponse: SendResponse): SendResponse {
    return (data: unknown) => {
        try {
            sendResponse(data);
        } catch (error) {
            logger.info('MessageHandler', 'Could not send response, channel closed');
        }
    };
}

/**
 * Handle general messages (non-recording)
 */
export function handleGeneralMessage(
    message: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    sendResponse: SendResponse,
    ctx: MessageHandlerContext
): boolean | void {
    const safeResponse = createSafeResponse(sendResponse);

    const {
        getCurrentSources,
        isWebSocketConnected,
        sendViaWebSocket,
        scheduleUpdate,
        revalidateTrackedRequests,
        updateBadgeCallback,
        setLastSourcesHash,
        setLastRulesUpdateTime,
        setLastSavedDataHash
    } = ctx;

    // Handle each message type
    try {
        if (message.type === 'popupOpen') {
            logger.info('MessageHandler', 'Popup opened, sending current sources');
            // Send current sources to popup immediately
            const response = {
                type: 'sourcesUpdated',
                sources: getCurrentSources(),
                connected: isWebSocketConnected()
            };
            safeResponse(response);
        } else if (message.type === 'checkConnection') {
            // Respond with current connection status
            const connected = isWebSocketConnected();
            safeResponse({ connected: connected });
        } else if (message.type === 'getDynamicSources') {
            // Get the current sources and send them back
            const currentSources = getCurrentSources();
            const connected = isWebSocketConnected();

            // Get current header entries using chunked data retrieval
            getChunkedData('savedData', (savedData: SavedDataMap | null) => {
                safeResponse({
                    sources: currentSources,
                    isConnected: connected,
                    rulesFromApp: connected,  // When connected, rules always come from app
                    headerEntries: savedData || {}
                });
            });

            // Return true to indicate async response
            return true;
        } else if (message.type === 'rulesUpdated') {
            // Handle rule update request (for enable/disable toggle)
            logger.info('MessageHandler', 'Rule update requested');

            // First revalidate tracked requests
            revalidateTrackedRequests().then(() => {
                // Update network rules with the current sources
                scheduleUpdate('rulesUpdated', { immediate: true });

                // Update tracking variables
                setLastSourcesHash(generateSourcesHash(getCurrentSources()));
                setLastRulesUpdateTime(Date.now());

                // Force immediate badge update
                updateBadgeCallback();

                // Send response
                safeResponse({ success: true });
            }).catch((error: Error) => {
                logger.info('MessageHandler', 'Error updating rules:', error.message);
                safeResponse({ success: false, error: error.message });
            });

            // Return true to indicate async response
            return true;
        } else if (message.type === 'configurationImported') {
            // Handle configuration import
            logger.info('MessageHandler', 'Configuration imported, updating rules');

            // Clear all request tracking when importing new config
            clearAllTracking();
            logger.info('MessageHandler', 'Cleared all request tracking after configuration import');

            // If dynamic sources were provided, update the store
            if (message.dynamicSources && Array.isArray(message.dynamicSources)) {
                setSourcesFromApp(message.dynamicSources as Source[]);
                logger.info('MessageHandler', 'Imported dynamic sources saved:', (message.dynamicSources as Source[]).length);
            }

            // Update network rules with the current sources
            let dynamicSources: Source[] = (message.dynamicSources as Source[]) || [];

            // If no sources in the message, get them from getCurrentSources()
            if (dynamicSources.length === 0) {
                dynamicSources = getCurrentSources();
            }

            // Apply the rules
            scheduleUpdate('import', { immediate: true, sources: dynamicSources });

            // Update tracking variables
            setLastSourcesHash(generateSourcesHash(dynamicSources));
            setLastRulesUpdateTime(Date.now());

            // Update saved data hash if available
            if (message.savedData) {
                setLastSavedDataHash(generateSavedDataHash(message.savedData as SavedDataMap));
            }

            // Update badge for current tab
            updateBadgeCallback();

            // Send response
            safeResponse({ success: true });
        } else if (message.type === 'importConfiguration') {
            // Handle configuration import in the background script
            logger.info('MessageHandler', 'Handling configuration import in background');

            try {
                const config = message.config as { savedData?: SavedDataMap; dynamicSources?: Source[] };
                const { savedData, dynamicSources } = config;

                if (!savedData) {
                    safeResponse({ success: false, error: 'Invalid configuration: savedData missing' });
                    return true;
                }

                // Save data to storage using chunked storage (preserve empty values as-is)
                setChunkedData('savedData', savedData, () => {
                    if (browserAPI.runtime.lastError) {
                        logger.info('MessageHandler', 'Error saving savedData:', (browserAPI.runtime.lastError as chrome.runtime.LastError).message);
                        safeResponse({ success: false, error: 'Failed to save configuration' });
                        return;
                    }

                    // Handle dynamic sources - preserve existing ones if import doesn't include any
                    if (dynamicSources && Array.isArray(dynamicSources) && dynamicSources.length > 0) {
                        // Import has dynamic sources, write through the store
                        setSourcesFromApp(dynamicSources);
                        logger.info('MessageHandler', 'Configuration imported successfully with dynamic sources');

                        // Clear all request tracking when importing new config
                        clearAllTracking();
                        logger.info('MessageHandler', 'Cleared all request tracking after configuration import');

                        // Update network rules with the imported sources
                        scheduleUpdate('import', { immediate: true, sources: dynamicSources });

                        // Update tracking variables
                        setLastSourcesHash(generateSourcesHash(dynamicSources));
                        setLastRulesUpdateTime(Date.now());
                        setLastSavedDataHash(generateSavedDataHash(savedData));

                        // Update badge for current tab
                        updateBadgeCallback();

                        // Send success response
                        safeResponse({ success: true });
                    } else {
                        // No dynamic sources in import, preserve existing ones
                        logger.info('MessageHandler', 'Configuration imported successfully (preserving existing dynamic sources)');

                        // Clear all request tracking
                        clearAllTracking();

                        // Update network rules with existing sources
                        scheduleUpdate('import', { immediate: true });

                        // Update tracking variables
                        setLastRulesUpdateTime(Date.now());
                        setLastSavedDataHash(generateSavedDataHash(savedData));

                        // Update badge
                        updateBadgeCallback();

                        // Send success response
                        safeResponse({ success: true });
                    }
                });

            } catch (error) {
                logger.info('MessageHandler', 'Import error in background:', (error as Error).message);
                safeResponse({ success: false, error: (error as Error).message });
            }

            // Return true to indicate async response
            return true;
        } else if (message.type === 'sourcesUpdated') {
            logger.info('MessageHandler', 'Background received sources update notification:',
                message.sources ? (message.sources as Source[]).length : 0, 'sources at',
                new Date(message.timestamp as number).toISOString());

            safeResponse({ acknowledged: true });
        } else if (message.type === 'openWelcomePage') {
            logger.info('MessageHandler', 'Ignoring openWelcomePage request - welcome page should only open on install');
            safeResponse({ acknowledged: true });
        } else if (message.type === 'forceOpenWelcomePage') {
            logger.info('MessageHandler', 'Force opening welcome page requested from popup');
            openWelcomePageDirectly();
            safeResponse({ acknowledged: true });
        } else if (message.type === 'openTab') {
            // Open a new tab with the specified URL
            tabs.create({ url: message.url as string }, (tab: chrome.tabs.Tab) => {
                if (browserAPI.runtime.lastError) {
                    safeResponse({ success: false, error: (browserAPI.runtime.lastError as chrome.runtime.LastError).message });
                } else {
                    safeResponse({ success: true, tabId: tab.id });
                }
            });
            return true; // Keep channel open for async response
        } else if (message.type === 'focusApp') {
            // Try to focus the app via WebSocket first
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                // Send focus message via WebSocket
                const sent = sendViaWebSocket({
                    type: 'focusApp',
                    navigation: message.navigation as string
                });
                safeResponse({ success: sent });
            } else {
                // WebSocket not connected, return false so popup can use protocol handler
                safeResponse({ success: false });
            }
            return true;
        } else if (message.type === 'getVideoRecordingState') {
            // Request video recording state via WebSocket
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                const sent = sendViaWebSocket({
                    type: 'getVideoRecordingState'
                });
                safeResponse({ success: sent });
            } else {
                safeResponse({ success: true, enabled: false });
            }
            return true;
        } else if (message.type === 'getRecordingHotkey') {
            // Request recording hotkey via WebSocket
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                const sent = sendViaWebSocket({
                    type: 'getRecordingHotkey'
                });
                safeResponse({ success: sent });
            } else {
                safeResponse({ success: true, hotkey: 'CommandOrControl+Shift+E' });
            }
            return true;
        } else if (message.type === 'toggleRule') {
            // Handle toggle rule directly via WebSocket without focusing app
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                const sent = sendViaWebSocket({
                    type: 'toggleRule',
                    ruleId: message.ruleId as string,
                    enabled: message.enabled as boolean
                });
                safeResponse({ success: sent });
            } else {
                safeResponse({ success: false, error: 'Not connected to desktop app' });
            }
            return true;
        } else if (message.type === 'getActiveRulesForTab') {
            // Get all active rules for a specific tab using centralized logic
            const tabId = message.tabId as number;
            const tabUrl = message.tabUrl as string;

            getActiveRulesForTab(tabId, tabUrl).then(activeRules => {
                safeResponse({ activeRules });
            }).catch((error: Error) => {
                logger.error('MessageHandler', 'Error getting active rules:', error);
                safeResponse({ activeRules: [] });
            });
            return true;
        } else if (message.type === 'setRulesExecutionPaused') {
            // Handle pause/resume of rules execution
            logger.info('MessageHandler', 'Setting rules execution paused state:', message.paused);

            // Update network rules to apply or clear them based on pause state
            scheduleUpdate('pause', { immediate: true });

            safeResponse({ success: true });
            return true;
        } else if (message.type === 'toggleAllRules') {
            // Handle toggle all rules via WebSocket
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                const sent = sendViaWebSocket({
                    type: 'toggleAllRules',
                    ruleIds: message.ruleIds as string[],
                    enabled: message.enabled as boolean
                });
                safeResponse({ success: sent });
            } else {
                safeResponse({ success: false, error: 'Not connected to desktop app' });
            }
            return true;
        } else if (message.type && (message.type as string).startsWith('proxy-')) {
            // Proxy-related messages are handled by the proxy controller
            return false;
        } else {
            // Unknown message type - don't handle it, let other listeners try
            logger.info('MessageHandler', 'Unknown message type:', message.type);
            return false;
        }
    } catch (error) {
        logger.info('MessageHandler', 'Error handling message:', (error as Error).message);
        safeResponse({ error: (error as Error).message });
        return true;
    }
}
