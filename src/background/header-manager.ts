/**
 * Enhanced header-manager.ts with diagnostic placeholders for missing/disconnected sources
 */
import { isValidHeaderValue, sanitizeHeaderValue } from './rule-validator';
import { normalizeHeaderName } from '../utils/utils.js';
import { storage, declarativeNetRequest } from '../utils/browser-api.js';
import { isWebSocketConnected } from './websocket';
import { validateHeaderName } from '../utils/header-validator.js';
import { getChunkedData } from '../utils/storage-chunking.js';
import { sendMessageWithCallback } from '../utils/messaging';

import type { HeaderEntry, ProcessedEntry, PlaceholderInfo, PlaceholderReason, HeaderRule, SavedDataMap } from '../types/header';
import type { Source } from '../types/websocket';
import { getBrowserAPI } from '../types/browser';

// Track headers using placeholders for badge notification
let headersWithPlaceholders: PlaceholderInfo[] = [];

// Track the highest rule ID from the last update for efficient removal
let lastMaxRuleId = 0;

/**
 * Updates the network request rules based on saved data and dynamic sources.
 * Implements specialized handling for response headers to maximize compatibility.
 * Uses diagnostic placeholders for disconnected/missing dynamic sources.
 */
export function updateNetworkRules(dynamicSources: Source[]): void {
    // Reset placeholder tracking
    headersWithPlaceholders = [];

    // Check if rules execution is paused
    const browserAPI = getBrowserAPI();
    browserAPI.storage.sync.get(['isRulesExecutionPaused'], (result: Record<string, unknown>) => {
        const isPaused = (result.isRulesExecutionPaused as boolean) || false;

        if (isPaused) {
            console.log('Info: Rules execution is paused, clearing all active rules');
            const removeIds = lastMaxRuleId > 0
                ? Array.from({ length: lastMaxRuleId }, (_, i) => i + 1)
                : [];
            declarativeNetRequest!.updateDynamicRules({
                removeRuleIds: removeIds,
                addRules: []
            }).then(() => {
                lastMaxRuleId = 0;
                console.log('Info: All rules cleared while paused');
            });
            return;
        }

        // Continue with normal rule processing if not paused
        // Check if we're connected
        const isConnected = isWebSocketConnected();

        // If not connected, we should not use any dynamic sources
        const effectiveSources: Source[] = isConnected ? dynamicSources : [];

        // Get all saved headers using chunked data retrieval
        getChunkedData('savedData', (savedData: SavedDataMap | null) => {
            savedData = savedData || {};

            // Create rules array for declarativeNetRequest
            const rules: HeaderRule[] = [];
            let ruleId = 1;

            // Separate request and response headers for specialized handling
            const requestEntries: ProcessedEntry[] = [];
            const responseEntries: ProcessedEntry[] = [];

            // First pass - categorize and validate all entries
            for (const id in savedData) {
                const entry: HeaderEntry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) {
                    console.log(`Info: Skipping disabled rule for ${entry.headerName}`);
                    continue;
                }

                // Process entry (now returns entry with placeholder if needed)
                const processedEntry = processEntry(entry, effectiveSources, isConnected);
                if (processedEntry) {
                    if (processedEntry.isResponse) {
                        responseEntries.push(processedEntry);
                    } else {
                        requestEntries.push(processedEntry);
                    }
                }
            }

            // Process request headers (these work reliably)
            requestEntries.forEach(entry => {
                const requestRules = createRequestHeaderRules(entry, ruleId);
                rules.push(...requestRules);
                ruleId += requestRules.length;
            });

            // Process response headers with specialized approach
            responseEntries.forEach(entry => {
                const responseRules = createResponseHeaderRules(entry, ruleId);
                rules.push(...responseRules);
                ruleId += responseRules.length;
            });

            // Log diagnostic placeholder usage
            if (headersWithPlaceholders.length > 0) {
                console.warn(`Info: ${headersWithPlaceholders.length} headers using diagnostic placeholders:`, headersWithPlaceholders);

                // Notify background script to update badge
                sendMessageWithCallback({
                    type: 'headersUsingPlaceholders',
                    headers: headersWithPlaceholders
                }, (_response, _error) => {
                    // Ignore errors when no listeners
                });
            } else {
                // Clear badge if no placeholders
                sendMessageWithCallback({
                    type: 'headersUsingPlaceholders',
                    headers: []
                }, (_response, _error) => {
                    // Ignore errors when no listeners
                });
            }

            // Build removal list from previous max ID (avoid allocating a huge array)
            const removeCount = Math.max(lastMaxRuleId, ruleId - 1);
            const removeRuleIds = removeCount > 0
                ? Array.from({ length: removeCount }, (_, i) => i + 1)
                : [];

            // Update the dynamic rules
            declarativeNetRequest!.updateDynamicRules({
                removeRuleIds,
                addRules: rules
            }).then(() => {
                lastMaxRuleId = ruleId - 1;
                console.log(`Info: Successfully updated ${rules.length} network rules`);
            }).catch((e: Error) => {
                console.error('Error updating rules:', e.message || 'Unknown error');
                sendMessageWithCallback({
                    type: 'ruleUpdateError',
                    error: e.message || 'Unknown error'
                }, (_response, _error) => {
                    // Ignore errors when no popup is listening
                });
            });
        });
    });
}

