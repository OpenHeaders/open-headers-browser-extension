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

import type { HeaderEntry, ResolvedEntry, EntryResult, PlaceholderInfo, HeaderRule, SavedDataMap } from '../types/header';
import type { Source } from '../types/websocket';

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
    if (isPaused) {
        logger.info('HeaderManager', 'Rules execution is paused, clearing all active rules');
        const removeIds = lastMaxRuleId > 0
            ? Array.from({ length: lastMaxRuleId }, (_, i) => i + 1)
            : [];
        declarativeNetRequest!.updateDynamicRules({
            removeRuleIds: removeIds,
            addRules: []
        }).then(() => {
            lastMaxRuleId = 0;
            logger.debug('HeaderManager', 'All rules cleared while paused');
        });
        return;
    }

    const isConnected = isWebSocketConnected();
    const effectiveSources: Source[] = isConnected ? dynamicSources : [];

    getChunkedData('savedData', (savedData: SavedDataMap | null) => {
        savedData = savedData || {};

        const rules: HeaderRule[] = [];
        let ruleId = 1;

        const requestEntries: ResolvedEntry[] = [];
        const responseEntries: ResolvedEntry[] = [];
        const placeholders: PlaceholderInfo[] = [];

        for (const id in savedData) {
            const entry: HeaderEntry = savedData[id];

            if (entry.isEnabled === false) {
                logger.debug('HeaderManager', `Skipping disabled rule for ${entry.headerName}`);
                continue;
            }

            const result = processEntry(entry, effectiveSources, isConnected);
            if (!result) continue;

            if (result.resolved) {
                if (result.entry.isResponse) {
                    responseEntries.push(result.entry);
                } else {
                    requestEntries.push(result.entry);
                }
            } else {
                placeholders.push(result.placeholder);
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

        if (placeholders.length > 0) {
            logger.warn('HeaderManager', `${placeholders.length} headers not injected (unresolved):`, placeholders);
        }

        sendMessageWithCallback({
            type: 'headersUsingPlaceholders',
            headers: placeholders
        }, (_response, _error) => {});

        const removeCount = Math.max(lastMaxRuleId, ruleId - 1);
        const removeRuleIds = removeCount > 0
            ? Array.from({ length: removeCount }, (_, i) => i + 1)
            : [];

        declarativeNetRequest!.updateDynamicRules({
            removeRuleIds,
            addRules: rules
        }).then(() => {
            lastMaxRuleId = ruleId - 1;
            logger.info('HeaderManager', `Successfully updated ${rules.length} network rules`);
        }).catch((e: Error) => {
            logger.error('HeaderManager', 'Error updating rules:', e.message || 'Unknown error');
            sendMessageWithCallback({
                type: 'ruleUpdateError',
                error: e.message || 'Unknown error'
            }, (_response, _error) => {});
        });
    });
}

function processEntry(entry: HeaderEntry, dynamicSources: Source[], isConnected: boolean): EntryResult | null {
    const headerNameValidation = validateHeaderName(entry.headerName, entry.isResponse);
    if (!headerNameValidation.valid) {
        logger.debug('HeaderManager', `Skipping rule for ${entry.headerName} - ${headerNameValidation.message}`);
        return null;
    }

    const domains: string[] = Array.isArray(entry.domains) ? entry.domains :
        (entry.domain ? [entry.domain] : []);

    if (domains.length === 0) {
        logger.debug('HeaderManager', `Skipping rule for ${entry.headerName} - no domains specified`);
        return null;
    }

    const headerName = headerNameValidation.sanitized || normalizeHeaderName(entry.headerName);

    if (entry.isDynamic && entry.sourceId) {
        if (!isConnected) {
            logger.warn('HeaderManager', `Header "${entry.headerName}" not injected — app disconnected`);
            return { resolved: false, placeholder: { headerName, sourceId: entry.sourceId, reason: 'app_disconnected', domains } };
        }

        const source = dynamicSources.find(s =>
            s.sourceId?.toString() === entry.sourceId?.toString()
        );

        if (!source) {
            logger.warn('HeaderManager', `Header "${entry.headerName}" not injected — source #${entry.sourceId} not found`);
            return { resolved: false, placeholder: { headerName, sourceId: entry.sourceId, reason: 'source_not_found', domains } };
        }

        const dynamicContent = source.sourceContent || '';

        if (!dynamicContent) {
            logger.warn('HeaderManager', `Header "${entry.headerName}" not injected — source #${entry.sourceId} is empty`);
            return { resolved: false, placeholder: { headerName, sourceId: entry.sourceId, reason: 'empty_source', domains } };
        }

        const headerValue = `${entry.prefix || ''}${dynamicContent}${entry.suffix || ''}`;
        if (!isValidHeaderValue(headerValue, entry.headerName)) {
            const sanitized = sanitizeHeaderValue(headerValue);
            if (!isValidHeaderValue(sanitized, entry.headerName)) {
                logger.debug('HeaderManager', `Skipping invalid header value for ${entry.headerName}`);
                return null;
            }
            return { resolved: true, entry: { headerName, headerValue: sanitized, domains, isResponse: entry.isResponse === true } };
        }
        return { resolved: true, entry: { headerName, headerValue, domains, isResponse: entry.isResponse === true } };
    }

    if (!entry.headerValue || !entry.headerValue.trim()) {
        logger.warn('HeaderManager', `Header "${entry.headerName}" not injected — value is empty`);
        return { resolved: false, placeholder: { headerName, reason: 'empty_value', domains } };
    }

    let headerValue = entry.headerValue;
    if (!isValidHeaderValue(headerValue, entry.headerName)) {
        headerValue = sanitizeHeaderValue(headerValue);
        if (!isValidHeaderValue(headerValue, entry.headerName)) {
            logger.debug('HeaderManager', `Skipping invalid header value for ${entry.headerName}`);
            return null;
        }
    }

    return { resolved: true, entry: { headerName, headerValue, domains, isResponse: entry.isResponse === true } };
}

function createRequestHeaderRules(entry: ResolvedEntry, startId: number): HeaderRule[] {
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

function createResponseHeaderRules(entry: ResolvedEntry, startId: number): HeaderRule[] {
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
