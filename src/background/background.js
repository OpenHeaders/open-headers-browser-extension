/**
 * Main background service worker - Minimal orchestrator
 */

import { connectWebSocket, getCurrentSources, isWebSocketConnected, sendViaWebSocket, sendRecordingViaWebSocket } from './websocket.js';
import { updateNetworkRules } from './header-manager.js';
import { getChunkedData } from '../utils/storage-chunking.js';
import { alarms, runtime, storage, tabs, isFirefox } from '../utils/browser-api.js';
import { RecordingService } from '../assets/recording/background/recording-service.js';

// Import modules
import { updateExtensionBadge } from './modules/badge-manager.js';
import { setupRequestMonitoring } from './modules/request-monitor.js';
import { checkRulesForTab, revalidateTrackedRequests, restoreTrackingState } from './modules/request-tracker.js';
import { setupTabListeners, setupPeriodicCleanup } from './modules/tab-listeners.js';
import { openWelcomePageOnInstall, checkFirefoxFirstRun } from './modules/welcome-page.js';
import { debounce, generateSourcesHash, generateSavedDataHash } from './modules/utils.js';
import { handleRecordingMessage } from './modules/recording-handler.js';
import { handleGeneralMessage } from './modules/message-handler.js';

// Initialize recording service
const recordingService = new RecordingService();

// State variables
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;
let lastSavedDataHash = '';
let headersUsingPlaceholders = [];

/**
 * Update badge for the current active tab
 */
async function updateBadgeForCurrentTab() {
    const isConnected = isWebSocketConnected();
    const hasPlaceholders = headersUsingPlaceholders.length > 0;

    // Check if rules execution is paused
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    browserAPI.storage.sync.get(['isRulesExecutionPaused'], async (result) => {
        const isPaused = result.isRulesExecutionPaused || false;

        // Get current active tab
        tabs.query({ active: true, currentWindow: true }, async (tabList) => {
            const currentTab = tabList[0];
            const currentUrl = currentTab?.url || '';
            
            // Check if this tab is recording - recording badge takes priority
            if (currentTab && currentTab.id) {
                if (recordingService.isRecording(currentTab.id)) {
                    // Don't update badge if recording - let the recording badge stay
                    return;
                }
            }

            // Get active rules for current tab (using centralized function)
            const { getActiveRulesForTab } = await import('./modules/request-tracker.js');
            const activeRules = await getActiveRulesForTab(currentTab?.id, currentUrl);
            await updateExtensionBadge(isConnected, activeRules, hasPlaceholders, isPaused, recordingService);
        });
    });
}

// Create debounced versions of update functions
const debouncedUpdateRules = debounce((sources) => {
    console.log('Info: Debounced rule update executing with', sources.length, 'sources');
    updateNetworkRules(sources);
    lastSourcesHash = generateSourcesHash(sources);
    lastRulesUpdateTime = Date.now();
}, 100);

const debouncedUpdateRulesFromSavedData = debounce((savedData) => {
    console.log('Info: Debounced rule update from saved data changes');
    updateNetworkRules(getCurrentSources());
    lastSavedDataHash = generateSavedDataHash(savedData);
    updateBadgeForCurrentTab();
}, 100);

const debouncedUpdateBadge = debounce(() => {
    updateBadgeForCurrentTab();
}, 100);

/**
 * Initialize the extension
 */
