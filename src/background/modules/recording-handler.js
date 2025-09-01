/**
 * Recording Message Handler - Handles all recording-related messages
 */

import { tabs, downloads, cookies, runtime as browserRuntime } from '../../utils/browser-api.js';
import { NewMessageTypes } from '../../assets/recording/shared/message-adapter.js';

const browserAPI = { runtime: browserRuntime };

/**
 * Handle recording-related messages
 */
export function handleRecordingMessage(message, sender, sendResponse, recordingService, sendRecordingViaWebSocket) {
    // Handle record recording messages
    if (message.type && [
        'START_RECORDING', 
        'STOP_RECORDING',
        'STOP_RECORDING_FROM_WIDGET',
        'CANCEL_RECORDING',
        'GET_RECORDING_STATE',
        'DOWNLOAD_WORKFLOW',
        'SEND_WORKFLOW_TO_APP',
        'GET_EXTENSION_NETWORK_DATA',
        'GET_ALL_COOKIES',
        'ACCUMULATE_RECORD_DATA',
        'GET_ACCUMULATED_RECORD_DATA'
    ].includes(message.type)) {
        
        switch (message.type) {
            case 'START_RECORDING':
                recordingService.startRecording(message.tabId, { 
                    useWidget: message.useWidget !== false 
                })
                    .then(recording => sendResponse({ 
                        success: true, 
                        recordId: recording.id,
                        isPreNav: recording.status === 'pre_navigation'
                    }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
                
            case 'STOP_RECORDING':
                recordingService.stopRecording(message.tabId)
                    .then(recording => sendResponse({ 
                        success: true, 
                        recording: recording 
                    }))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
                
            case 'STOP_RECORDING_FROM_WIDGET':
                // Get tab ID from sender (content script)
                const widgetTabId = sender.tab?.id;
                if (widgetTabId) {
                    // Pass fromWidget option to prevent circular messaging
                    recordingService.stopRecording(widgetTabId, { fromWidget: true })
                        .then(recording => sendResponse({ 
                            success: true, 
                            recording: recording 
                        }))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                } else {
                    sendResponse({ success: false, error: 'No tab ID available' });
                }
                return true;
                
            case 'CANCEL_RECORDING':
                const cancelTabId = message.tabId || sender.tab?.id;
                if (!cancelTabId) {
                    sendResponse({ success: false, error: 'No tab ID available' });
                    return true;
                }
                // Cancel recording without export
                recordingService.stopRecording(cancelTabId)
                    .then(response => sendResponse(response))
                    .catch(error => sendResponse({ success: false, error: error.message }));
                return true;
                
            case 'GET_RECORDING_STATE':
                const tabId = message.tabId || sender.tab?.id;
                const isRecording = recordingService.isRecording(tabId);
                const state = recordingService.getRecordingState(tabId);
                sendResponse({ 
                    isRecording: isRecording,
                    recordId: state.metadata?.recordingId,
                    ...state
                });
                return true;
                
            case 'DOWNLOAD_WORKFLOW':
                // Just download the file directly
                downloads.download({
                    url: message.url,
                    filename: message.filename,
                    saveAs: true
                });
                sendResponse({ success: true });
                return true;
                
            case 'SEND_WORKFLOW_TO_APP':
                console.log('[Recording Handler] Received SEND_WORKFLOW_TO_APP message');
                // Send recording via WebSocket
                const success = sendRecordingViaWebSocket(message.recording);
                console.log('[Recording Handler] sendRecordingViaWebSocket returned:', success);
                sendResponse({ success, error: success ? null : 'App not connected' });
                return true;
                
            case 'GET_EXTENSION_NETWORK_DATA':
                // Network data is now part of recording events
                sendResponse({ success: true, networkData: [] });
                return true;
                
            case 'GET_ALL_COOKIES':
                const cookieTabId = message.tabId || sender.tab?.id;
                if (cookieTabId) {
                    tabs.get(cookieTabId, (tab) => {
                        if (tab && tab.url) {
                            const url = new URL(tab.url);
                            cookies.getAll({ url: tab.url }, () => {
                                // Get all cookies for all domains that might be relevant
                                cookies.getAll({}, (allCookies) => {
                                    // Filter cookies that could apply to this domain
                                    const relevantCookies = allCookies.filter(cookie => {
                                        const cookieDomain = cookie.domain.startsWith('.') ? 
                                            cookie.domain.substring(1) : cookie.domain;
                                        return url.hostname.includes(cookieDomain) || 
                                               cookieDomain.includes(url.hostname);
                                    });
                                    
                                    // Serialize cookies for Firefox XrayWrapper
                                    const serializedCookies = JSON.parse(JSON.stringify(relevantCookies));
                                    sendResponse({ success: true, cookies: serializedCookies });
                                });
                            });
                        } else {
                            sendResponse({ success: false, error: 'Could not get tab URL' });
                        }
                    });
                    return true; // Keep channel open for async response
                } else {
                    sendResponse({ success: false, error: 'No tab ID available' });
                    return true;
                }
                
            case 'ACCUMULATE_RECORD_DATA':
                // Data accumulation is handled by the new recording service
                sendResponse({ success: true });
                return true;
                
            case 'GET_ACCUMULATED_RECORD_DATA':
                // Data is stored in the recording service
                sendResponse({ success: true, recordData: null });
                return true;
        }
    }
    
    // Handle new message types from enhanced content script
    if (message.type && Object.values(NewMessageTypes).includes(message.type)) {
        switch (message.type) {
            case NewMessageTypes.RECORDING_DATA:
                const dataTabId = sender.tab?.id;
                if (dataTabId) {
                    recordingService.addEvent(dataTabId, {
                        timestamp: message.payload.timestamp,
                        type: message.payload.type,
                        url: message.payload.url,
                        data: message.payload.data
                    });
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, error: 'No tab ID' });
                }
                return true;
                
            case NewMessageTypes.CONTENT_SCRIPT_READY:
                const readyTabId = sender.tab?.id;
                if (readyTabId) {
                    recordingService.handleContentScriptReady(readyTabId, message.payload)
                        .then(response => sendResponse(response))
                        .catch(error => sendResponse({ success: false, error: error.message }));
                } else {
                    sendResponse({ success: false, error: 'No tab ID' });
                }
                return true;
                
            case NewMessageTypes.QUERY_RECORDING_STATE:
                const queryTabId = sender.tab?.id || message.payload?.tabId;
                if (queryTabId) {
                    const state = recordingService.getRecordingState(queryTabId);
                    sendResponse(state);
                } else {
                    sendResponse({ success: false, error: 'No tab ID' });
                }
                return true;
        }
    }
    
    // Handle pre-navigation recording
    if (message.action === 'START_PRE_NAV_RECORDING') {
        const { tabId, useWidget } = message;
        
        // Start recording immediately to capture all network requests
        recordingService.startRecording(tabId, { useWidget: useWidget !== false })
            .then(recording => {
                sendResponse({ success: true, recordId: recording.id });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
    
    // Handle getting tab recording state
    if (message.action === 'GET_TAB_RECORDING_STATE') {
        // Use sender.tab.id when fromContentScript is true, otherwise use message.tabId
        const tabId = message.fromContentScript && sender.tab?.id ? sender.tab.id : message.tabId;
        const isRecording = recordingService.isRecording(tabId);
        const state = recordingService.getRecordingState(tabId);
        sendResponse({ 
            isRecording: isRecording,
            recordId: state.metadata?.recordingId,
            ...state
        });
        return true;
    }
    
    // Handle marking page as visited
    if (message.action === 'MARK_PAGE_VISITED') {
        const tabId = sender.tab?.id;
        if (tabId) {
            // Page visit tracking is handled in navigation listener
            sendResponse({ wasFirstPage: false });
        } else {
            sendResponse({ wasFirstPage: false });
        }
        return true;
    }
    
    // Legacy hotkey handlers removed - now handled via storage events in background.js
    // The toggle logic is centralized in background.js for better maintainability
    
    // Handle badge state restoration after recording stops
    if (message.type === 'RESTORE_BADGE_STATE') {
        const { tabId } = message;
        // Get current tab to check if it needs badge update
        tabs.get(tabId, async (tab) => {
            if (tab && !browserAPI.runtime.lastError) {
                // Check if tab is recording
                if (!recordingService.isRecording(tabId)) {
                    // Trigger badge update (handled by main background script)
                    sendResponse({ success: true, needsBadgeUpdate: true });
                } else {
                    sendResponse({ success: true, needsBadgeUpdate: false });
                }
            } else {
                sendResponse({ success: false });
            }
        });
        return true;
    }
    
    return false; // Not a recording message
}