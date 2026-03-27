/**
 * Recording-related type definitions.
 *
 * These types align with the desktop app's recording domain
 * (open-headers-app/src/types/recording.ts).
 */

// ── Recording metadata ─────────────────────────────────────────────

export interface RecordingMetadata {
    recordId?: string;
    recordingId?: string;
    startTime?: number;
    timestamp?: number;
    duration?: number;
    url?: string;
    initialUrl?: string;
    title?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    [key: string]: unknown;
}

// ── Recording state ────────────────────────────────────────────────

export interface RecordingState {
    metadata?: RecordingMetadata;
    [key: string]: unknown;
}

// ── Recording object ───────────────────────────────────────────────

/** A recording object returned from the RecordingService */
export interface Recording {
    id: string;
    status?: string;
    metadata?: RecordingMetadata;
    events?: RecordingEvent[];
    console?: ConsoleRecord[];
    network?: NetworkRecord[];
    storage?: StorageRecord[];
    startTime?: number;
    endTime?: number;
    url?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
    navigationHistory?: NavigationEntry[];
    [key: string]: unknown;
}

// ── Recording events ───────────────────────────────────────────────

export interface RecordingEventData {
    timestamp: number;
    type: string;
    url: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface RecordingEvent {
    timestamp: number;
    type: string;
    url?: string;
    data?: RecordingEventData | Record<string, unknown>;
}

// ── Console records ────────────────────────────────────────────────

export interface ConsoleArgObject {
    __type?: string;
    message?: string;
    tagName?: string;
    id?: string;
    className?: string;
    name?: string;
}

export type ConsoleArg = null | undefined | string | number | boolean | ConsoleArgObject;

export interface ConsoleRecord {
    timestamp: number;
    level: string;
    args: ConsoleArg[];
    stack?: string;
    key?: string;
}

// ── Network records ────────────────────────────────────────────────

export interface NetworkTimingData {
    dns?: number;
    connect?: number;
    ssl?: number;
    waiting?: number;
    download?: number;
    startTime?: number;
    endTime?: number;
}

export interface NetworkRecord {
    id: string;
    url: string;
    method: string;
    status: number;
    timestamp: number;
    endTime?: number;
    duration?: number;
    size?: number;
    responseSize?: number;
    type?: string;
    error?: boolean;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
    requestBody?: string;
    responseBody?: string;
    key?: string;
    remoteAddress?: string;
    timing?: NetworkTimingData;
    statusText?: string;
    headers?: Record<string, string>;
    body?: string | null;
}

// ── Storage records ────────────────────────────────────────────────

export interface StorageCookieMetadata {
    initial?: boolean;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    maxAge?: number | string;
    expires?: string;
    expired?: boolean;
    clearedCount?: number;
    clearedKeys?: Array<{ name: string; value: unknown }>;
}

export interface StorageRecord {
    timestamp: number;
    type: string;
    action: string;
    name: string;
    domain: string;
    key?: string;
    url?: string | null;
    value?: unknown;
    oldValue?: unknown;
    newValue?: string | null;
    path?: string;
    metadata?: StorageCookieMetadata;
    data?: {
        localStorage?: Record<string, string>;
        sessionStorage?: Record<string, string>;
        cookies?: string;
    };
}

// ── Navigation ─────────────────────────────────────────────────────

export interface NavigationEntry {
    timestamp: number;
    url?: string;
    title?: string;
    transitionType?: string;
}

// ── Recording service interface ────────────────────────────────────

export interface StartRecordingOptions {
    useWidget?: boolean;
}

export interface StopRecordingOptions {
    fromWidget?: boolean;
}

export interface IRecordingService {
    isRecording(tabId: number): boolean;
    getRecordingState(tabId: number): RecordingState;
    startRecording(tabId: number, options?: StartRecordingOptions): Promise<Recording>;
    stopRecording(tabId: number, options?: StopRecordingOptions): Promise<Recording | null>;
    cleanupTab(tabId: number): void;
    handleNavigation(tabId: number, url: string): Promise<void>;
    addEvent(tabId: number, event: RecordingEventData): void;
    handleContentScriptReady(tabId: number, payload: unknown): Promise<unknown>;
}

// ── Workflow recording list entry ──────────────────────────────────

export interface WorkflowTag {
    name?: string;
    url?: string;
}

export interface WorkflowRecordingEntry {
    id: string;
    timestamp: string | number;
    url?: string;
    duration?: number;
    eventCount?: number;
    size?: number;
    source?: string;
    hasVideo?: boolean;
    hasProcessedVersion?: boolean;
    tag?: WorkflowTag | null;
    description?: string | null;
    metadata?: { url?: string; initialUrl?: string };
}
