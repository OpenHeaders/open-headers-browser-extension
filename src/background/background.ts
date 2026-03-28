/**
 * Main background service worker - Minimal orchestrator
 *
 * Rule update ownership is centralized in rule-engine.ts.
 * All modules call scheduleUpdate(reason) — the engine coalesces,
 * deduplicates, and makes exactly one updateNetworkRules() call.
 */

declare const browser: typeof chrome | undefined;

import { connectWebSocket, isWebSocketConnected, isWebSocketConnecting, getReconnectAttempts, sendViaWebSocket, sendRecordingViaWebSocket } from './websocket';
import { initPauseState, setRulesPaused } from './header-manager';
import { getChunkedData } from '../utils/storage-chunking.js';
import { alarms, runtime, storage, tabs, isFirefox, isChrome, isEdge, isSafari } from '../utils/browser-api.js';
import { RecordingService } from '../assets/recording/background/recording-service.js';
import { logger } from '../utils/logger';

import { updateExtensionBadge } from './modules/badge-manager';
import { setupRequestMonitoring } from './modules/request-monitor';
import { revalidateTrackedRequests, restoreTrackingState, refreshSavedDataCache, getActiveRulesForTab } from './modules/request-tracker';
import { setupTabListeners, setupPeriodicCleanup } from './modules/tab-listeners';
import { openWelcomePageOnInstall, checkFirefoxFirstRun } from './modules/welcome-page';
import { generateSourcesHash, generateSavedDataHash } from './modules/utils';
import { handleRecordingMessage } from './modules/recording-handler';
import { handleGeneralMessage } from './modules/message-handler';
import { getCurrentSources, hydrateFromStorage } from './modules/sources-store';
import {
    scheduleUpdate,
    getLastSourcesHash, setLastSourcesHash,
    getLastSavedDataHash, setLastSavedDataHash, updateSavedDataHash,
    getLastRulesUpdateTime, setLastRulesUpdateTime
} from './modules/rule-engine';

import type { SavedDataMap } from '../types/header';
import type { IRecordingService } from '../types/recording';
import type { ActiveRule, HotkeyCommand } from '../types/browser';

void logger.initialize();
initPauseState();

const recordingService: IRecordingService = new RecordingService();

async function updateBadgeForCurrentTab(): Promise<void> {
    const isConnected = isWebSocketConnected();
    const reconnectAttempts = getReconnectAttempts();

    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    browserAPI.storage.sync.get(['isRulesExecutionPaused'], async (result: { [key: string]: unknown }) => {
        const isPaused = (result.isRulesExecutionPaused as boolean) || false;

        tabs.query({ active: true, currentWindow: true }, async (tabList: chrome.tabs.Tab[]) => {
            const currentTab = tabList[0];
            const currentUrl = currentTab?.url || '';

            if (currentTab && currentTab.id && recordingService.isRecording(currentTab.id)) {
                return;
            }

            const activeRules: ActiveRule[] = await getActiveRulesForTab(currentTab?.id, currentUrl);
            await updateExtensionBadge(isConnected, activeRules, isPaused, recordingService, reconnectAttempts);
        });
    });
}

const debouncedUpdateBadge = (() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; void updateBadgeForCurrentTab(); }, 100);
    };
})();

let extensionInitialized = false;
async function initializeExtension(): Promise<void> {
    if (extensionInitialized) {
        await connectWebSocket();
        return;
    }
    extensionInitialized = true;

    await updateExtensionBadge(false, [], false, recordingService, 0);
    setupRequestMonitoring(debouncedUpdateBadge);
    setupTabListeners(debouncedUpdateBadge, recordingService);
    setupPeriodicCleanup();

    setTimeout(() => restoreTrackingState(debouncedUpdateBadge), 1000);

    // Hydrate sources from storage (offline start before WebSocket connects)
    const restoredSources = await hydrateFromStorage();
    if (restoredSources.length > 0) {
        logger.info('Background', 'Restored dynamic sources from storage:', restoredSources.length);
        setLastSourcesHash(generateSourcesHash(restoredSources));
        scheduleUpdate('init', { immediate: true, sources: restoredSources });
    }

    getChunkedData('savedData', (savedData: SavedDataMap | null) => {
        if (savedData) {
            updateSavedDataHash(savedData);
            logger.debug('Background', 'Initialized saved data hash');
        }
    });

    await connectWebSocket();

    // Fallback: if WebSocket didn't provide sources yet, apply empty rules
    setTimeout(() => {
        if (getCurrentSources().length === 0 && !getLastRulesUpdateTime()) {
            scheduleUpdate('init', { immediate: true, sources: [] });
        }
    }, 1000);
}

// Alarms
alarms!.create('keepAlive', { periodInMinutes: 0.5 });
alarms!.create('updateBadge', { delayInMinutes: 0.01, periodInMinutes: 0.033 });

alarms!.onAlarm.addListener(async (alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'keepAlive') {
        logger.debug('Background', 'Keep alive ping');

        if (!isWebSocketConnected() && !isWebSocketConnecting()) {
            const attempts = getReconnectAttempts();
            const log = attempts <= 1 ? logger.info : logger.debug;
            log.call(logger, 'Background', 'WebSocket disconnected, reconnecting via keepAlive...');
            try {
                await connectWebSocket();
            } catch (error) {
                logger.debug('Background', 'Failed to reconnect WebSocket:', (error as Error).message);
            }
        }
    } else if (alarm.name === 'updateBadge') {
        void updateBadgeForCurrentTab();
    }
});

