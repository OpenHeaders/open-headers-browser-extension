/**
 * Handles entry management (rendering, updating, saving, removing)
 */
import { formatHeaderValue, truncateText, normalizeHeaderName, generateUniqueId } from '../shared/utils.js';
import { validateHeaderValue } from '../background/rule-validator.js';
import { showNotification } from './notification-system.js';
import { getDynamicSources } from './ui-manager.js';

// Keep track of current entries data for easy refreshing
let currentSavedData = {};
let currentEntriesList = null;

/**
 * Formats domain list for display in a limited space
 * @param {Array|string} domains - Array of domains or single domain string
 * @param {number} maxToShow - Maximum number of domains to display before showing count
 * @returns {Object} - HTML content and tooltip for domains
 */
function formatDomains(domains, maxToShow = 3) {
    // Convert to array if it's a string (legacy format)
    const domainsArray = Array.isArray(domains) ? domains : (domains ? [domains] : []);

    if (domainsArray.length === 0) {
        return { html: '<span class="domain-tag-small">No domains</span>', tooltip: 'No domains specified' };
    }

    // Prepare tooltip with all domains
    const tooltip = domainsArray.join('\n');

    // Prepare HTML with limited domains
    let html = '';
    const displayDomains = domainsArray.slice(0, maxToShow);

    displayDomains.forEach(domain => {
        html += `<span class="domain-tag-small" title="${domain}">${truncateText(domain, 20)}</span>`;
    });

    // Add count if there are more domains than shown
    if (domainsArray.length > maxToShow) {
        html += `<span class="domain-count">+${domainsArray.length - maxToShow} more</span>`;
    }

    return { html, tooltip };
}

/**
 * Loads existing entries from storage and renders them.
 * @param {HTMLElement} entriesList - The container to render entries in
 */
export function loadEntries(entriesList) {
    currentEntriesList = entriesList;
    chrome.storage.sync.get(['savedData'], (result) => {
        const savedData = result.savedData || {};
        currentSavedData = savedData; // Store for later refreshes
        renderEntries(entriesList, savedData);
    });
}

/**
 * Renders all saved entries and displays them in the list.
 * @param {HTMLElement} entriesList - The container to render entries in
 * @param {Object} data - Data objects containing header entries
 */
export function renderEntries(entriesList, data) {
    entriesList.innerHTML = '';
    for (const id in data) {
        const { headerName, headerValue, domain, domains, isDynamic, sourceId, locationId, prefix, suffix } = data[id];
        // Use sourceId if available, fall back to locationId for backward compatibility
        const effectiveSourceId = sourceId || locationId;

        // Support both new domains array and legacy domain string
        const effectiveDomains = domains || (domain ? [domain] : []);

        // Get prefix and suffix with defaults
        const effectivePrefix = prefix || '';
        const effectiveSuffix = suffix || '';

        const entryDiv = renderEntry(
            entriesList,
            id,
            headerName,
            headerValue,
            effectiveDomains,
            isDynamic,
            effectiveSourceId,
            effectivePrefix,
            effectiveSuffix
        );
        entriesList.appendChild(entryDiv);
    }
}

/**
 * Renders one entry and returns its container element.
 * @param {HTMLElement} entriesList - The container with all entries
 * @param {string} id - Unique ID of the entry
 * @param {string} headerName - Name of the header
 * @param {string} headerValue - Value of the header (for static headers)
 * @param {Array} domains - Array of domain patterns to apply header to
 * @param {boolean} isDynamic - Whether this is a dynamic header
 * @param {string} sourceId - ID of the dynamic source (for dynamic headers)
 * @param {string} prefix - Prefix for dynamic headers
 * @param {string} suffix - Suffix for dynamic headers
 * @returns {HTMLElement} - The rendered entry element
 */