/**
 * Process an entry and determine if it's valid
 * Now returns entries with diagnostic placeholders instead of null
 */
function processEntry(entry: HeaderEntry, dynamicSources: Source[], isConnected: boolean): ProcessedEntry | null {
    // First validate the header name
    const headerNameValidation = validateHeaderName(entry.headerName, entry.isResponse);
    if (!headerNameValidation.valid) {
        console.log(`Info: Skipping rule for ${entry.headerName} - ${headerNameValidation.message}`);
        return null;
    }

    let headerValue: string = entry.headerValue;
    let usingPlaceholder = false;
    let placeholderReason: PlaceholderReason | null = null;

    // Handle dynamic values
    if (entry.isDynamic && entry.sourceId) {
        // ALWAYS check connection status first for dynamic headers
        if (!isConnected) {
            // APP_DISCONNECTED state - always use placeholder when disconnected
            headerValue = '[APP_DISCONNECTED]';
            usingPlaceholder = true;
            placeholderReason = 'app_disconnected';
            console.warn(`Header "${entry.headerName}" using placeholder - app disconnected`);
        } else {
            // Only look for sources when connected
            const source = dynamicSources.find(s =>
                s.sourceId?.toString() === entry.sourceId?.toString()
            );

            if (!source) {
                // SOURCE_NOT_FOUND state
                headerValue = `[SOURCE_NOT_FOUND:${entry.sourceId}]`;
                usingPlaceholder = true;
                placeholderReason = 'source_not_found';
                console.warn(`Header "${entry.headerName}" using placeholder - source #${entry.sourceId} not found`);
            } else {
                const dynamicContent = source.sourceContent || '';

                if (!dynamicContent) {
                    // EMPTY_SOURCE state
                    headerValue = `[EMPTY_SOURCE:${entry.sourceId}]`;
                    usingPlaceholder = true;
                    placeholderReason = 'empty_source';
                    console.warn(`Header "${entry.headerName}" using placeholder - source #${entry.sourceId} is empty`);
                } else {
                    // Normal case - source has content
                    headerValue = `${entry.prefix || ''}${dynamicContent}${entry.suffix || ''}`;
                }
            }
        }

        // Track headers using placeholders
        if (usingPlaceholder) {
            headersWithPlaceholders.push({
                headerName: entry.headerName,
                sourceId: entry.sourceId,
                reason: placeholderReason!,
                domains: Array.isArray(entry.domains) ? entry.domains : (entry.domain ? [entry.domain] : [])
            });
        }
    }

    // Handle empty static values that were not replaced during import (edge case)
    if (!entry.isDynamic && (!headerValue || !headerValue.trim())) {
        headerValue = '[EMPTY_VALUE]';
        usingPlaceholder = true;
        placeholderReason = 'empty_value';
    }

    // Validate the header value (including placeholders)
    // Skip validation for known placeholders
    const isPlaceholder = headerValue.startsWith('[') && headerValue.endsWith(']');
    if (!isPlaceholder && !isValidHeaderValue(headerValue, entry.headerName)) {
        headerValue = sanitizeHeaderValue(headerValue);
        if (!isValidHeaderValue(headerValue, entry.headerName)) {
            console.log(`Info: Skipping invalid header value for ${entry.headerName}`);
            return null;
        }
    }

    // Process domains
    const domains: string[] = Array.isArray(entry.domains) ? entry.domains :
        (entry.domain ? [entry.domain] : []);

    if (domains.length === 0) {
        console.log(`Info: Skipping rule for ${entry.headerName} - no domains specified`);
        return null;
    }

    // Return processed entry with normalized header name
    return {
        headerName: headerNameValidation.sanitized || normalizeHeaderName(entry.headerName),
        headerValue: headerValue,
        domains: domains,
        isResponse: entry.isResponse === true,
        usingPlaceholder: usingPlaceholder,
        placeholderReason: placeholderReason
    };
}

