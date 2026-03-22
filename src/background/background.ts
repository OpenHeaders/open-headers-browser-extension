/**
 * Main background service worker - Minimal orchestrator
 */

declare const browser: typeof chrome | undefined;

import { connectWebSocket, getCurrentSources, isWebSocketConnected, getReconnectAttempts, sendViaWebSocket, sendRecordingViaWebSocket } from './websocket';
import { updateNetworkRules } from './header-manager';
import { getChunkedData } from '../utils/storage-chunking.js';
import { alarms, runtime, storage, tabs, isFirefox } from '../utils/browser-api.js';
import { RecordingService } from '../assets/recording/background/recording-service.js';

// Import modules
import { updateExtensionBadge } from './modules/badge-manager';
import { setupRequestMonitoring } from './modules/request-monitor';
import { checkRulesForTab, revalidateTrackedRequests, restoreTrackingState } from './modules/request-tracker';
import { setupTabListeners, setupPeriodicCleanup } from './modules/tab-listeners';
import { openWelcomePageOnInstall, checkFirefoxFirstRun } from './modules/welcome-page';
import { debounce, generateSourcesHash, generateSavedDataHash } from './modules/utils';
import { handleRecordingMessage } from './modules/recording-handler';
import { handleGeneralMessage } from './modules/message-handler';

import type { Source } from '../types/websocket';
import type { PlaceholderInfo, SavedDataMap } from '../types/header';
import type { IRecordingService } from '../types/recording';
import type { ActiveRule, HotkeyCommand } from '../types/browser';

// Initialize recording service
const recordingService: IRecordingService = new RecordingService();

// State variables
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;
let lastSavedDataHash = '';
let headersUsingPlaceholders: PlaceholderInfo[] = [];

/**
 * Update badge for the current active tab
 */
async function updateBadgeForCurrentTab(): Promise<void> {
    const isConnected = isWebSocketConnected();
    const reconnectAttempts = getReconnectAttempts();
    const hasPlaceholders = headersUsingPlaceholders.length > 0;

    // Check if rules execution is paused
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    browserAPI.storage.sync.get(['isRulesExecutionPaused'], async (result: { [key: string]: unknown }) => {
        const isPaused = (result.isRulesExecutionPaused as boolean) || false;

        // Get current active tab
        tabs.query({ active: true, currentWindow: true }, async (tabList: chrome.tabs.Tab[]) => {
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
            const { getActiveRulesForTab } = await import('./modules/request-tracker');
            const activeRules: ActiveRule[] = await getActiveRulesForTab(currentTab?.id, currentUrl);
            await updateExtensionBadge(isConnected, activeRules, hasPlaceholders, isPaused, recordingService, reconnectAttempts);
        });
    });
}

// Create debounced versions of update functions
const debouncedUpdateRules = debounce((sources: Source[]) => {
    console.log('Info: Debounced rule update executing with', sources.length, 'sources');
    updateNetworkRules(sources);
    lastSourcesHash = generateSourcesHash(sources);
    lastRulesUpdateTime = Date.now();
}, 100);

const debouncedUpdateRulesFromSavedData = debounce((_savedData: SavedDataMap) => {
    console.log('Info: Debounced rule update from saved data changes');
    updateNetworkRules(getCurrentSources());
    lastSavedDataHash = generateSavedDataHash(_savedData);
    updateBadgeForCurrentTab();
}, 100);

const debouncedUpdateBadge = debounce(() => {
    updateBadgeForCurrentTab();
}, 100);

/**
 * Initialize the extension
 */
