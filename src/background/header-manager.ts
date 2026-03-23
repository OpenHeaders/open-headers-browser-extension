/**
 * Header Manager — builds declarativeNetRequest rules from saved data and dynamic sources.
 *
 * Performance notes:
 * - isPaused is cached in-memory, updated via setRulesPaused() from storage.onChanged
 * - savedData is read from chunked storage (unavoidable — it's the source of truth)
 * - Rule arrays are built in a single pass, no intermediate allocations
 */
declare const browser: typeof chrome | undefined;

import { isValidHeaderValue, sanitizeHeaderValue } from './rule-validator';
import { normalizeHeaderName } from '../utils/utils.js';
import { declarativeNetRequest } from '../utils/browser-api.js';
import { isWebSocketConnected } from './websocket';
import { validateHeaderName } from '../utils/header-validator.js';
import { getChunkedData } from '../utils/storage-chunking.js';
import { sendMessageWithCallback } from '../utils/messaging';
import { logger } from '../utils/logger';

import type { HeaderEntry, ProcessedEntry, PlaceholderInfo, PlaceholderReason, HeaderRule, SavedDataMap } from '../types/header';
import type { Source } from '../types/websocket';

// Track headers using placeholders for badge notification
let headersWithPlaceholders: PlaceholderInfo[] = [];

// Track the highest rule ID from the last update for efficient removal
let lastMaxRuleId = 0;

// Cached pause state — updated by setRulesPaused() from storage.onChanged listener
let isPaused = false;

/**
 * Set the paused state. Called from background.ts when isRulesExecutionPaused changes.
 */
export function setRulesPaused(paused: boolean): void {
    isPaused = paused;
}

/**
 * Get the cached paused state.
 */
export function isRulesPaused(): boolean {
    return isPaused;
}

/**
 * Initialize pause state from storage. Called once at startup.
 */
export function initPauseState(): void {
    const browserAPI = (typeof browser !== 'undefined' ? browser : chrome) as typeof chrome;
    browserAPI.storage.sync.get(['isRulesExecutionPaused'], (result: Record<string, unknown>) => {
        isPaused = (result.isRulesExecutionPaused as boolean) || false;
    });
}

/**
 * Updates the network request rules based on saved data and dynamic sources.
 */
export function updateNetworkRules(dynamicSources: Source[]): void {
    headersWithPlaceholders = [];

    if (isPaused) {
        logger.info('Rules execution is paused, clearing all active rules');
        const removeIds = lastMaxRuleId > 0
            ? Array.from({ length: lastMaxRuleId }, (_, i) => i + 1)
            : [];
        declarativeNetRequest!.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules: []
        }).then(() => {
            lastMaxRuleId = 0;
            logger.debug('All rules cleared while paused');
        });
        return;
    }

    const isConnected = isWebSocketConnected();
    const effectiveSources: Source[] = isConnected ? dynamicSources : [];

    getChunkedData('savedData', (savedData: SavedDataMap | null) => {
        savedData = savedData || {};

        const rules: HeaderRule[] = [];
        let ruleId = 1;

        const requestEntries: ProcessedEntry[] = [];
        const responseEntries: ProcessedEntry[] = [];

        for (const id in savedData) {
            const entry: HeaderEntry = savedData[id];

            if (entry.isEnabled === false) {
                logger.debug(`Skipping disabled rule for ${entry.headerName}`);
                continue;
            }

            const processedEntry = processEntry(entry, effectiveSources, isConnected);
            if (processedEntry) {
                if (processedEntry.isResponse) {
                    responseEntries.push(processedEntry);
                } else {
                    requestEntries.push(processedEntry);
                }
            }
        }

        requestEntries.forEach(entry => {
            const requestRules = createRequestHeaderRules(entry, ruleId);
            rules.push(...requestRules);
            ruleId += requestRules.length;
        });

        responseEntries.forEach(entry => {
            const responseRules = createResponseHeaderRules(entry, ruleId);
            rules.push(...responseRules);
            ruleId += responseRules.length;
        });

        if (headersWithPlaceholders.length > 0) {
            logger.warn(`${headersWithPlaceholders.length} headers using diagnostic placeholders:`, headersWithPlaceholders);

            sendMessageWithCallback({
                type: 'headersUsingPlaceholders',
                headers: headersWithPlaceholders
            }, (_response, _error) => {});
        } else {
            sendMessageWithCallback({
                type: 'headersUsingPlaceholders',
                headers: []
            }, (_response, _error) => {});
        }

        const removeCount = Math.max(lastMaxRuleId, ruleId - 1);
        const removeRuleIds = removeCount > 0
            ? Array.from({ length: removeCount }, (_, i) => i + 1)
            : [];

        declarativeNetRequest!.updateDynamicRules({
            removeRuleIds,
            addRules: rules
        }).then(() => {
            lastMaxRuleId = ruleId - 1;
            logger.info(`Successfully updated ${rules.length} network rules`);
        }).catch((e: Error) => {
            logger.error('Error updating rules:', e.message || 'Unknown error');
            sendMessageWithCallback({
                type: 'ruleUpdateError',
                error: e.message || 'Unknown error'
            }, (_response, _error) => {});
        });
    });
}

