/**
 * Enhanced header-manager.js with specialized response header support
 * and disconnected dynamic source handling
 */
import { isValidHeaderValue, sanitizeHeaderValue } from './rule-validator.js';
import { normalizeHeaderName } from '../utils/utils.js';
import { storage, declarativeNetRequest, runtime } from '../utils/browser-api.js';
import { isWebSocketConnected } from './websocket.js';
import { validateHeaderName } from '../utils/header-validator.js';

/**
 * Updates the network request rules based on saved data and dynamic sources.
 * Implements specialized handling for response headers to maximize compatibility.
 * Handles disconnected dynamic sources by skipping them.
 * @param {Array} dynamicSources - The current dynamic sources from WebSocket
 */
export function updateNetworkRules(dynamicSources) {
    // Check if we're connected
    const isConnected = isWebSocketConnected();

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

            // Process entry and add to appropriate array
            const processedEntry = processEntry(entry, dynamicSources, isConnected);
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
            runtime.sendMessage({
                type: 'ruleUpdateError',
                error: e.message || 'Unknown error'
            }).catch(() => {
                // Ignore errors when no popup is listening
            });
        });
    });
}

/**
 * Process an entry and determine if it's valid
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

    // Handle dynamic values
    if (entry.isDynamic && entry.sourceId) {
        // If not connected, skip dynamic headers
        if (!isConnected) {
            console.log(`Info: Skipping dynamic header ${entry.headerName} - local app not connected`);
            return null;
        }

        const source = dynamicSources.find(s => s.sourceId?.toString() === entry.sourceId?.toString() ||
            s.locationId?.toString() === entry.sourceId?.toString());

        if (source) {
            const dynamicContent = source.sourceContent || source.locationContent;

            // If dynamic content is empty, skip this header
            if (!dynamicContent) {
                console.log(`Info: Skipping rule for ${entry.headerName} - dynamic source ${entry.sourceId} has empty content`);
                return null;
            }

            const prefix = entry.prefix || '';
            const suffix = entry.suffix || '';
            headerValue = `${prefix}${dynamicContent}${suffix}`;
        } else {
            console.log(`Info: Skipping rule for ${entry.headerName} - dynamic source ${entry.sourceId} not found`);
            return null;
        }
    }

    // Validate the header value
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
        isResponse: entry.isResponse === true
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