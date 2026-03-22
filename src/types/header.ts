/**
 * Header-related type definitions.
 *
 * These types match the desktop app's header/rules domain
 * (open-headers-app/src/types/rules.ts).
 */

/** A saved header entry from storage */
export interface HeaderEntry {
    headerName: string;
    headerValue: string;
    domains: string[];
    domain?: string;
    isDynamic: boolean;
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
    sourceMissing?: boolean;
}

/** A header entry after processing (validation, placeholder resolution, etc.) */
export interface ProcessedEntry {
    headerName: string;
    headerValue: string;
    domains: string[];
    isResponse: boolean;
    usingPlaceholder: boolean;
    placeholderReason: PlaceholderReason | null;
}

/** Reasons a header may use a placeholder value */
export type PlaceholderReason =
    | 'app_disconnected'
    | 'source_not_found'
    | 'empty_source'
    | 'empty_value';

/** Information about a header using a placeholder */
export interface PlaceholderInfo {
    headerName: string;
    sourceId?: string | number | null;
    reason: PlaceholderReason;
    domains: string[];
}

/** A header rule suitable for chrome.declarativeNetRequest */
export interface HeaderRule {
    id: number;
    priority: number;
    action: {
        type: 'modifyHeaders';
        requestHeaders?: HeaderModification[];
        responseHeaders?: HeaderModification[];
    };
    condition: {
        urlFilter: string;
        resourceTypes: chrome.declarativeNetRequest.ResourceType[];
    };
}

/** A single header modification operation */
export interface HeaderModification {
    header: string;
    operation: 'set' | 'remove' | 'append';
    value: string;
}

/** Result of header name validation */
export interface HeaderNameValidation {
    valid: boolean;
    message?: string;
    sanitized?: string;
}

/** Result of header value validation */
export interface HeaderValueValidation {
    valid: boolean;
    message?: string;
}

/** Map of id -> HeaderEntry as stored in sync storage */
export interface SavedDataMap {
    [id: string]: HeaderEntry;
}
