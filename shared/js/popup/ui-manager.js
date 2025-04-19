/**
 * UI Manager for popup interactions
 */
import { formatHeaderValue, formatDomainValue } from '../shared/utils.js';
import { runtime } from '../shared/browser-api.js';

let dynamicSources = [];
let statusIndicator = null;

/**
 * Initializes the connection status indicator in the header.
 * @param {HTMLElement} headerElement - The header element to add the indicator to
 * @returns {HTMLElement} - The created status indicator
 */
export function initializeStatusIndicator(headerElement) {
    statusIndicator = document.createElement('span');
    statusIndicator.classList.add('status-indicator');
    statusIndicator.textContent = 'Connecting...';
    headerElement.appendChild(statusIndicator);
    return statusIndicator;
}

/**
 * Updates the connection status indicator.
 * @param {boolean} connected - Whether the WebSocket is connected
 */
export function updateConnectionStatus(connected) {
    if (!statusIndicator) return;

    // First, completely reset all classes and state
    statusIndicator.classList.remove('status-connected', 'status-disconnected', 'status-updated');

    // Force a reflow to ensure CSS changes are applied immediately
    void statusIndicator.offsetWidth;

    // Then apply the appropriate class and text in a single update
    if (connected) {
        statusIndicator.textContent = 'Connected (Dynamic sources)';
        statusIndicator.classList.add('status-connected');
    } else {
        statusIndicator.textContent = 'Disconnected (Dynamic sources)';
        statusIndicator.classList.add('status-disconnected');
    }
}

/**
 * Shows a visual indication that we received an update.
 * @param {boolean} connectedStatus - The current connection status
 */
export function showUpdatedStatus(connectedStatus) {
    if (!statusIndicator) return;

    // If we're not actually connected, don't show "Updated"
    if (!connectedStatus) {
        return;
    }

    // Double-check the connection is still alive
    runtime.sendMessage({ type: 'checkConnection' }, (response) => {
        // Only show updated if background confirms connected status
        if (response && response.connected === true) {
            statusIndicator.textContent = 'Updated (Dynamic sources)';
            statusIndicator.classList.remove('status-connected', 'status-disconnected');
            statusIndicator.classList.add('status-updated');

            setTimeout(() => {
                // Check connection again before reverting to "Connected"
                runtime.sendMessage({ type: 'checkConnection' }, (connectionResponse) => {
                    if (connectionResponse && connectionResponse.connected === true) {
                        statusIndicator.textContent = 'Connected (Dynamic sources)';
                        statusIndicator.classList.remove('status-updated');
                        statusIndicator.classList.add('status-connected');
                    } else {
                        // Connection was lost during the timeout
                        statusIndicator.textContent = 'Disconnected (Dynamic sources)';
                        statusIndicator.classList.remove('status-updated', 'status-connected');
                        statusIndicator.classList.add('status-disconnected');
                    }
                });
            }, 2000);
        } else {
            // If background reports no connection, show disconnected
            statusIndicator.textContent = 'Disconnected (Dynamic sources)';
            statusIndicator.classList.remove('status-updated', 'status-connected');
            statusIndicator.classList.add('status-disconnected');
        }
    });
}

/**
 * Sets up the dynamic and static value type toggle.
 * @param {HTMLSelectElement} valueTypeSelect - The select element
 * @param {HTMLElement} staticValueRow - The row containing static value input
 * @param {HTMLElement} dynamicValueRow - The row containing dynamic value select
 * @param {HTMLElement} dynamicPrefixSuffixRow - The row containing prefix/suffix inputs
 * @param {Function} saveDraftFn - Function to save draft inputs
 */
export function setupValueTypeToggle(valueTypeSelect, staticValueRow, dynamicValueRow, dynamicPrefixSuffixRow, saveDraftFn) {
    valueTypeSelect.addEventListener('change', () => {
        if (valueTypeSelect.value === 'static') {
            staticValueRow.style.display = 'flex';
            dynamicValueRow.style.display = 'none';
            dynamicPrefixSuffixRow.style.display = 'none'; // Hide prefix/suffix row for static values
        } else {
            staticValueRow.style.display = 'none';
            dynamicValueRow.style.display = 'flex';
            dynamicPrefixSuffixRow.style.display = 'flex'; // Show prefix/suffix row for dynamic values
        }
        if (saveDraftFn) saveDraftFn();
    });
}

/**
 * Updates the dynamic select dropdown with available sources.
 * @param {Array} sources - The sources to populate the dropdown with
 * @param {HTMLSelectElement} dynamicValueSelect - The select element to update
 * @returns {boolean} - True if update was successful
 */