export function renderEntry(entriesList, id, headerName, headerValue, domains, isDynamic, sourceId, prefix = '', suffix = '') {
    const entryDiv = document.createElement('div');
    entryDiv.classList.add('entryItem');
    entryDiv.dataset.entryId = id; // Store ID for easy targeting later

    // Type indicator
    const typeTd = document.createElement('span');
    typeTd.classList.add('type-indicator');
    if (isDynamic) {
        typeTd.textContent = 'D';
        typeTd.classList.add('type-dynamic');
        typeTd.title = 'Dynamic value from a pre-configured source';
    } else {
        typeTd.textContent = 'S';
        typeTd.classList.add('type-static');
        typeTd.title = 'Static value inserted by the user';
    }

    // Header name span - normalize to match Chrome's behavior
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('truncated');
    // Normalize the header name to match how Chrome will send it
    nameSpan.textContent = normalizeHeaderName(headerName);
    nameSpan.title = normalizeHeaderName(headerName); // Tooltip with full name

    // Header value span (truncated)
    const valueSpan = document.createElement('span');
    valueSpan.classList.add('truncated', 'header-value');
    valueSpan.dataset.isDynamic = isDynamic ? 'true' : 'false'; // Store as string
    valueSpan.dataset.sourceId = sourceId || '';
    valueSpan.dataset.prefix = prefix || ''; // Store prefix for reference
    valueSpan.dataset.suffix = suffix || ''; // Store suffix for reference

    // For dynamic values, show a placeholder and set tooltip with source ID
    if (isDynamic) {
        const source = getDynamicSources().find(s => s.sourceId?.toString() === (sourceId || '').toString() ||
            s.locationId?.toString() === (sourceId || '').toString());
        if (source) {
            const content = source.sourceContent || source.locationContent || '[Waiting for content]';

            // Apply prefix/suffix to the displayed value
            const formattedValue = `${prefix || ''}${content}${suffix || ''}`;
            valueSpan.textContent = truncateText(formattedValue, 20);

            // Create a tooltip with proper formatting for large values
            const contentPreview = source.sourceContent || source.locationContent || 'Waiting for content';
            const sourceType = source.sourceType || source.locationType || 'unknown';
            const sourceTag = source.sourceTag || source.locationTag || 'No tag';
            const sourcePath = source.sourcePath || source.locationPath || 'unknown';

            const prefixSuffixInfo = (prefix || suffix) ?
                `Format: "${prefix}[dynamic content]${suffix}"\n` : '';

            const tooltipContent = `${sourceType} - ${sourceTag} - ${sourcePath}\n${prefixSuffixInfo}\nValue (${contentPreview.length} chars):\n${contentPreview}`;
            valueSpan.title = tooltipContent;
        } else {
            // Improved handling for missing sources
            valueSpan.textContent = '⚠️ Source unavailable';
            valueSpan.classList.add('missing-source');

            // Add a helpful message in the tooltip
            valueSpan.title = 'The dynamic source for this header is no longer available.\n\n' +
                'This can happen if:\n' +
                '• The source was deleted\n' +
                '• The companion app is not running\n' +
                '• The source ID has changed\n\n' +
                'Options:\n' +
                '• Start the companion app\n' +
                '• Remove this header and create a new one\n' +
                '• Replace this header with a static header';

            // If we still want to try loading from storage, we can keep this part,
            // but add better visual handling
            chrome.storage.local.get(['dynamicSources'], (result) => {
                if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                    const storedSource = result.dynamicSources.find(
                        s => s.sourceId?.toString() === (sourceId || '').toString() ||
                            s.locationId?.toString() === (sourceId || '').toString()
                    );

                    if (storedSource) {
                        // Source found in storage, update the display
                        // ... existing code to update with stored source ...
                        return;
                    }
                }
                // If we get here, source wasn't found in storage either
                // Keep the warning UI we already set up
            });
        }
    } else {
        valueSpan.textContent = truncateText(headerValue, 20);
        valueSpan.title = headerValue; // Tooltip with full value
    }

    // Domains container - shows multiple domains nicely
    const domainsSpan = document.createElement('span');
    domainsSpan.classList.add('domain-tags');

    // Format domains for display
    const formattedDomains = formatDomains(domains);
    domainsSpan.innerHTML = formattedDomains.html;
    domainsSpan.title = formattedDomains.tooltip;

    // Details span (for dynamic headers, shows source info)
    const detailsSpan = document.createElement('span');
    detailsSpan.classList.add('truncated', 'source-details');
    if (isDynamic) {
        const source = getDynamicSources().find(s => s.sourceId?.toString() === (sourceId || '').toString() ||
            s.locationId?.toString() === (sourceId || '').toString());
        if (source) {
            // Existing code for showing source details
            const sourceTypeMap = {
                'http': '🌐',
                'file': '📄',
                'env': '🔧'
            };
            const sourceType = source.sourceType || source.locationType;
            const typeIcon = sourceTypeMap[sourceType] || '📌';
            const tag = (source.sourceTag || source.locationTag) ? `[${source.sourceTag || source.locationTag}]` : '';
            const path = source.sourcePath || source.locationPath;
            detailsSpan.textContent = `${typeIcon} ${tag} ${truncateText(path, 15)}`;
            detailsSpan.title = `Type: ${sourceType}\nTag: ${source.sourceTag || source.locationTag || 'None'}\nPath: ${path}`;
        } else {
            // Improved display for missing sources
            detailsSpan.innerHTML = '<span class="missing-source-indicator">❓ Missing Source</span>';
            detailsSpan.title = `Source with ID ${sourceId} is no longer available`;
        }
    } else {
        detailsSpan.textContent = '';
    }

    // Remove button
    const removeButton = document.createElement('button');
    removeButton.classList.add('removeBtn');
    removeButton.textContent = 'Remove';
    // Pass entriesList to removeEntry
    removeButton.addEventListener('click', () => removeEntry(id, entriesList));

    // Build the row
    entryDiv.appendChild(typeTd);
    entryDiv.appendChild(nameSpan);
    entryDiv.appendChild(valueSpan);
    entryDiv.appendChild(domainsSpan);
    entryDiv.appendChild(detailsSpan);
    entryDiv.appendChild(removeButton);

    return entryDiv;
}

