/**
 * Enhanced header-manager.js with diagnostic placeholders for missing/disconnected sources
 */
import { isValidHeaderValue, sanitizeHeaderValue } from './rule-validator.js';
import { normalizeHeaderName } from '../utils/utils.js';
import { storage, declarativeNetRequest, runtime } from '../utils/browser-api.js';
import { isWebSocketConnected } from './websocket.js';
import { validateHeaderName } from '../utils/header-validator.js';

// Track headers using placeholders for badge notification
let headersWithPlaceholders = [];

// Helper function for safe message sending
const sendMessageSafely = (message, callback) => {
    runtime.sendMessage(message, (response) => {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        if (browserAPI.runtime.lastError) {
            // This is expected when no listeners are available
            if (callback) callback(null, browserAPI.runtime.lastError);
        } else {
            if (callback) callback(response, null);
        }
    });
};

/**
 * Updates the network request rules based on saved data and dynamic sources.
 * Implements specialized handling for response headers to maximize compatibility.
 * Uses diagnostic placeholders for disconnected/missing dynamic sources.
 * @param {Array} dynamicSources - The current dynamic sources from WebSocket
 */
export function updateNetworkRules(dynamicSources) {
    // Reset placeholder tracking
    headersWithPlaceholders = [];

    // Check if we're connected
    const isConnected = isWebSocketConnected();

    // If not connected, we should not use any dynamic sources
    const effectiveSources = isConnected ? dynamicSources : [];

    // Get all saved headers
    storage.sync.get(['savedData'], (result) => {
        const savedData = result.savedData || {};

        // Create rules array for declarativeNetRequest
        const rules = [];
        let ruleId = 1;

        // Separate request and response headers for specialized handling
        const requestEntries = [];
        const responseEntries = [];

        // First pass - categorize and validate all entries
        for (const id in savedData) {
            const entry = savedData[id];

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
            sendMessageSafely({
                type: 'headersUsingPlaceholders',
                headers: headersWithPlaceholders
            }, (response, error) => {
                // Ignore errors when no listeners
            });
        } else {
            // Clear badge if no placeholders
            sendMessageSafely({
                type: 'headersUsingPlaceholders',
                headers: []
            }, (response, error) => {
                // Ignore errors when no listeners
            });
        }

        // Log response header details for debugging
        if (responseEntries.length > 0) {
            console.log(`Info: Creating ${rules.length} total rules (${responseEntries.length} response headers)`);
            console.log(`Info: Response headers being set:`);
            responseEntries.forEach(entry => {
                console.log(`- ${entry.headerName}: "${entry.headerValue}" for domains: ${entry.domains.join(', ')}`);
            });
        }

        // Update the dynamic rules
        declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from({ length: 2000 }, (_, i) => i + 1), // Remove all existing rules
            addRules: rules
        }).then(() => {
            console.log(`Info: Successfully updated ${rules.length} network rules`);
            if (rules.length > 0) {
                console.log('Info: Example rule:', JSON.stringify(rules[0].condition));
            }
        }).catch(e => {
            console.error('Error updating rules:', e.message || 'Unknown error');
            sendMessageSafely({
                type: 'ruleUpdateError',
                error: e.message || 'Unknown error'
            }, (response, error) => {
                // Ignore errors when no popup is listening
            });
        });
    });
}

/**
 * Process an entry and determine if it's valid
 * Now returns entries with diagnostic placeholders instead of null
 * @param {Object} entry - The header entry
 * @param {Array} dynamicSources - Available dynamic sources
 * @param {boolean} isConnected - Whether the local app is connected
 * @returns {Object|null} - Processed entry or null if invalid
 */
function processEntry(entry, dynamicSources, isConnected) {
    // First validate the header name
    const headerNameValidation = validateHeaderName(entry.headerName, entry.isResponse);
    if (!headerNameValidation.valid) {
        console.log(`Info: Skipping rule for ${entry.headerName} - ${headerNameValidation.message}`);
        return null;
    }

    let headerValue = entry.headerValue;
    let usingPlaceholder = false;
    let placeholderReason = null;

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
                s.sourceId?.toString() === entry.sourceId?.toString() ||
                s.locationId?.toString() === entry.sourceId?.toString()
            );

            if (!source) {
                // SOURCE_NOT_FOUND state
                headerValue = `[SOURCE_NOT_FOUND:${entry.sourceId}]`;
                usingPlaceholder = true;
                placeholderReason = 'source_not_found';
                console.warn(`Header "${entry.headerName}" using placeholder - source #${entry.sourceId} not found`);
            } else {
                const dynamicContent = source.sourceContent || source.locationContent || '';

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
                reason: placeholderReason,
                domains: entry.domains
            });
        }
    }

    // Validate the header value (including placeholders)
    if (!isValidHeaderValue(headerValue, entry.headerName)) {
        headerValue = sanitizeHeaderValue(headerValue);
        if (!isValidHeaderValue(headerValue, entry.headerName)) {
            console.log(`Info: Skipping invalid header value for ${entry.headerName}`);
            return null;
        }
    }

    // Process domains
    const domains = Array.isArray(entry.domains) ? entry.domains :
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
 * Create rules for request headers
 * @param {Object} entry - Processed entry
 * @param {number} startId - Starting rule ID
 * @returns {Array} - Array of rules
 */