async function initializeExtension(): Promise<void> {
    // Set initial badge state to disconnected (0 reconnect attempts initially)
    await updateExtensionBadge(false, [], false, false, recordingService, 0);

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
    storage.local.get(['dynamicSources'], (result: Record<string, unknown>) => {
        if (result.dynamicSources && Array.isArray(result.dynamicSources) && (result.dynamicSources as Source[]).length > 0) {
            const sources = result.dynamicSources as Source[];
            console.log('Info: Restored dynamic sources from storage:', sources.length);
            lastSourcesHash = generateSourcesHash(sources);
            lastRulesUpdateTime = Date.now();
            updateNetworkRules(sources);
        }
    });

    // Get the initial savedData hash to prevent unnecessary updates
    getChunkedData('savedData', (savedData: SavedDataMap | null) => {
        if (savedData) {
            lastSavedDataHash = generateSavedDataHash(savedData);
            console.log('Info: Initialized saved data hash');
        }
    });

    // Connect to WebSocket and update rules when we receive new data
    await connectWebSocket((sources: Source[]) => {
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
alarms!.create('keepAlive', { periodInMinutes: 0.5 }); // Every 30 seconds
alarms!.create('updateBadge', {
    delayInMinutes: 0.01,  // Start after 0.6 seconds
    periodInMinutes: 0.033 // Repeat every ~2 seconds
});

alarms!.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'keepAlive') {
        console.log('Info: Keep alive ping');
        if (!isWebSocketConnected()) {
            console.log('Info: WebSocket disconnected, reconnecting immediately...');
            try {
                await connectWebSocket((sources: Source[]) => {
                    console.log('Info: WebSocket reconnected via keepAlive, updating rules');
                    updateNetworkRules(sources);
                    lastSourcesHash = generateSourcesHash(sources);
                    lastRulesUpdateTime = Date.now();
                });
            } catch (error) {
                console.log('Info: Failed to reconnect WebSocket:', (error as Error).message);
            }
        }

        // Check for source changes
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
storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'local' && changes.dynamicSources) {
        const newSources: Source[] = (changes.dynamicSources.newValue as Source[]) || [];
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
        const isPaused = (changes.isRulesExecutionPaused.newValue as boolean) || false;
        console.log('Info: Rules execution pause state changed to:', isPaused);

        // Update network rules to apply or clear them based on pause state
        updateNetworkRules(getCurrentSources());

        // Force badge update to reflect paused state
        debouncedUpdateBadge();
    }

    // Handle hotkey commands from WebSocket
    if (area === 'local' && changes.hotkeyCommand) {
        const command = changes.hotkeyCommand.newValue as HotkeyCommand | undefined;
        if (!command) return;

        // Handle recording toggle from hotkey
        if (command.type === 'TOGGLE_RECORDING') {
            // Get the active tab
            tabs.query({ active: true, currentWindow: true }, (tabList: chrome.tabs.Tab[]) => {
                if (!tabList || !tabList[0]) {
                    console.log('Info: No active tab found for recording toggle');
                    return;
                }

                const tabId = tabList[0].id!;

                // Check if this tab is currently recording
                if (recordingService.isRecording(tabId)) {
                    // Stop the recording
                    console.log('Info: Stopping recording from hotkey for tab:', tabId);
                    recordingService.stopRecording(tabId)
                        .then(_recording => {
                            console.log('Recording stopped from hotkey for tab:', tabId);
                        })
                        .catch((error: Error) => {
                            console.error('Failed to stop recording from hotkey:', error);
                        });
                } else {
                    // Check if any other tab is recording
                    tabs.query({}, (allTabs: chrome.tabs.Tab[]) => {
                        let hasActiveRecording = false;
                        for (const tab of allTabs) {
                            if (tab.id && recordingService.isRecording(tab.id)) {
                                hasActiveRecording = true;
                                // Stop the recording on the other tab
                                console.log('Info: Stopping recording on tab:', tab.id, 'from hotkey');
                                recordingService.stopRecording(tab.id)
                                    .then(_recording => {
                                        console.log('Recording stopped on tab:', tab.id);
                                    })
                                    .catch((error: Error) => {
                                        console.error('Failed to stop recording:', error);
                                    });
                                break; // Only stop the first recording found
                            }
                        }

                        // If no recording was active anywhere, start a new one on current tab
                        if (!hasActiveRecording) {
                            console.log('Info: Starting recording from hotkey for tab:', tabId);
                            recordingService.startRecording(tabId, { useWidget: true })
                                .then(_recording => {
                                    console.log('Recording started from hotkey for tab:', tabId);
                                })
                                .catch((error: Error) => {
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
storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'sync') {
        // Check if savedData or any of its chunks changed
        const hasDataChange = changes.savedData ||
            changes.savedData_chunked ||
            Object.keys(changes).some(key => key.startsWith('savedData_chunk_'));

        if (hasDataChange) {
            // Use getChunkedData to properly retrieve the potentially chunked data
            getChunkedData('savedData', (newSavedData: SavedDataMap | null) => {
                const effectiveSavedData: SavedDataMap = newSavedData || {};
                const newSavedDataHash = generateSavedDataHash(effectiveSavedData);

                if (newSavedDataHash === lastSavedDataHash) {
                    console.log('Info: Saved data changed but content is identical, skipping update');
                    return;
                }

                console.log('Info: Saved header data changed with new content, debouncing update');
                revalidateTrackedRequests().then(() => {
                    debouncedUpdateRulesFromSavedData(effectiveSavedData);
                });
            });
        }
    }
});

// Listen for messages from popup and content scripts
runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    const msg = message as Record<string, unknown>;
    // Try recording handler first
    const recordingHandled = handleRecordingMessage(
        msg,
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
        msg,
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
            setHeadersUsingPlaceholders: (headers: PlaceholderInfo[]) => { headersUsingPlaceholders = headers; },
            lastSourcesHash,
            setLastSourcesHash: (hash: string) => { lastSourcesHash = hash; },
            lastRulesUpdateTime,
            setLastRulesUpdateTime: (time: number) => { lastRulesUpdateTime = time; },
            lastSavedDataHash,
            setLastSavedDataHash: (hash: string) => { lastSavedDataHash = hash; }
        }
    );
});

// Register for startup to reconnect if browser restarts
runtime.onStartup.addListener(() => {
    console.log('Info: Browser started up, connecting WebSocket...');
    initializeExtension();
});

// Keep track of when we're active by listening for install/update events
runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
    console.log('Info: Extension installed or updated:', details.reason);
    console.log('Info: Browser detected:', isFirefox ? 'Firefox' : 'Other');

    if (details.reason === 'install') {
        console.log('Info: Fresh install detected, opening welcome page');
        setTimeout(() => {
            openWelcomePageOnInstall();
        }, 500);
    } else if (isFirefox && details.reason === 'update') {
        // In Firefox dev mode, sometimes it reports as 'update' instead of 'install'
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result: Record<string, unknown>) => {
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