// Storage change listeners
storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    // Pause state — immediate rule update
    if (area === 'sync' && changes.isRulesExecutionPaused) {
        const paused = (changes.isRulesExecutionPaused.newValue as boolean) || false;
        logger.info('Background', 'Rules execution pause state changed to:', paused);
        setRulesPaused(paused);
        scheduleUpdate('pause', { immediate: true });
        debouncedUpdateBadge();
    }

    // Log level
    if (area === 'sync' && changes.logLevel) {
        const newLevel = changes.logLevel.newValue as string;
        if (newLevel) {
            logger.setLevel(newLevel as 'error' | 'warn' | 'info' | 'debug');
        }
    }

    // Hotkey commands
    if (area === 'local' && changes.hotkeyCommand) {
        const command = changes.hotkeyCommand.newValue as HotkeyCommand | undefined;
        if (!command) return;

        if (command.type === 'TOGGLE_RECORDING') {
            tabs.query({ active: true, currentWindow: true }, (tabList: chrome.tabs.Tab[]) => {
                if (!tabList || !tabList[0]) {
                    logger.info('Background', 'No active tab found for recording toggle');
                    return;
                }

                const tabId = tabList[0].id!;

                if (recordingService.isRecording(tabId)) {
                    logger.info('Background', 'Stopping recording from hotkey for tab:', tabId);
                    recordingService.stopRecording(tabId)
                        .then(() => logger.info('Background', 'Recording stopped from hotkey for tab:', tabId))
                        .catch((error: Error) => logger.error('Background', 'Failed to stop recording from hotkey:', error));
                } else {
                    tabs.query({}, (allTabs: chrome.tabs.Tab[]) => {
                        let hasActiveRecording = false;
                        for (const tab of allTabs) {
                            if (tab.id && recordingService.isRecording(tab.id)) {
                                hasActiveRecording = true;
                                logger.info('Background', 'Stopping recording on tab:', tab.id, 'from hotkey');
                                recordingService.stopRecording(tab.id)
                                    .then(() => logger.info('Background', 'Recording stopped on tab:', tab.id))
                                    .catch((error: Error) => logger.error('Background', 'Failed to stop recording:', error));
                                break;
                            }
                        }

                        if (!hasActiveRecording) {
                            logger.info('Background', 'Starting recording from hotkey for tab:', tabId);
                            recordingService.startRecording(tabId, { useWidget: true })
                                .then(() => logger.info('Background', 'Recording started from hotkey for tab:', tabId))
                                .catch((error: Error) => logger.error('Background', 'Failed to start recording from hotkey:', error));
                        }
                    });
                }
            });
        }

        storage.local.remove('hotkeyCommand');
    }
});

// Saved data changes — debounced rule update via engine
storage.onChanged.addListener((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area === 'sync') {
        const hasDataChange = changes.savedData ||
            changes.savedData_chunked ||
            Object.keys(changes).some(key => key.startsWith('savedData_chunk_'));

        if (hasDataChange) {
            refreshSavedDataCache(() => {
                getChunkedData('savedData', (newSavedData: SavedDataMap | null) => {
                    const effectiveSavedData: SavedDataMap = newSavedData || {};
                    const newHash = generateSavedDataHash(effectiveSavedData);

                    if (newHash === getLastSavedDataHash()) {
                        logger.debug('Background', 'Saved data changed but content is identical, skipping update');
                        return;
                    }

                    logger.info('Background', 'Saved header data changed, scheduling rule update');
                    updateSavedDataHash(effectiveSavedData);
                    revalidateTrackedRequests().then(() => {
                        scheduleUpdate('savedData');
                        debouncedUpdateBadge();
                    });
                });
            });
        }
    }
});

// Message listener
runtime.onMessage.addListener((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
    const msg = message as Record<string, unknown>;
    const recordingHandled = handleRecordingMessage(msg, sender, sendResponse, recordingService, sendRecordingViaWebSocket);
    if (recordingHandled) return recordingHandled;

    return handleGeneralMessage(msg, sender, sendResponse, {
        getCurrentSources,
        isWebSocketConnected,
        sendViaWebSocket,
        scheduleUpdate,
        revalidateTrackedRequests,
        updateBadgeCallback: debouncedUpdateBadge,
        lastSourcesHash: getLastSourcesHash(),
        setLastSourcesHash,
        lastRulesUpdateTime: getLastRulesUpdateTime(),
        setLastRulesUpdateTime,
        lastSavedDataHash: getLastSavedDataHash(),
        setLastSavedDataHash: (hash: string) => setLastSavedDataHash(hash)
    });
});

runtime.onStartup.addListener(() => {
    logger.info('Background', 'Browser started up, connecting WebSocket...');
    void initializeExtension();
});

runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
    logger.info('Background', 'Extension installed or updated:', details.reason);
    logger.info('Background', 'Browser detected:', isFirefox ? 'Firefox' : isChrome ? 'Chrome' : isEdge ? 'Edge' : isSafari ? 'Safari' : 'Unknown');

    if (details.reason === 'install') {
        logger.info('Background', 'Fresh install detected, opening welcome page');
        setTimeout(() => openWelcomePageOnInstall(), 500);
    } else if (isFirefox && details.reason === 'update') {
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result: Record<string, unknown>) => {
            if (!result.setupCompleted) {
                logger.info('Background', 'Firefox update detected but setup not completed, opening welcome page');
                storage.local.set({ hasSeenWelcome: true }, () => {
                    setTimeout(() => openWelcomePageOnInstall(), 500);
                });
            }
        });
    }

    void initializeExtension();
});

logger.info('Background', 'Background script started, initializing...');
void initializeExtension();
checkFirefoxFirstRun();
