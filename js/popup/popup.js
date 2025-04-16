/**
 * Main popup script that coordinates the UI
 */
import { showNotification } from './notification-system.js';
import { normalizeHeaderName } from '../shared/utils.js';
import {
    initializeStatusIndicator,
    updateConnectionStatus,
    showUpdatedStatus,
    setupValueTypeToggle,
    updateDynamicSelect,
    findChangedSourceIds,
    getDynamicSources
} from './ui-manager.js';
import {
    loadEntries,
    saveEntry,
    refreshEntriesList,
    getCurrentSavedData,
    updateDynamicEntryValue
} from './entry-manager.js';
import {
    saveDraftInputs,
    loadDraftInputs,
    setupDraftInputListeners
} from './draft-manager.js';
import { validateHeaderValue } from '../background/rule-validator.js';
import {
    exportConfiguration,
    importConfiguration
} from './config-manager.js';
import { initializeDomainTagsInput } from './domain-tags-manager.js';

// Connection status
let isConnected = false;
// Domain tags manager
let domainTagsManager = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Force disconnected status immediately, before any other operations
    window.isAlreadyInitialized = false; // New flag to track initialization
    isConnected = false; // Start disconnected by default

    // Get DOM elements
    const headerNameInput = document.getElementById('headerNameInput');
    const headerValueInput = document.getElementById('headerValueInput');
    const domainInput = document.getElementById('domainInput');
    const domainTags = document.getElementById('domainTags');
    const valueTypeSelect = document.getElementById('valueTypeSelect');
    const staticValueRow = document.getElementById('staticValueRow');
    const dynamicValueRow = document.getElementById('dynamicValueRow');
    const dynamicValueSelect = document.getElementById('dynamicValueSelect');
    const dynamicPrefixSuffixRow = document.getElementById('dynamicPrefixSuffixRow');
    const prefixInput = document.getElementById('prefixInput');
    const suffixInput = document.getElementById('suffixInput');
    const saveButton = document.getElementById('saveButton');
    const entriesList = document.getElementById('entriesList');
    const headerElem = document.querySelector('h1');
    const appInfo = document.querySelector('.app-info');

    // Create the status indicator in the header
    const statusIndicator = initializeStatusIndicator(headerElem);

    // Apply disconnected status immediately
    updateConnectionStatus(false);
    updateAppInfoVisibility(false);

    // Initialize the domain tags manager
    domainTagsManager = initializeDomainTagsInput(domainInput, domainTags, () => {
        saveDraftInputs(getFormData());
    });

    // Track saved source ID for restoration
    let savedSourceId = '';

    // Get export/import elements
    const exportConfigButton = document.getElementById('exportConfigButton');
    const importConfigButton = document.getElementById('importConfigButton');
    const configFileInput = document.getElementById('configFileInput');

    // Set up export button
    if (exportConfigButton) {
        exportConfigButton.addEventListener('click', async () => {
            await exportConfiguration();
        });
    }

    // Set up import button (triggers file selection)
    if (importConfigButton) {
        importConfigButton.addEventListener('click', () => {
            configFileInput.click();
        });
    }

    // Set up file input for importing
    if (configFileInput) {
        configFileInput.addEventListener('change', async (event) => {
            if (event.target.files.length > 0) {
                const file = event.target.files[0];
                try {
                    // Import the configuration
                    const config = await importConfiguration(file);

                    // Reload entries list to show imported entries
                    loadEntries(entriesList);

                    // Reset the file input
                    configFileInput.value = null;
                } catch (error) {
                    console.error('Import failed:', error);
                    // Error notification is shown in importConfiguration function

                    // Reset the file input
                    configFileInput.value = null;
                }
            }
        });
    }

    // Function to update the app info visibility based on connection status
    function updateAppInfoVisibility(connected) {
        if (appInfo) {
            if (connected) {
                appInfo.style.display = 'none';
            } else {
                appInfo.style.display = 'flex';
            }
        }
    }

    // Function to get current form data
    function getFormData() {
        return {
            // Store the normalized header name to match Chrome's behavior
            headerName: headerNameInput.value,
            headerValue: headerValueInput.value,
            domains: domainTagsManager ? domainTagsManager.getDomains() : [],
            valueType: valueTypeSelect.value,
            sourceId: dynamicValueSelect.value,
            prefix: prefixInput ? prefixInput.value || '' : '',
            suffix: suffixInput ? suffixInput.value || '' : ''
        };
    }

    // Function to clear form inputs
    function clearForm() {
        headerNameInput.value = '';
        headerValueInput.value = '';
        if (domainTagsManager) {
            domainTagsManager.setDomains([]);
        }
        domainInput.value = '';
        valueTypeSelect.value = 'static';
        dynamicValueSelect.selectedIndex = 0;
        if (prefixInput) prefixInput.value = '';
        if (suffixInput) suffixInput.value = '';
        staticValueRow.style.display = 'flex';
        dynamicValueRow.style.display = 'none';
        if (dynamicPrefixSuffixRow) dynamicPrefixSuffixRow.style.display = 'none';

        // Also clear the draft data
        saveDraftInputs({}, true, true);
    }

    // Add a blur event handler to normalize header names
    headerNameInput.addEventListener('blur', () => {
        if (headerNameInput.value) {
            const normalized = normalizeHeaderName(headerNameInput.value);

            // Only update if it's different to avoid disrupting typing
            if (normalized !== headerNameInput.value) {
                headerNameInput.value = normalized;

                // Update draft inputs with normalized value
                saveDraftInputs(getFormData(), false, true);
            }
        }
    });

    // Function to handle saving a header
    function handleSaveHeader() {
        // Get normalized header name
        const headerName = normalizeHeaderName(headerNameInput.value);
        // Update the input to show normalized version
        headerNameInput.value = headerName;

        // Get domains from domain tags manager
        const domains = domainTagsManager ? domainTagsManager.getDomains() : [];

        const isDynamic = valueTypeSelect.value === 'dynamic';

        // Get prefix and suffix for dynamic headers
        const prefix = isDynamic && prefixInput ? prefixInput.value || '' : '';
        const suffix = isDynamic && suffixInput ? suffixInput.value || '' : '';

        let headerValue = '';
        let sourceId = null;

        if (isDynamic) {
            sourceId = dynamicValueSelect.value;
            if (!sourceId) {
                showNotification('Please select a dynamic value source', true);
                return;
            }
            // For dynamic entries, we store the source ID instead of the actual value
            const source = getDynamicSources().find(s =>
                (s.sourceId?.toString() === sourceId?.toString()) ||
                (s.locationId?.toString() === sourceId?.toString())
            );
            headerValue = source ? (source.sourceContent || source.locationContent || '') : '';
        } else {
            headerValue = headerValueInput.value;

            // Validate header value
            const validation = validateHeaderValue(headerValue);
            if (!validation.valid) {
                // Show warning but allow save to continue with sanitization
                showNotification(validation.message, true);
            }
        }

        // Validate domains
        if (domains.length === 0) {
            showNotification('Please add at least one domain pattern', true);
            return;
        }

        // Save the entry with normalized header name
        saveEntry(
            {
                headerName,
                headerValue,
                domains,
                isDynamic,
                sourceId,
                prefix,
                suffix
            },
            entriesList,
            clearForm
        );
    }

    // Function to handle when dynamic sources are updated
    function handleSourcesUpdated(sources, oldSources = []) {
        console.log('Handling sources update in popup:', sources ? sources.length : 0);

        // Only update to connected if we have actual sources AND a verified connection
        if (sources && Array.isArray(sources) && sources.length > 0) {
            // Instead of immediately setting isConnected to true, verify connection status first
            chrome.runtime.sendMessage({ type: 'checkConnection' }, (response) => {
                if (response && response.connected === true) {
                    isConnected = true;
                    updateConnectionStatus(true);
                    updateAppInfoVisibility(true);

                    // Only show visual update indication if we're REALLY connected
                    showUpdatedStatus(true);
                } else {
                    // If background reports disconnected state, don't show as connected
                    isConnected = false;
                    updateConnectionStatus(false);
                    updateAppInfoVisibility(false);
                }
            });
        } else {
            // If no sources, don't change to connected
            console.log('No sources in update, staying disconnected');
        }

        // Update the dynamic select dropdown (always do this)
        if (sources && Array.isArray(sources)) {
            updateDynamicSelect(sources, dynamicValueSelect);
        }

        // Find changed sources and refresh entries list (if needed)
        if (sources && Array.isArray(sources) && sources.length > 0) {
            const changedSourceIds = findChangedSourceIds(oldSources, sources);
            console.log('Changed source IDs:', changedSourceIds);

            if (changedSourceIds.length > 0) {
                refreshEntriesList(entriesList, changedSourceIds);
            }
        }
    }

    // Set up toggle between static and dynamic value types
    setupValueTypeToggle(valueTypeSelect, staticValueRow, dynamicValueRow, dynamicPrefixSuffixRow,
        () => saveDraftInputs(getFormData(), false, true));

    // Save dynamic value selection when it changes
    dynamicValueSelect.addEventListener('change', () =>
        saveDraftInputs(getFormData(), false, true));

    // Add event listeners for prefix and suffix inputs
    if (prefixInput) {
        prefixInput.addEventListener('input', () => saveDraftInputs(getFormData()));
        prefixInput.addEventListener('blur', () => saveDraftInputs(getFormData(), false, true));
    }

    if (suffixInput) {
        suffixInput.addEventListener('input', () => saveDraftInputs(getFormData()));
        suffixInput.addEventListener('blur', () => saveDraftInputs(getFormData(), false, true));
    }

    // Set up save button
    saveButton.addEventListener('click', handleSaveHeader);

    // Set up listeners for draft input persistence
    setupDraftInputListeners(
        {
            headerNameInput,
            headerValueInput,
            domainInput,
            prefixInput,
            suffixInput
        },
        getFormData
    );

    // Set up listener for messages from background script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'sourcesUpdated' && Array.isArray(message.sources)) {
            const oldSources = getDynamicSources();
            handleSourcesUpdated(message.sources, oldSources);
        }
        else if (message.type === 'connectionStatus') {
            const wasConnected = isConnected;
            isConnected = message.connected;

            // Only update UI if connection status changed
            if (wasConnected !== isConnected) {
                updateConnectionStatus(isConnected);
                updateAppInfoVisibility(isConnected);
            }
        } else if (message.type === 'ruleUpdateError') {
            console.error('Rule update error:', message.error);
            showNotification('Error updating rules: ' + message.error, true);
        }
        // It's important to return false if we're not using sendResponse
        return false;
    });

    // Check connection status periodically
    function startConnectionCheck() {
        // Check connection status every 3 seconds
        setInterval(() => {
            try {
                chrome.runtime.sendMessage({ type: 'checkConnection' }, (response) => {
                    // If no response or error, assume disconnected
                    if (chrome.runtime.lastError) {
                        console.log('Runtime error checking connection:', chrome.runtime.lastError);
                        if (isConnected) {
                            isConnected = false;
                            updateConnectionStatus(false);
                            updateAppInfoVisibility(false);
                        }
                        return;
                    }

                    // Get the actual connection state with explicit boolean check
                    const actuallyConnected = response && response.connected === true;

                    // Only update if state actually changed
                    if (isConnected !== actuallyConnected) {
                        console.log('Connection status change detected:',
                            isConnected ? 'Connected → Disconnected' : 'Disconnected → Connected');

                        isConnected = actuallyConnected;
                        updateConnectionStatus(actuallyConnected);
                        updateAppInfoVisibility(actuallyConnected);
                    }
                });
            } catch (err) {
                console.error('Error checking connection status:', err);
                if (isConnected) {
                    isConnected = false;
                    updateConnectionStatus(false);
                    updateAppInfoVisibility(false);
                }
            }
        }, 3000);
    }

    // Load dynamic sources from storage
    function loadDynamicSources() {
        chrome.storage.local.get(['dynamicSources'], (result) => {
            if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                // First verify connection status before displaying any status indicators
                chrome.runtime.sendMessage({ type: 'checkConnection' }, (response) => {
                    if (response && response.connected === true) {
                        // Only update connection status if we're actually connected
                        isConnected = true;
                        updateConnectionStatus(true);
                        updateAppInfoVisibility(true);
                    } else {
                        // Force disconnected state
                        isConnected = false;
                        updateConnectionStatus(false);
                        updateAppInfoVisibility(false);
                    }

                    // Always update the dropdown without changing connection status
                    updateDynamicSelect(result.dynamicSources, dynamicValueSelect);

                    // Now also update dynamic entries from storage regardless of connection status
                    updateDynamicEntriesFromStorage();
                });
            }
        });
    }

    // Initialize the popup
    async function initializePopup() {
        // Track if we're initialized to prevent duplicate status changes
        if (window.isAlreadyInitialized) {
            console.log('Popup already initialized, skipping duplicate initialization');
            return;
        }
        window.isAlreadyInitialized = true;

        // Always start disconnected
        isConnected = false;
        updateConnectionStatus(false);
        updateAppInfoVisibility(false);

        // Load entries first - this populates currentSavedData
        loadEntries(entriesList);

        // Now loadDynamicSources from storage
        loadDynamicSources();

        // Start connection status checker
        startConnectionCheck();

        // Load draft inputs
        const draft = await loadDraftInputs();

        // Apply normalization to header name from draft
        headerNameInput.value = draft.headerName ? normalizeHeaderName(draft.headerName) : '';
        headerValueInput.value = draft.headerValue || '';

        // Set prefix and suffix from draft
        if (prefixInput) prefixInput.value = draft.prefix || '';
        if (suffixInput) suffixInput.value = draft.suffix || '';

        // Set domains from draft (either array or legacy string)
        if (domainTagsManager) {
            if (draft.domains && Array.isArray(draft.domains)) {
                domainTagsManager.setDomains(draft.domains);
            } else if (draft.domain) {
                // Legacy support for single domain
                domainTagsManager.setDomains([draft.domain]);
            }
        }

        // Set value type and show/hide appropriate rows
        valueTypeSelect.value = draft.valueType === 'dynamic' ? 'dynamic' : 'static';
        if (draft.valueType === 'dynamic') {
            staticValueRow.style.display = 'none';
            dynamicValueRow.style.display = 'flex';
            if (dynamicPrefixSuffixRow) dynamicPrefixSuffixRow.style.display = 'flex';
        } else {
            staticValueRow.style.display = 'flex';
            dynamicValueRow.style.display = 'none';
            if (dynamicPrefixSuffixRow) dynamicPrefixSuffixRow.style.display = 'none';
        }

        // Save source ID for restoration after dynamic sources are loaded
        savedSourceId = draft.sourceId || draft.locationId || ''; // Support both new and legacy property names

        // Restore saved source ID if it exists
        setTimeout(() => {
            if (savedSourceId) {
                for (let i = 0; i < dynamicValueSelect.options.length; i++) {
                    if (dynamicValueSelect.options[i].value === savedSourceId) {
                        dynamicValueSelect.selectedIndex = i;
                        break;
                    }
                }
            }
        }, 200);

        // Let the background script know we're open and ready for updates
        try {
            chrome.runtime.sendMessage({ type: 'popupOpen' }, (response) => {
                // Check for runtime error
                if (chrome.runtime.lastError) {
                    console.log('Error notifying background script of popup open:', chrome.runtime.lastError);
                    return;
                }

                // Check if we got sources - even if we did, still update them from storage since
                // we might be disconnected
                updateDynamicEntriesFromStorage();

                // Check if we got an explicit connected response
                if (response) {
                    if (response.sources && response.sources.length > 0) {
                        console.log('Background confirmed sources:', response.sources.length);
                        handleSourcesUpdated(response.sources, []);
                    } else if (response.locations && response.locations.length > 0) {
                        // Support for legacy response format
                        console.log('Background confirmed sources (legacy format):', response.locations.length);
                        handleSourcesUpdated(response.locations, []);
                    } else {
                        console.log('No sources received from background, staying disconnected');
                    }
                }
            });
        } catch (err) {
            console.log('Background script not ready yet:', err);
        }
    }

    function updateDynamicEntriesFromStorage() {
        chrome.storage.local.get(['dynamicSources'], (result) => {
            if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                const sources = result.dynamicSources;
                console.log('Updating entries with sources from storage:', sources.length);

                // Get the current saved data - this must be after loadEntries has run
                const savedData = getCurrentSavedData();

                // When using webpack, direct function calls can sometimes fail due to scope issues
                // Use refreshEntriesList instead, which is already properly imported and scoped
                if (sources.length > 0) {
                    // Get all source IDs to force a full update
                    const allSourceIds = sources.map(source => (source.sourceId || source.locationId).toString());
                    refreshEntriesList(entriesList, allSourceIds);
                }
            }
        });
    }

    // Start initializing the popup
    initializePopup();
});