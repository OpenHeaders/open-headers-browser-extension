/**
 * Main Message Handler - Handles non-recording messages
 */

import { storage, tabs, runtime as browserRuntime } from '../../utils/browser-api.js';
import { openWelcomePageDirectly } from './welcome-page.js';
import { clearAllTracking } from './request-tracker.js';
import { generateSourcesHash, generateSavedDataHash } from './utils.js';
import { getChunkedData, setChunkedData } from '../../utils/storage-chunking.js';

const browserAPI = { runtime: browserRuntime };

/**
 * Create a safe response function that checks if the channel is still open
 */
function createSafeResponse(sendResponse) {
    return (data) => {
        try {
            sendResponse(data);
        } catch (error) {
            console.log('Info: Could not send response, channel closed');
        }
    };
}

/**
 * Handle general messages (non-recording)
 */
export function handleGeneralMessage(
    message, 
    sender, 
    sendResponse, 
    { 
        getCurrentSources, 
        isWebSocketConnected,
        sendViaWebSocket,
        updateNetworkRules,
        revalidateTrackedRequests,
        updateBadgeCallback,
        headersUsingPlaceholders,
        setHeadersUsingPlaceholders,
        lastSourcesHash,
        setLastSourcesHash,
        lastRulesUpdateTime,
        setLastRulesUpdateTime,
        lastSavedDataHash,
        setLastSavedDataHash
    }
) {
    const safeResponse = createSafeResponse(sendResponse);

    // Handle each message type
    try {
        if (message.type === 'popupOpen') {
            console.log('Info: Popup opened, sending current sources');
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
            getChunkedData('savedData', (savedData) => {
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
            console.log('Info: Rule update requested');

            // First revalidate tracked requests
            revalidateTrackedRequests().then(() => {
                // Update network rules with the current sources
                updateNetworkRules(getCurrentSources());

                // Update tracking variables
                setLastSourcesHash(generateSourcesHash(getCurrentSources()));
                setLastRulesUpdateTime(Date.now());

                // Force immediate badge update
                updateBadgeCallback();

                // Send response
                safeResponse({ success: true });
            }).catch(error => {
                console.log('Info: Error updating rules:', error.message);
                safeResponse({ success: false, error: error.message });
            });

            // Return true to indicate async response
            return true;
        } else if (message.type === 'headersUsingPlaceholders') {
            // Update placeholder tracking from header-manager
            setHeadersUsingPlaceholders(message.headers || []);
            console.log('Info: Headers using placeholders:', (message.headers || []).length);

            // Update badge immediately
            updateBadgeCallback();

            safeResponse({ acknowledged: true });
        } else if (message.type === 'configurationImported') {
            // Handle configuration import
            console.log('Info: Configuration imported, updating rules');

            // Clear all request tracking when importing new config
            clearAllTracking();
            console.log('Info: Cleared all request tracking after configuration import');

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
            setLastSourcesHash(generateSourcesHash(dynamicSources));
            setLastRulesUpdateTime(Date.now());

            // Update saved data hash if available
            if (message.savedData) {
                setLastSavedDataHash(generateSavedDataHash(message.savedData));
            }

            // Update badge for current tab
            updateBadgeCallback();

            // Send response
            safeResponse({ success: true });
        } else if (message.type === 'importConfiguration') {
            // Handle configuration import in the background script
            console.log('Info: Handling configuration import in background');

            try {
                const { savedData, dynamicSources } = message.config;

                if (!savedData) {
                    safeResponse({ success: false, error: 'Invalid configuration: savedData missing' });
                    return true;
                }

                // Save data to storage using chunked storage (preserve empty values as-is)
                setChunkedData('savedData', savedData, () => {
                    if (browserAPI.runtime.lastError) {
                        console.log('Info: Error saving savedData:', browserAPI.runtime.lastError.message);
                        safeResponse({ success: false, error: 'Failed to save configuration' });
                        return;
                    }

                    // Handle dynamic sources - preserve existing ones if import doesn't include any
                    if (dynamicSources && Array.isArray(dynamicSources) && dynamicSources.length > 0) {
                        // Import has dynamic sources, use them
                        storage.local.set({ dynamicSources }, () => {
                            if (browserAPI.runtime.lastError) {
                                console.log('Info: Error saving dynamicSources:', browserAPI.runtime.lastError.message);
                                safeResponse({ success: false, error: 'Failed to save dynamic sources' });
                                return;
                            }

                            console.log('Info: Configuration imported successfully with dynamic sources');

                            // Clear all request tracking when importing new config
                            clearAllTracking();
                            console.log('Info: Cleared all request tracking after configuration import');

                            // Update network rules with the imported sources
                            updateNetworkRules(dynamicSources);

                            // Update tracking variables
                            setLastSourcesHash(generateSourcesHash(dynamicSources));
                            setLastRulesUpdateTime(Date.now());
                            setLastSavedDataHash(generateSavedDataHash(savedData));

                            // Update badge for current tab
                            updateBadgeCallback();

                            // Send success response
                            safeResponse({ success: true });
                        });
                    } else {
                        // No dynamic sources in import, preserve existing ones
                        console.log('Info: Configuration imported successfully (preserving existing dynamic sources)');

                        // Clear all request tracking
                        clearAllTracking();

                        // Get current sources (existing ones will be preserved)
                        const currentSources = getCurrentSources();

                        // Update network rules with existing sources
                        updateNetworkRules(currentSources);

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
                console.log('Info: Import error in background:', error.message);
                safeResponse({ success: false, error: error.message });
            }

            // Return true to indicate async response
            return true;
        } else if (message.type === 'sourcesUpdated') {
            // This catches messages sent from the WebSocket to ensure the background
            // script stays active and processes the updates immediately
            console.log('Info: Background received sources update notification:',
                message.sources ? message.sources.length : 0, 'sources at',
                new Date(message.timestamp).toISOString());

            // No need to update rules here as the WebSocket handler already does this
            safeResponse({ acknowledged: true });
        } else if (message.type === 'openWelcomePage') {
            // This message type is no longer used - we don't want to open welcome page randomly
            console.log('Info: Ignoring openWelcomePage request - welcome page should only open on install');
            safeResponse({ acknowledged: true });
        } else if (message.type === 'forceOpenWelcomePage') {
            // FORCE open the welcome page (from the Guide button in popup)
            console.log('Info: Force opening welcome page requested from popup');
            openWelcomePageDirectly();
            safeResponse({ acknowledged: true });
        } else if (message.type === 'openTab') {
            // Open a new tab with the specified URL
            tabs.create({ url: message.url }, (tab) => {
                if (browserAPI.runtime.lastError) {
                    safeResponse({ success: false, error: browserAPI.runtime.lastError.message });
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
                    navigation: message.navigation
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
                // Send request via WebSocket
                const sent = sendViaWebSocket({
                    type: 'getVideoRecordingState'
                });
                
                // For now, we'll return that we sent the request
                // The actual state will come via a WebSocket message
                safeResponse({ success: sent });
            } else {
                // WebSocket not connected, assume video recording is disabled
                safeResponse({ success: true, enabled: false });
            }
            return true;
        } else if (message.type === 'getRecordingHotkey') {
            // Request recording hotkey via WebSocket
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                // Send request via WebSocket
                const sent = sendViaWebSocket({
                    type: 'getRecordingHotkey'
                });
                
                // For now, we'll return that we sent the request
                // The actual hotkey will come via a WebSocket message
                safeResponse({ success: sent });
            } else {
                // WebSocket not connected, return default
                safeResponse({ success: true, hotkey: 'CommandOrControl+Shift+E' });
            }
            return true;
        } else if (message.type === 'toggleRule') {
            // Handle toggle rule directly via WebSocket without focusing app
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                // Send toggle command to desktop app via WebSocket
                const sent = sendViaWebSocket({
                    type: 'toggleRule',
                    ruleId: message.ruleId,
                    enabled: message.enabled
                });
                
                // Desktop app will handle the toggle and send back updated rules via 'rules-update'
                safeResponse({ success: sent });
            } else {
                // WebSocket not connected, can't toggle
                safeResponse({ success: false, error: 'Not connected to desktop app' });
            }
            return true;
        } else if (message.type === 'getActiveRulesForTab') {
            // Get all active rules for a specific tab using centralized logic
            import('./request-tracker.js').then(async ({ getActiveRulesForTab }) => {
                const tabId = message.tabId;
                const tabUrl = message.tabUrl;
                
                const activeRules = await getActiveRulesForTab(tabId, tabUrl);
                safeResponse({ activeRules });
            }).catch(error => {
                console.error('Error getting active rules:', error);
                safeResponse({ activeRules: [] });
            });
            return true;
        } else if (message.type === 'setRulesExecutionPaused') {
            // Handle pause/resume of rules execution
            console.log('Info: Setting rules execution paused state:', message.paused);
            
            // Update network rules to apply or clear them based on pause state
            updateNetworkRules(getCurrentSources());
            
            safeResponse({ success: true });
            return true;
        } else if (message.type === 'toggleAllRules') {
            // Handle toggle all rules via WebSocket
            const wsConnected = isWebSocketConnected();
            if (wsConnected) {
                // Send toggle all command to desktop app via WebSocket
                const sent = sendViaWebSocket({
                    type: 'toggleAllRules',
                    ruleIds: message.ruleIds,
                    enabled: message.enabled
                });
                
                // Desktop app will handle the toggle and send back updated rules via 'rules-update'
                safeResponse({ success: sent });
            } else {
                // WebSocket not connected, can't toggle
                safeResponse({ success: false, error: 'Not connected to desktop app' });
            }
            return true;
        } else if (message.type && message.type.startsWith('proxy-')) {
            // Proxy-related messages are handled by the proxy controller
            // Return false to let the proxy controller handle it
            return false;
        } else {
            // Unknown message type - don't handle it, let other listeners try
            console.log('Info: Unknown message type:', message.type);
            return false;
        }
    } catch (error) {
        console.log('Info: Error handling message:', error.message);
        safeResponse({ error: error.message });
        return true;
    }
}