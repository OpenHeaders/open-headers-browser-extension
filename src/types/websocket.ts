/**
 * WebSocket-related type definitions.
 *
 * These types match the desktop app's WebSocket service layer
 * (open-headers-app/src/types/source.ts, websocket.ts, rules.ts).
 */

// ── Source types (from desktop app) ────────────────────────────────

export type SourceType = 'http' | 'file' | 'manual' | 'env';

export type ActivationState = 'active' | 'inactive' | 'error' | 'waiting_for_deps';

export type SourceMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SourceHeader {
    key: string;
    value: string;
}

export interface SourceQueryParam {
    key: string;
    value: string;
}

export interface SourceRequestOptions {
    contentType?: string;
    body?: string;
    headers?: SourceHeader[];
    queryParams?: SourceQueryParam[];
    totpSecret?: string;
}

export interface JsonFilter {
    enabled: boolean;
    path?: string;
}

export type RefreshType = 'custom' | 'cron' | 'manual';

export interface RefreshOptions {
    enabled: boolean;
    type?: RefreshType;
    interval?: number;
    lastRefresh?: number | null;
    nextRefresh?: number | null;
    preserveTiming?: boolean;
    alignToMinute?: boolean;
    alignToHour?: boolean;
    alignToDay?: boolean;
}

export interface RefreshStatus {
    isRefreshing: boolean;
    lastRefresh?: number;
    startTime?: number;
    success?: boolean;
    error?: string;
    reason?: string;
    isRetry?: boolean;
    attemptNumber?: number;
    totalAttempts?: number;
    failureCount?: number;
}

/** A dynamic source provided by the desktop app via WebSocket */
export interface Source {
    sourceId: string;
    sourceType?: SourceType;
    sourcePath?: string;
    sourceMethod?: SourceMethod;
    sourceName?: string;
    sourceTag?: string;
    sourceContent?: string | null;
    requestOptions?: SourceRequestOptions;
    jsonFilter?: JsonFilter;
    refreshOptions?: RefreshOptions;
    refreshStatus?: RefreshStatus;
    activationState?: ActivationState;
    missingDependencies?: string[];
    createdAt?: string;
    updatedAt?: string;
    isFiltered?: boolean;
    filteredWith?: string | null;
    needsInitialFetch?: boolean;
    originalResponse?: string | null;
    responseHeaders?: Record<string, string> | null;
}

// ── Callback types ─────────────────────────────────────────────────

/** Callback invoked when sources are received from the WebSocket */
export type OnSourcesReceivedCallback = (sources: Source[]) => void;

// ── Rules data from desktop app (matches rules.ts) ─────────────────

export type MatchType = 'contains' | 'regex' | 'exact';

export type ContentType = 'any' | 'json' | 'xml' | 'text' | 'form';

export type UrlRuleAction = 'modify' | 'redirect' | 'block';

/** A header rule as received from the desktop app */
export interface HeaderRuleFromApp {
    id: string;
    type?: 'header';
    name?: string;
    description?: string;
    headerName: string;
    headerValue?: string;
    domains?: string[];
    isDynamic?: boolean;
    sourceId?: string | number | null;
    prefix?: string;
    suffix?: string;
    isResponse?: boolean;
    isEnabled?: boolean;
    tag?: string;
    hasEnvVars?: boolean;
    envVars?: string[];
    cookieName?: string;
    createdAt?: string;
    updatedAt?: string;
}

/** A payload rule as received from the desktop app */
export interface PayloadRuleFromApp {
    id: string;
    type?: 'payload';
    name?: string;
    description?: string;
    matchPattern: string;
    matchType: MatchType;
    replaceWith: string;
    isRequest?: boolean;
    isResponse?: boolean;
    contentType?: ContentType;
    domains?: string[];
    isEnabled?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/** A URL rule as received from the desktop app */
export interface UrlRuleFromApp {
    id: string;
    type?: 'url';
    name?: string;
    description?: string;
    matchPattern: string;
    matchType: MatchType;
    replacePattern?: string;
    redirectTo?: string;
    modifyParams?: Array<{ key: string; value?: string; action?: string }>;
    action?: UrlRuleAction;
    domains?: string[];
    isEnabled?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/** Unified rules data from the desktop app */
export interface RulesData {
    header?: HeaderRuleFromApp[];
    request?: PayloadRuleFromApp[];
    response?: Array<HeaderRuleFromApp | PayloadRuleFromApp | UrlRuleFromApp>;
    [key: string]: unknown;
}