/**
 * Create rules for request headers — single rule per domain covering all resource types
 */
function createRequestHeaderRules(entry: ProcessedEntry, startId: number): HeaderRule[] {
    const rules: HeaderRule[] = [];
    let ruleId = startId;

    const ALL_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
        'main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
        'font', 'object', 'xmlhttprequest', 'websocket', 'other'
    ] as chrome.declarativeNetRequest.ResourceType[];

    entry.domains.forEach(domain => {
        if (!domain || domain.trim() === '') return;

        const urlFilter = formatUrlPattern(domain);

        rules.push({
            id: ruleId++,
            priority: 100,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [
                    {
                        header: entry.headerName,
                        operation: 'set',
                        value: entry.headerValue
                    },
                    {
                        header: 'Cache-Control',
                        operation: 'set',
                        value: 'no-cache, no-store, must-revalidate'
                    },
                    {
                        header: 'Pragma',
                        operation: 'set',
                        value: 'no-cache'
                    }
                ]
            },
            condition: {
                urlFilter: urlFilter,
                resourceTypes: ALL_RESOURCE_TYPES
            }
        });
    });

    return rules;
}

/**
 * Create rules for response headers — 2 rules per domain (main_frame + sub-resources)
 */
function createResponseHeaderRules(entry: ProcessedEntry, startId: number): HeaderRule[] {
    const rules: HeaderRule[] = [];
    let ruleId = startId;

    const SUB_RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
        'sub_frame', 'stylesheet', 'script', 'image', 'font',
        'xmlhttprequest', 'websocket', 'other'
    ] as chrome.declarativeNetRequest.ResourceType[];

    entry.domains.forEach(domain => {
        if (!domain || domain.trim() === '') return;

        const urlFilter = formatUrlPattern(domain);

        // Main document — higher priority
        rules.push({
            id: ruleId++,
            priority: 1000,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [{
                    header: entry.headerName,
                    operation: 'set',
                    value: entry.headerValue
                }]
            },
            condition: {
                urlFilter: urlFilter,
                resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType]
            }
        });

        // All sub-resources in one rule
        rules.push({
            id: ruleId++,
            priority: 950,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [{
                    header: entry.headerName,
                    operation: 'set',
                    value: entry.headerValue
                }]
            },
            condition: {
                urlFilter: urlFilter,
                resourceTypes: SUB_RESOURCE_TYPES
            }
        });
    });

    return rules;
}

/**
 * Format a domain string into a proper URL pattern for rule matching
 */
export function formatUrlPattern(domain: string): string {
    let urlFilter = domain.trim();

    // If it's already a full URL pattern, validate and return
    if (urlFilter.includes('://')) {
        // Ensure it has a path component
        const protocolEnd = urlFilter.indexOf('://') + 3;
        const afterProtocol = urlFilter.substring(protocolEnd);

        if (!afterProtocol.includes('/')) {
            urlFilter = urlFilter + '/*';
        }

        return urlFilter;
    }

    // Handle special cases

    // IP addresses
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
    if (ipRegex.test(urlFilter)) {
        return '*://' + urlFilter + '/*';
    }

    // IPv6 addresses (basic check)
    if (urlFilter.includes('[') && urlFilter.includes(']')) {
        return '*://' + urlFilter + '/*';
    }

    // Localhost
    if (urlFilter === 'localhost' || urlFilter.startsWith('localhost:')) {
        return '*://' + urlFilter + '/*';
    }

    // Handle wildcards properly
    if (urlFilter.startsWith('*.')) {
        // *.example.com -> *://*.example.com/*
        return '*://' + urlFilter + '/*';
    } else if (urlFilter.startsWith('*') && !urlFilter.startsWith('*://')) {
        // *example.com -> *://*example.com/*
        return '*://' + urlFilter + '/*';
    } else {
        // Regular domain -> *://domain/*
        urlFilter = '*://' + urlFilter;
    }

    // Ensure path component — check if there's a slash AFTER the protocol's "://"
    const protocolEnd = urlFilter.indexOf('://');
    const afterProtocol = protocolEnd >= 0 ? urlFilter.substring(protocolEnd + 3) : urlFilter;
    if (!afterProtocol.includes('/')) {
        urlFilter = urlFilter + '/*';
    }

    return urlFilter;
}

/**
 * Get information about headers using placeholders
 */
export function getHeadersWithPlaceholders(): PlaceholderInfo[] {
    return [...headersWithPlaceholders];
}