/**
 * Update a specific entry with new dynamic content.
 * @param {string} entryId - The ID of the entry to update
 * @param {string} sourceId - The source ID to lookup dynamic content
 * @returns {boolean} - True if the entry was found and updated
 */
export function updateDynamicEntryValue(entryId, sourceId) {
    console.log(`Updating entry ${entryId} with source ${sourceId}`);

    const entryElem = document.querySelector(`.entryItem[data-entry-id="${entryId}"]`);
    if (!entryElem) {
        console.log(`Entry element with ID ${entryId} not found`);
        return false;
    }

    const valueSpan = entryElem.querySelector('.header-value[data-is-dynamic="true"]');
    if (!valueSpan) {
        // Try without the data-is-dynamic filter, since we might have a type issue
        const alternateValueSpan = entryElem.querySelector('.header-value');
        if (!alternateValueSpan) {
            console.log(`No header-value element found in entry ${entryId}`);
            return false;
        }

        // If we have a sourceId that matches, consider it dynamic
        if (alternateValueSpan.dataset.sourceId === sourceId.toString()) {
            const source = getDynamicSources().find(s => s.sourceId?.toString() === sourceId.toString() ||
                s.locationId?.toString() === sourceId.toString());
            if (!source) {
                // Try to load from storage directly as fallback
                chrome.storage.local.get(['dynamicSources'], (result) => {
                    if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                        const storedSource = result.dynamicSources.find(
                            s => s.sourceId?.toString() === sourceId.toString() ||
                                s.locationId?.toString() === sourceId.toString()
                        );

                        if (storedSource) {
                            updateEntryWithSource(alternateValueSpan, storedSource, entryElem);
                            return true;
                        }
                    }
                });
                return false;
            }

            updateEntryWithSource(alternateValueSpan, source, entryElem);
            return true;
        }

        return false;
    }

    const source = getDynamicSources().find(s => s.sourceId?.toString() === sourceId.toString() ||
        s.locationId?.toString() === sourceId.toString());
    if (!source) {
        // Try to load from storage directly as fallback
        chrome.storage.local.get(['dynamicSources'], (result) => {
            if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                const storedSource = result.dynamicSources.find(
                    s => s.sourceId?.toString() === sourceId.toString() ||
                        s.locationId?.toString() === sourceId.toString()
                );

                if (storedSource) {
                    updateEntryWithSource(valueSpan, storedSource, entryElem);
                    return true;
                }
            }
        });
        return false;
    }

    updateEntryWithSource(valueSpan, source, entryElem);
    return true;
}