function processEntry(entry: HeaderEntry, dynamicSources: Source[], isConnected: boolean): ProcessedEntry | null {
    const headerNameValidation = validateHeaderName(entry.headerName, entry.isResponse);
    if (!headerNameValidation.valid) {
        logger.debug(`Skipping rule for ${entry.headerName} - ${headerNameValidation.message}`);
        return null;
    }

    let headerValue: string = entry.headerValue;
    let usingPlaceholder = false;
    let placeholderReason: PlaceholderReason | null = null;

    if (entry.isDynamic && entry.sourceId) {
        if (!isConnected) {
            headerValue = '[APP_DISCONNECTED]';
            usingPlaceholder = true;
            placeholderReason = 'app_disconnected';
            logger.warn(`Header "${entry.headerName}" using placeholder - app disconnected`);
        } else {
            const source = dynamicSources.find(s =>
                s.sourceId?.toString() === entry.sourceId?.toString()
            );

            if (!source) {
                headerValue = `[SOURCE_NOT_FOUND:${entry.sourceId}]`;
                usingPlaceholder = true;
                placeholderReason = 'source_not_found';
                logger.warn(`Header "${entry.headerName}" using placeholder - source #${entry.sourceId} not found`);
            } else {
                const dynamicContent = source.sourceContent || '';

                if (!dynamicContent) {
                    headerValue = `[EMPTY_SOURCE:${entry.sourceId}]`;
                    usingPlaceholder = true;
                    placeholderReason = 'empty_source';
                    logger.warn(`Header "${entry.headerName}" using placeholder - source #${entry.sourceId} is empty`);
                } else {
                    headerValue = `${entry.prefix || ''}${dynamicContent}${entry.suffix || ''}`;
                }
            }
        }

        if (usingPlaceholder) {
            headersWithPlaceholders.push({
                headerName: entry.headerName,
                sourceId: entry.sourceId,
                reason: placeholderReason!,
                domains: Array.isArray(entry.domains) ? entry.domains : (entry.domain ? [entry.domain] : [])
            });
        }
    }

    if (!entry.isDynamic && (!headerValue || !headerValue.trim())) {
        headerValue = '[EMPTY_VALUE]';
        usingPlaceholder = true;
        placeholderReason = 'empty_value';
    }

    const isPlaceholder = headerValue.startsWith('[') && headerValue.endsWith(']');
    if (!isPlaceholder && !isValidHeaderValue(headerValue, entry.headerName)) {
        headerValue = sanitizeHeaderValue(headerValue);
        if (!isValidHeaderValue(headerValue, entry.headerName)) {
            logger.debug(`Skipping invalid header value for ${entry.headerName}`);
            return null;
        }
    }

    const domains: string[] = Array.isArray(entry.domains) ? entry.domains :
        (entry.domain ? [entry.domain] : []);

    if (domains.length === 0) {
        logger.debug(`Skipping rule for ${entry.headerName} - no domains specified`);
        return null;
    }

    return {
        headerName: headerNameValidation.sanitized || normalizeHeaderName(entry.headerName),
        headerValue: headerValue,
        domains: domains,
        isResponse: entry.isResponse === true,
        usingPlaceholder: usingPlaceholder,
        placeholderReason: placeholderReason
    };
}

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
                    { header: entry.headerName, operation: 'set', value: entry.headerValue },
                    { header: 'Cache-Control', operation: 'set', value: 'no-cache, no-store, must-revalidate' },
                    { header: 'Pragma', operation: 'set', value: 'no-cache' }
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

        rules.push({
            id: ruleId++,
            priority: 1000,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [{ header: entry.headerName, operation: 'set', value: entry.headerValue }]
            },
            condition: {
                urlFilter: urlFilter,
                resourceTypes: ['main_frame' as chrome.declarativeNetRequest.ResourceType]
            }
        });

        rules.push({
            id: ruleId++,
            priority: 950,
            action: {
                type: 'modifyHeaders',
                responseHeaders: [{ header: entry.headerName, operation: 'set', value: entry.headerValue }]
            },
            condition: {
                urlFilter: urlFilter,
                resourceTypes: SUB_RESOURCE_TYPES
            }
        });
    });

    return rules;
}

export function formatUrlPattern(domain: string): string {
    let urlFilter = domain.trim();

    if (urlFilter.includes('://')) {
        const protocolEnd = urlFilter.indexOf('://') + 3;
        const afterProtocol = urlFilter.substring(protocolEnd);
        if (!afterProtocol.includes('/')) {
            urlFilter = urlFilter + '/*';
        }
        return urlFilter;
    }

    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
    if (ipRegex.test(urlFilter)) {
        return '*://' + urlFilter + '/*';
    }

    if (urlFilter.includes('[') && urlFilter.includes(']')) {
        return '*://' + urlFilter + '/*';
    }

    if (urlFilter === 'localhost' || urlFilter.startsWith('localhost:')) {
        return '*://' + urlFilter + '/*';
    }

    if (urlFilter.startsWith('*.')) {
        return '*://' + urlFilter + '/*';
    } else if (urlFilter.startsWith('*') && !urlFilter.startsWith('*://')) {
        return '*://' + urlFilter + '/*';
    } else {
        urlFilter = '*://' + urlFilter;
    }

    const protocolEnd = urlFilter.indexOf('://');
    const afterProtocol = protocolEnd >= 0 ? urlFilter.substring(protocolEnd + 3) : urlFilter;
    if (!afterProtocol.includes('/')) {
        urlFilter = urlFilter + '/*';
    }

    return urlFilter;
}

export function getHeadersWithPlaceholders(): PlaceholderInfo[] {
    return [...headersWithPlaceholders];
}