async function initializeExtension() {
    // Set initial badge state to disconnected
    await updateExtensionBadge(false, [], false, false, recordingService);

    // Set up request monitoring
    setupRequestMonitoring(debouncedUpdateBadge);

    // Set up tab listeners
    setupTabListeners(debouncedUpdateBadge, recordingService);

    // Set up periodic cleanup
    setupPeriodicCleanup();

    // Restore tracking state after a short delay (to ensure tabs are loaded)
    setTimeout(() => {
        restoreTrackingState(debouncedUpdateBadge);
    }, 1000);

    // First try to restore any previous dynamic sources
    storage.local.get(['dynamicSources'], (result) => {
        if (result.dynamicSources && Array.isArray(result.dynamicSources) && result.dynamicSources.length > 0) {
            console.log('Info: Restored dynamic sources from storage:', result.dynamicSources.length);
            lastSourcesHash = generateSourcesHash(result.dynamicSources);
            lastRulesUpdateTime = Date.now();
            updateNetworkRules(result.dynamicSources);
        }
    });

    // Get the initial savedData hash to prevent unnecessary updates
    getChunkedData('savedData', (savedData) => {
        if (savedData) {
            lastSavedDataHash = generateSavedDataHash(savedData);
            console.log('Info: Initialized saved data hash');
        }
    });

    // Connect to WebSocket and update rules when we receive new data
    await connectWebSocket((sources) => {
        console.log('Info: WebSocket provided fresh sources, updating rules immediately');
        updateNetworkRules(sources);
        lastSourcesHash = generateSourcesHash(sources);
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

// Set up alarms to keep the service worker alive
alarms.create('keepAlive', { periodInMinutes: 0.5 }); // Every 30 seconds
alarms.create('updateBadge', {
    delayInMinutes: 0.01,  // Start after 0.6 seconds
    periodInMinutes: 0.033 // Repeat every ~2 seconds
});

alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        console.log('Info: Keep alive ping');
        const currentSources = getCurrentSources();
        const currentHash = generateSourcesHash(currentSources);

        if (currentHash === lastSourcesHash) {
            console.log('Info: Skipping rule update - no changes detected');
            return;
        }

        console.log('Info: Updating rules due to source changes');
        updateNetworkRules(currentSources);
        lastSourcesHash = currentHash;
        lastRulesUpdateTime = Date.now();
    } else if (alarm.name === 'updateBadge') {
        updateBadgeForCurrentTab();
    }
});

// Listen for changes to dynamic sources in storage
storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dynamicSources) {
        const newSources = changes.dynamicSources.newValue || [];
        const newSourcesHash = generateSourcesHash(newSources);

        if (newSourcesHash === lastSourcesHash) {
            console.log('Info: Dynamic sources changed but content is identical, skipping update');
            return;
        }

        console.log('Info: Dynamic sources changed with new content, triggering rule update');
        debouncedUpdateRules(newSources);
    }
    
    // Handle pause state changes
    if (area === 'sync' && changes.isRulesExecutionPaused) {
        const isPaused = changes.isRulesExecutionPaused.newValue || false;
        console.log('Info: Rules execution pause state changed to:', isPaused);
        
        // Update network rules to apply or clear them based on pause state
        updateNetworkRules(getCurrentSources());
        
        // Force badge update to reflect paused state
        debouncedUpdateBadge();
    }
    
    // Handle hotkey commands from WebSocket
    if (area === 'local' && changes.hotkeyCommand) {
        const command = changes.hotkeyCommand.newValue;
        if (!command) return;
        
        // Handle recording toggle from hotkey
        if (command.type === 'TOGGLE_RECORDING') {
            // Get the active tab
            tabs.query({ active: true, currentWindow: true }, (tabList) => {
                if (!tabList || !tabList[0]) {
                    console.log('Info: No active tab found for recording toggle');
                    return;
                }
                
                const tabId = tabList[0].id;
                
                // Check if this tab is currently recording
                if (recordingService.isRecording(tabId)) {
                    // Stop the recording
                    console.log('Info: Stopping recording from hotkey for tab:', tabId);
                    recordingService.stopRecording(tabId)
                        .then(recording => {
                            console.log('Recording stopped from hotkey for tab:', tabId);
                        })
                        .catch(error => {
                            console.error('Failed to stop recording from hotkey:', error);
                        });
                } else {
                    // Check if any other tab is recording
                    tabs.query({}, (allTabs) => {
                        let hasActiveRecording = false;
                        for (const tab of allTabs) {
                            if (recordingService.isRecording(tab.id)) {
                                hasActiveRecording = true;
                                // Stop the recording on the other tab
                                console.log('Info: Stopping recording on tab:', tab.id, 'from hotkey');
                                recordingService.stopRecording(tab.id)
                                    .then(recording => {
                                        console.log('Recording stopped on tab:', tab.id);
                                    })
                                    .catch(error => {
                                        console.error('Failed to stop recording:', error);
                                    });
                                break; // Only stop the first recording found
                            }
                        }
                        
                        // If no recording was active anywhere, start a new one on current tab
                        if (!hasActiveRecording) {
                            console.log('Info: Starting recording from hotkey for tab:', tabId);
                            recordingService.startRecording(tabId, { useWidget: true })
                                .then(recording => {
                                    console.log('Recording started from hotkey for tab:', tabId);
                                })
                                .catch(error => {
                                    console.error('Failed to start recording from hotkey:', error);
                                });
                        }
                    });
                }
            });
        }
        
        // Clear the command after handling
        storage.local.remove('hotkeyCommand');
    }
});