// Helper function for updating entries with a source
function updateEntryWithSource(valueSpan, source, entryElem, isLegacy = false) {
    // Get content based on whether it's legacy format or new format
    const content = isLegacy ? source.locationContent : (source.sourceContent || source.locationContent);

    // Get prefix and suffix from dataset
    const prefix = valueSpan.dataset.prefix || '';
    const suffix = valueSpan.dataset.suffix || '';

    // Apply prefix and suffix to the content
    const formattedContent = `${prefix}${content || '[Waiting for content]'}${suffix}`;

    console.log(`Updating value to: ${formattedContent}`);
    valueSpan.textContent = truncateText(formattedContent, 20);

    // Updated tooltip with better formatting
    const contentPreview = content || 'Waiting for content';
    // Support for both old and new property names
    const sourceType = isLegacy ? source.locationType : (source.sourceType || source.locationType);
    const sourceTag = isLegacy ? (source.locationTag || 'No tag') : (source.sourceTag || source.locationTag || 'No tag');
    const sourcePath = isLegacy ? source.locationPath : (source.sourcePath || source.locationPath);

    const prefixSuffixInfo = (prefix || suffix) ?
        `Format: "${prefix}[dynamic content]${suffix}"\n` : '';

    const tooltipContent = `${sourceType} - ${sourceTag} - ${sourcePath}\n${prefixSuffixInfo}\nValue (${contentPreview.length} chars):\n${contentPreview}`;
    valueSpan.title = tooltipContent;

    // Also update the details span
    const detailsSpan = entryElem.querySelector('.source-details');
    if (detailsSpan) {
        const sourceTypeMap = {
            'http': '🌐',
            'file': '📄',
            'env': '🔧'
        };
        const typeIcon = sourceTypeMap[sourceType] || '📌';
        const tag = sourceTag !== 'No tag' ? `[${sourceTag}]` : '';
        detailsSpan.textContent = `${typeIcon} ${tag} ${truncateText(sourcePath, 15)}`;
        detailsSpan.title = `Type: ${sourceType}\nTag: ${sourceTag}\nPath: ${sourcePath}`;
    }
}

/**
 * Highlights an updated entry value.
 * @param {string} entryId - ID of the entry to highlight
 */
export function highlightUpdatedEntry(entryId) {
    const valueElem = document.querySelector(`.entryItem[data-entry-id="${entryId}"] .header-value`);
    if (valueElem) {
        // Apply animation
        valueElem.classList.remove('highlight-update');
        // Force reflow to restart animation
        void valueElem.offsetWidth;
        valueElem.classList.add('highlight-update');

        // Add the recently updated indicator
        valueElem.classList.add('recently-updated');

        // Remove the indicator after 30 seconds
        setTimeout(() => {
            valueElem.classList.remove('recently-updated');
        }, 30000);
    }
}

/**
 * Refresh the entries list with current data and updated dynamic values.
 * @param {HTMLElement} entriesList - The container to render entries in
 * @param {Array} changedSourceIds - Optional array of source IDs that have changed
 */
