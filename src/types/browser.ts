/**
 * Browser API helper types and extension message types
 */

declare const browser: typeof chrome | undefined;

/** The cross-browser API object (Firefox `browser` or Chrome `chrome`) */
export type BrowserAPI = typeof chrome;

/**
 * Get the appropriate browser API object.
 * In Firefox, `browser` is defined globally; everywhere else we fall back to `chrome`.
 */
export function getBrowserAPI(): BrowserAPI {
    return typeof browser !== 'undefined' ? browser : chrome;
}

// ---------------------------------------------------------------------------
//  Extension internal messages (runtime.sendMessage / onMessage)
// ---------------------------------------------------------------------------

/** Messages sent between popup, content scripts, and background */
export type ExtensionMessageType =
    | 'popupOpen'
    | 'checkConnection'
    | 'getDynamicSources'
    | 'rulesUpdated'
    | 'configurationImported'
    | 'importConfiguration'
    | 'sourcesUpdated'
    | 'openWelcomePage'
    | 'forceOpenWelcomePage'
    | 'openTab'
    | 'focusApp'
    | 'getVideoRecordingState'
    | 'getRecordingHotkey'
    | 'toggleRule'
    | 'getActiveRulesForTab'
    | 'setRulesExecutionPaused'
    | 'toggleAllRules'
    | 'connectionStatus'
    | 'ruleUpdateError'
    | 'videoRecordingStateChanged'
    | 'recordingHotkeyResponse'
    // Recording message types
    | 'START_RECORDING'
    | 'STOP_RECORDING'
    | 'STOP_RECORDING_FROM_WIDGET'
    | 'CANCEL_RECORDING'
    | 'GET_RECORDING_STATE'
    | 'DOWNLOAD_WORKFLOW'
    | 'SEND_WORKFLOW_TO_APP'
    | 'GET_EXTENSION_NETWORK_DATA'
    | 'GET_ALL_COOKIES'
    | 'ACCUMULATE_RECORD_DATA'
    | 'GET_ACCUMULATED_RECORD_DATA'
    | 'RESTORE_BADGE_STATE';

export interface ExtensionMessage {
    type: ExtensionMessageType | string;
    action?: string;
    [key: string]: unknown;
}

/** Callback used to send a response back through runtime.onMessage */
export type SendResponse = (response: unknown) => void;

/** Badge states used by the badge manager */
export type BadgeState = 'none' | 'active' | 'disconnected' | 'paused';

/** Pending request info tracked by the request monitor */
export interface PendingRequest {
    tabId: number;
    url: string;
    headersApplied: boolean;
    method: string;
}

/** Active rule entry returned by getActiveRulesForTab */
export interface ActiveRule {
    id: string;
    key: string;
    matchType: 'direct' | 'indirect';
    [key: string]: unknown;
}

/** Context object passed to handleGeneralMessage */
export interface MessageHandlerContext {
    getCurrentSources: () => import('./websocket').Source[];
    isWebSocketConnected: () => boolean;
    sendViaWebSocket: (data: Record<string, unknown>) => boolean;
    scheduleUpdate: (reason: string, options?: { immediate?: boolean; sources?: import('./websocket').Source[] }) => void;
    revalidateTrackedRequests: () => Promise<void>;
    updateBadgeCallback: () => void;
    lastSourcesHash: string;
    setLastSourcesHash: (hash: string) => void;
    lastRulesUpdateTime: number;
    setLastRulesUpdateTime: (time: number) => void;
    lastSavedDataHash: string;
    setLastSavedDataHash: (hash: string) => void;
}

/** Hotkey command stored in local storage */
export interface HotkeyCommand {
    type: 'TOGGLE_RECORDING';
    timestamp: number;
}