// Listen for changes to saved data with hash check and debouncing
storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        // Check if savedData or any of its chunks changed
        const hasDataChange = changes.savedData || 
                             changes.savedData_chunked || 
                             Object.keys(changes).some(key => key.startsWith('savedData_chunk_'));
        
        if (hasDataChange) {
            // Use getChunkedData to properly retrieve the potentially chunked data
            getChunkedData('savedData', (newSavedData) => {
                newSavedData = newSavedData || {};
                const newSavedDataHash = generateSavedDataHash(newSavedData);

                if (newSavedDataHash === lastSavedDataHash) {
                    console.log('Info: Saved data changed but content is identical, skipping update');
                    return;
                }

                console.log('Info: Saved header data changed with new content, debouncing update');
                revalidateTrackedRequests().then(() => {
                    debouncedUpdateRulesFromSavedData(newSavedData);
                });
            });
        }
    }
});

// Listen for messages from popup and content scripts
runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Try recording handler first
    const recordingHandled = handleRecordingMessage(
        message, 
        sender, 
        sendResponse, 
        recordingService, 
        sendRecordingViaWebSocket
    );
    
    if (recordingHandled) {
        return recordingHandled;
    }

    // Handle general messages
    return handleGeneralMessage(
        message,
        sender,
        sendResponse,
        {
            getCurrentSources,
            isWebSocketConnected,
            sendViaWebSocket,
            updateNetworkRules,
            revalidateTrackedRequests,
            updateBadgeCallback: debouncedUpdateBadge,
            headersUsingPlaceholders,
            setHeadersUsingPlaceholders: (headers) => { headersUsingPlaceholders = headers; },
            lastSourcesHash,
            setLastSourcesHash: (hash) => { lastSourcesHash = hash; },
            lastRulesUpdateTime,
            setLastRulesUpdateTime: (time) => { lastRulesUpdateTime = time; },
            lastSavedDataHash,
            setLastSavedDataHash: (hash) => { lastSavedDataHash = hash; }
        }
    );
});

// Register for startup to reconnect if browser restarts
runtime.onStartup.addListener(() => {
    console.log('Info: Browser started up, connecting WebSocket...');
    initializeExtension();
});

// Keep track of when we're active by listening for install/update events
runtime.onInstalled.addListener((details) => {
    console.log('Info: Extension installed or updated:', details.reason);
    console.log('Info: Browser detected:', isFirefox ? 'Firefox' : 'Other');

    if (details.reason === 'install') {
        console.log('Info: Fresh install detected, opening welcome page');
        setTimeout(() => {
            openWelcomePageOnInstall();
        }, 500);
    } else if (isFirefox && details.reason === 'update') {
        // In Firefox dev mode, sometimes it reports as 'update' instead of 'install'
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result) => {
            if (!result.setupCompleted) {
                console.log('Info: Firefox update detected but setup not completed, opening welcome page');
                storage.local.set({ hasSeenWelcome: true }, () => {
                    setTimeout(() => {
                        openWelcomePageOnInstall();
                    }, 500);
                });
            }
        });
    }

    // Always initialize the extension regardless of install/update
    initializeExtension();
});

// Start the extension when loaded
console.log('Info: Background script started, initializing...');
initializeExtension();

// For Firefox development - check if this is a first run
checkFirefoxFirstRun();