function createRequestHeaderRules(entry, startId) {
    const rules = [];
    let ruleId = startId;

    // Process each domain
    entry.domains.forEach(domain => {
        if (!domain || domain.trim() === '') return;

        // Format the URL pattern
        const urlFilter = formatUrlPattern(domain);

        console.log(`Info: Creating request header rule for ${entry.headerName} with URL filter: ${urlFilter}`);

        // Create main frame rule
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
                    // Add cache prevention headers
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
                resourceTypes: ['main_frame']
            }
        });

        // Create sub-resources rule
        rules.push({
            id: ruleId++,
            priority: 90,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [
                    {
                        header: entry.headerName,
                        operation: 'set',
                        value: entry.headerValue
                    },
                    // Add cache prevention headers
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
                resourceTypes: ['sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'other']
            }
        });
    });

    return rules;
}

/**
 * Create rules for response headers with maximum compatibility
 * @param {Object} entry - Processed entry
 * @param {number} startId - Starting rule ID
 * @returns {Array} - Array of rules
 */
function createResponseHeaderRules(entry, startId) {
    const rules = [];
    let ruleId = startId;

    // Process each domain
    entry.domains.forEach(domain => {
        if (!domain || domain.trim() === '') return;

        // Format the URL pattern - critical for response headers
        let urlFilter = formatUrlPattern(domain);

        console.log(`Info: Creating response header rule for ${entry.headerName} with URL filter: ${urlFilter}`);

        // CRITICAL: Try multiple approaches for response headers

        // Approach 1: Ultra-high priority for main document
        rules.push({
            id: ruleId++,
            priority: 1000, // Maximum possible priority
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
                resourceTypes: ['main_frame']
            }
        });

        // Approach 2: Add rules for each individual resource type
        // This increases chances of the header being visible
        ['sub_frame', 'stylesheet', 'script', 'image', 'font', 'xmlhttprequest'].forEach(resourceType => {
            rules.push({
                id: ruleId++,
                priority: 950, // Very high priority
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
                    resourceTypes: [resourceType]
                }
            });
        });

        // Approach 3: Try with and without exact scheme matching for maximum compatibility
        if (!urlFilter.startsWith('http')) {
            // Try with explicit HTTP version as well
            const httpUrlFilter = 'http://' + domain.trim().replace(/^\*:\/\//, '');
            const httpsUrlFilter = 'https://' + domain.trim().replace(/^\*:\/\//, '');

            // HTTP explicit rule
            rules.push({
                id: ruleId++,
                priority: 900,
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: [{
                        header: entry.headerName,
                        operation: 'set',
                        value: entry.headerValue
                    }]
                },
                condition: {
                    urlFilter: httpUrlFilter + '/*',
                    resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
                }
            });

            // HTTPS explicit rule
            rules.push({
                id: ruleId++,
                priority: 900,
                action: {
                    type: 'modifyHeaders',
                    responseHeaders: [{
                        header: entry.headerName,
                        operation: 'set',
                        value: entry.headerValue
                    }]
                },
                condition: {
                    urlFilter: httpsUrlFilter + '/*',
                    resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest']
                }
            });
        }
    });

    return rules;
}

/**
 * Format a domain string into a proper URL pattern for rule matching
 * @param {string} domain - Domain pattern
 * @returns {string} - Formatted URL pattern
 */
function formatUrlPattern(domain) {
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

    // Ensure path component
    if (!urlFilter.includes('/') || urlFilter.endsWith('://')) {
        urlFilter = urlFilter + '/*';
    } else {
        // Check if it ends with a domain without path
        const lastSlash = urlFilter.lastIndexOf('/');
        const protocolSlashes = urlFilter.indexOf('://');

        // If the only slashes are from the protocol, add /*
        if (lastSlash <= protocolSlashes + 1) {
            urlFilter = urlFilter + '/*';
        }
    }

    return urlFilter;
}

/**
 * Get information about headers using placeholders
 * @returns {Array} - Array of headers with placeholder information
 */
export function getHeadersWithPlaceholders() {
    return [...headersWithPlaceholders];
}