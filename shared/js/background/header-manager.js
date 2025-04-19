/**
 * Header management and rule processing
 */
import { isValidHeaderValue, sanitizeHeaderValue } from './rule-validator.js';
import { normalizeHeaderName } from '../shared/utils.js';
import { storage, declarativeNetRequest, runtime } from '../shared/browser-api.js';

/**
 * Updates the network request rules based on saved data and dynamic sources.
 * @param {Array} dynamicSources - The current dynamic sources from WebSocket
 */
export function updateNetworkRules(dynamicSources) {
    // Get all saved headers
    storage.sync.get(['savedData'], (result) => {
        const savedData = result.savedData || {};

        // Create rules array for declarativeNetRequest
        const rules = [];
        let ruleId = 1;
        const invalidHeaderEntries = [];

        // Process each saved header entry
        for (const id in savedData) {
            const entry = savedData[id];
            let headerValue = entry.headerValue;

            // If this is a dynamic header, look up the current value
            if (entry.isDynamic && entry.sourceId) {
                const source = dynamicSources.find(s => s.sourceId?.toString() === entry.sourceId?.toString() ||
                    s.locationId?.toString() === entry.sourceId?.toString());
                if (source) {
                    const dynamicContent = source.sourceContent || source.locationContent;

                    // Apply prefix and suffix if they exist
                    const prefix = entry.prefix || '';
                    const suffix = entry.suffix || '';

                    // Combine prefix + dynamic content + suffix
                    headerValue = `${prefix}${dynamicContent}${suffix}`;
                } else {
                    // Source not found - skip this rule
                    console.log(`Info: Skipping rule for ${entry.headerName} - dynamic source ${entry.sourceId} not found`);
                    invalidHeaderEntries.push(id);
                    continue;
                }
            }

            // Validate the header value for browser's API
            if (!isValidHeaderValue(headerValue)) {
                // Keep track of invalid entries
                invalidHeaderEntries.push(id);

                // Try sanitizing the value
                headerValue = sanitizeHeaderValue(headerValue);

                // Still invalid? Skip this rule
                if (!isValidHeaderValue(headerValue)) {
                    console.log(`Info: Skipping invalid header value for ${entry.headerName} on ${entry.domains}`);
                    continue;
                }
            }

            // Check for multiple domains vs single domain
            let domains = Array.isArray(entry.domains) ? entry.domains : [];

            // Legacy support for single domain stored in domain property
            if (entry.domain && domains.length === 0) {
                domains = [entry.domain];
            }

            // If no domains are specified, skip this rule
            if (domains.length === 0) {
                console.log(`Info: Skipping rule for ${entry.headerName} - no domains specified`);
                continue;
            }

            // Create a request header modification object to be used in each rule
            const customHeaderModification = {
                // Use the normalized header name to match browser's behavior
                header: normalizeHeaderName(entry.headerName),
                operation: 'set',
                value: headerValue
            };

            // Define cache prevention headers - this helps ensure our headers are always applied
            // by preventing the browser from using cached responses
            const preventCacheHeaders = [
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
            ];

            // Combine the custom header and cache prevention headers
            const allHeaderModifications = [customHeaderModification, ...preventCacheHeaders];

            // Create a separate rule for each domain
            domains.forEach(domain => {
                if (!domain || domain.trim() === '') return;

                // Create the main rule for the main_frame (the page itself)
                rules.push({
                    id: ruleId++,
                    priority: 2, // Higher priority for main page
                    action: {
                        type: 'modifyHeaders',
                        requestHeaders: allHeaderModifications
                    },
                    condition: {
                        urlFilter: domain.trim(),
                        resourceTypes: ['main_frame']
                    }
                });

                // Create a second rule for all other resources (images, scripts, etc.)
                rules.push({
                    id: ruleId++,
                    priority: 1,
                    action: {
                        type: 'modifyHeaders',
                        requestHeaders: allHeaderModifications
                    },
                    condition: {
                        urlFilter: domain.trim(),
                        resourceTypes: ['sub_frame', 'stylesheet', 'script', 'image', 'font', 'object', 'xmlhttprequest', 'other']
                    }
                });

                console.log(`Info: Created rules for ${entry.headerName} on ${domain.trim()} with cache prevention`);
            });
        }

        // If we found invalid entries, update storage with sanitized values
        if (invalidHeaderEntries.length > 0) {
            const updatedData = { ...savedData };

            for (const id of invalidHeaderEntries) {
                const entry = updatedData[id];
                if (entry) {
                    // For entries with missing sources, mark them for UI highlighting
                    if (entry.isDynamic) {
                        const source = dynamicSources.find(s => s.sourceId?.toString() === entry.sourceId?.toString() ||
                            s.locationId?.toString() === entry.sourceId?.toString());

                        if (!source) {
                            updatedData[id] = {
                                ...entry,
                                sourceMissing: true  // Flag to indicate source is missing
                            };
                            continue;
                        }
                    }

                    // Only update static header values, don't modify dynamic ones
                    if (!entry.isDynamic) {
                        updatedData[id] = {
                            ...entry,
                            headerValue: sanitizeHeaderValue(entry.headerValue)
                        };
                    }
                }
            }

            // Update storage with sanitized values and missing source flags
            storage.sync.set({ savedData: updatedData });
        }

        // Update the dynamic rules
        declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from({ length: 1000 }, (_, i) => i + 1), // Remove all existing rules (up to 1000)
            addRules: rules
        }).then(() => {
            console.log('Info: Updated network rules:', rules.length);
            if (rules.length > 0) {
                console.log('Info: Example rule:', JSON.stringify(rules[0].condition));
            }
            return new Promise(resolve => setTimeout(resolve, 50));
        }).catch(e => {
            console.log('Info: Rule update issue:', e.message || 'Unknown error');
            runtime.sendMessage({
                type: 'ruleUpdateError',
                error: e.message || 'Unknown error'
            }).catch(() => {
                // Ignore errors when no popup is listening
            });
        });
    });
}