export function updateDynamicSelect(sources, dynamicValueSelect) {
    // Store sources for later use
    dynamicSources = sources;

    // Save current selection to restore it later
    const currentSelection = dynamicValueSelect.value;

    // Clear previous options and option groups except the first placeholder option
    while (dynamicValueSelect.options.length > 1) {
        dynamicValueSelect.remove(1);
    }

    // Remove all optgroups
    const optGroups = dynamicValueSelect.getElementsByTagName('optgroup');
    while (optGroups.length > 0) {
        optGroups[0].remove();
    }

    // Group sources by type
    const httpSources = sources.filter(s => (s.sourceType || s.locationType) === 'http');
    const fileSources = sources.filter(s => (s.sourceType || s.locationType) === 'file');
    const envSources = sources.filter(s => (s.sourceType || s.locationType) === 'env');
    const otherSources = sources.filter(s => !['http', 'file', 'env'].includes(s.sourceType || s.locationType));

    // Only create option groups for source types that have entries
    let hasAnySources = false;

    if (httpSources.length > 0) {
        addSourcesToSelect(dynamicValueSelect, httpSources, '🌐 HTTP');
        hasAnySources = true;
    }

    if (fileSources.length > 0) {
        addSourcesToSelect(dynamicValueSelect, fileSources, '📄 FILE');
        hasAnySources = true;
    }

    if (envSources.length > 0) {
        addSourcesToSelect(dynamicValueSelect, envSources, '🔧 ENV');
        hasAnySources = true;
    }

    if (otherSources.length > 0) {
        addSourcesToSelect(dynamicValueSelect, otherSources, '📌 OTHER');
        hasAnySources = true;
    }

    // If no sources were added, add a placeholder option
    if (!hasAnySources) {
        const noSourcesOption = document.createElement('option');
        noSourcesOption.value = "";
        noSourcesOption.textContent = "No sources available";
        noSourcesOption.disabled = true;
        dynamicValueSelect.appendChild(noSourcesOption);
    }

    // Restore previous selection if it still exists
    let selectionExists = false;
    for (let i = 0; i < dynamicValueSelect.options.length; i++) {
        if (dynamicValueSelect.options[i].value === currentSelection) {
            dynamicValueSelect.selectedIndex = i;
            selectionExists = true;
            break;
        }
    }

    // If the previously selected option no longer exists, select the first valid option
    if (!selectionExists && dynamicValueSelect.options.length > 1) {
        // Find the first enabled option
        for (let i = 1; i < dynamicValueSelect.options.length; i++) {
            if (!dynamicValueSelect.options[i].disabled) {
                dynamicValueSelect.selectedIndex = i;
                break;
            }
        }
    }

    return true;
}

/**
 * Adds a group of sources to the select dropdown.
 * @param {HTMLSelectElement} selectElement - The select element
 * @param {Array} sources - The sources to add
 * @param {string} groupLabel - The label for the option group
 */
function addSourcesToSelect(selectElement, sources, groupLabel) {
    if (sources.length === 0) return;

    const optGroup = document.createElement('optgroup');
    optGroup.label = groupLabel;

    // Add each source as an option
    sources.forEach(source => {
        const option = document.createElement('option');
        // Support both new property names and legacy property names
        option.value = source.sourceId || source.locationId;

        // Display format: [Tag] Path - Preview
        const tag = (source.sourceTag || source.locationTag) ? `[${source.sourceTag || source.locationTag}] ` : '';
        const content = source.sourceContent || source.locationContent;
        const path = source.sourcePath || source.locationPath;
        const preview = content ? ` - ${formatHeaderValue(content, 10, 0)}` : '';

        option.textContent = `${tag}${path}${preview}`;
        option.title = `Type: ${source.sourceType || source.locationType}\nTag: ${source.sourceTag || source.locationTag || 'None'}\nPath: ${path}\nContent: ${content || 'No content yet'}`;

        optGroup.appendChild(option);
    });

    selectElement.appendChild(optGroup);
}

/**
 * Find changed source IDs between old and new sources.
 * @param {Array} oldSources - The previous sources
 * @param {Array} newSources - The updated sources
 * @returns {Array} - Array of changed source IDs
 */
export function findChangedSourceIds(oldSources, newSources) {
    const changedSourceIds = [];

    // Check for updates in existing sources
    newSources.forEach(newSource => {
        // Find matching source, supporting both new and legacy property names
        const newSourceId = (newSource.sourceId || newSource.locationId).toString();

        const oldSource = oldSources.find(s =>
            (s.sourceId || s.locationId).toString() === newSourceId
        );

        if (!oldSource ||
            (oldSource.sourceContent || oldSource.locationContent) !==
            (newSource.sourceContent || newSource.locationContent)) {
            changedSourceIds.push(newSourceId);
        }
    });

    // Check for removed sources
    oldSources.forEach(oldSource => {
        const oldSourceId = (oldSource.sourceId || oldSource.locationId).toString();

        const stillExists = newSources.some(s =>
            (s.sourceId || s.locationId).toString() === oldSourceId
        );

        if (!stillExists) {
            // This is a source that was removed
            changedSourceIds.push(oldSourceId);
        }
    });

    return changedSourceIds;
}

/**
 * Gets the current dynamic sources.
 * @returns {Array} - The current dynamic sources
 */
export function getDynamicSources() {
    return dynamicSources;
}