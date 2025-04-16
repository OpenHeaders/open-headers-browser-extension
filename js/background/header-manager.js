/**
 * Header management and rule processing
 */
import { isValidHeaderValue, sanitizeHeaderValue } from './rule-validator.js';
import { normalizeHeaderName } from '../shared/utils.js';

/**
 * Updates the network request rules based on saved data and dynamic sources.
 * @param {Array} dynamicSources - The current dynamic sources from WebSocket
 */
export function updateNetworkRules(dynamicSources) {
    // Get all saved headers
    chrome.storage.sync.get(['savedData'], (result) => {
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

                    // Optionally store last known good value for fallback
                    // savedData[id].lastKnownValue = headerValue;
                } else {
                    // Source not found - we have a few options here:

                    // Option 1: Skip this rule entirely (safer approach)
                    console.log(`Info: Skipping rule for ${entry.headerName} - dynamic source ${entry.sourceId} not found`);

                    // Mark this entry as having a missing source
                    invalidHeaderEntries.push(id);

                    // Skip this rule since we have no value to use
                    continue;

                    // Option 2 (alternative): Use a placeholder value or last known value
                    // If you want to implement this instead, you could store the last known
                    // value in the entry itself when updating the header values
                    /*
                    if (entry.lastKnownValue) {
                        headerValue = entry.lastKnownValue;
                        console.log(`Info: Using last known value for ${entry.headerName} since source ${entry.sourceId} is missing`);
                    } else {
                        console.log(`Info: Skipping rule for ${entry.headerName} - dynamic source ${entry.sourceId} not found and no fallback available`);
                        continue;
                    }
                    */
                }
            }

            // Validate the header value for Chrome's API
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
            const requestHeaderModification = {
                // Use the normalized header name to match Chrome's behavior
                header: normalizeHeaderName(entry.headerName),
                operation: 'set',
                value: headerValue
            };

            // Create a separate rule for each domain
            domains.forEach(domain => {
                if (!domain || domain.trim() === '') return;

                rules.push({
                    id: ruleId++,
                    priority: 1,
                    action: {
                        type: 'modifyHeaders',
                        requestHeaders: [requestHeaderModification]
                    },
                    condition: {
                        urlFilter: domain.trim(),
                        resourceTypes: ['main_frame', 'sub_frame', 'stylesheet', 'script', 'image',
                            'font', 'object', 'xmlhttprequest', 'ping', 'csp_report',
                            'media', 'websocket', 'other']
                    }
                });
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
            chrome.storage.sync.set({ savedData: updatedData });
        }

        // Update the dynamic rules
        chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: Array.from({ length: 1000 }, (_, i) => i + 1), // Remove all existing rules (up to 1000)
            addRules: rules
        }).then(() => {
            console.log('Info: Updated network rules:', rules.length);

            // This helps keep the service worker alive by doing some work
            return new Promise(resolve => setTimeout(resolve, 50));
        }).catch(e => {
            console.log('Info: Rule update issue:', e.message || 'Unknown error');

            // Notify popup of the issue
            chrome.runtime.sendMessage({
                type: 'ruleUpdateError',
                error: e.message || 'Unknown error'
            }).catch(() => {
                // Ignore errors when no popup is listening
            });
        });
    });
}