export function refreshEntriesList(entriesList, changedSourceIds = []) {
    console.log('Refreshing entries with changed sources:', changedSourceIds);

    // Check if we need to completely re-render or can update in place
    if (changedSourceIds.length === 0) {
        // Just re-render everything if no specific changes
        renderEntries(entriesList, currentSavedData);
        return;
    }

    // Try to update in place for better UX
    let needsFullRerender = false;
    let updatedCount = 0;

    // For each entry that uses a changed source, try to update just that value
    for (const id in currentSavedData) {
        const entry = currentSavedData[id];
        if (entry.isDynamic) {
            const entrySourceId = (entry.sourceId || entry.locationId || '').toString();

            if (changedSourceIds.includes(entrySourceId)) {
                console.log(`Trying to update entry ${id} with source ${entrySourceId}`);

                // Try to update this entry in place
                const updated = updateDynamicEntryValue(id, entrySourceId);

                if (!updated) {
                    console.log(`Failed to update entry ${id} in place`);
                    needsFullRerender = true;
                } else {
                    updatedCount++;
                    console.log(`Updated entry ${id} in place`);
                    highlightUpdatedEntry(id);
                }
            }
        }
    }

    console.log(`Updated ${updatedCount} entries in place`);

    // If any updates failed, do a full re-render
    if (needsFullRerender || updatedCount === 0) {
        console.log('Performing full re-render');
        renderEntries(entriesList, currentSavedData);
    }
}

/**
 * Saves a new header entry.
 * @param {Object} formData - Form data containing the header information
 * @param {HTMLElement} entriesList - The list element to render entries in
 * @param {Function} clearFormFn - Function to clear form fields after save
 */
export function saveEntry(formData, entriesList, clearFormFn) {
    // Store normalized header name to match Chrome's behavior
    const headerName = normalizeHeaderName(formData.headerName);
    const headerValue = formData.headerValue;

    // Support both single domain (legacy) and domains array (new format)
    const domains = formData.domains || (formData.domain ? [formData.domain] : []);

    const isDynamic = formData.isDynamic;
    const sourceId = formData.sourceId || formData.locationId; // Support both new and legacy property names

    // Get prefix and suffix
    const prefix = formData.prefix || '';
    const suffix = formData.suffix || '';

    // Validate input
    if (!headerName || (!isDynamic && !headerValue) || domains.length === 0) {
        showNotification('Please fill in all required fields', true);
        return;
    }

    if (!isDynamic) {
        // Validate header value for static headers
        const validation = validateHeaderValue(headerValue);
        if (!validation.valid) {
            // Show warning but allow save to continue with sanitization
            showNotification(validation.message, true);
        }
    }

    const uniqueId = generateUniqueId();

    chrome.storage.sync.get(['savedData'], (result) => {
        const savedData = result.savedData || {};
        savedData[uniqueId] = {
            headerName, // Store normalized header name
            headerValue,
            domains, // Store domains as array
            isDynamic,
            sourceId: isDynamic ? sourceId : null,
            prefix, // Store prefix
            suffix  // Store suffix
        };

        chrome.storage.sync.set({ savedData }, () => {
            // Update our stored data
            currentSavedData = savedData;

            // Clear form
            if (clearFormFn) clearFormFn();

            // Re-render
            renderEntries(entriesList, savedData);

            // Show success message
            showNotification('Header saved successfully');
        });
    });
}

/**
 * Removes an entry by ID.
 * @param {string} id - ID of the entry to remove
 * @param {HTMLElement} entriesList - The container with all entries
 */
export function removeEntry(id, entriesList) {
    chrome.storage.sync.get(['savedData'], (result) => {
        const savedData = result.savedData || {};
        delete savedData[id];

        // Update our stored data
        currentSavedData = savedData;

        chrome.storage.sync.set({ savedData }, () => {
            // Re-render the entries list
            renderEntries(entriesList, savedData);
        });
    });
}

/**
 * Gets the current saved data.
 * @returns {Object} - The current saved data
 */
export function getCurrentSavedData() {
    return currentSavedData;
}