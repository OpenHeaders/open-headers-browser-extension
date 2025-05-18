/**
 * Main popup script that coordinates the UI
 */
import { showNotification } from './notification-system.js';
import { normalizeHeaderName } from '../shared/utils.js';
import { runtime, storage } from '../shared/browser-api.js';
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
    updateDynamicEntryValue,
    renderEntries,
    editEntry
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
// Keep reference to DOM elements across functions
let entriesList = null;
let dynamicValueSelect = null;
// Store global reference to savedData
let currentSavedData = {};
// Track if we're in edit mode
let isEditMode = false;
let editingEntryId = null;

/**
 * Refreshes the entries list to reflect the current enabled/disabled status.
 */
function refreshEntriesWithCurrentStatus() {
    storage.sync.get(['savedData'], (result) => {
        const savedData = result.savedData || {};

        // Update our stored reference
        currentSavedData = savedData;

        // Re-render all entries
        if (entriesList) {
            renderEntries(entriesList, savedData);
        }
    });
}

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
    dynamicValueSelect = document.getElementById('dynamicValueSelect');
    const dynamicPrefixSuffixRow = document.getElementById('dynamicPrefixSuffixRow');
    const prefixInput = document.getElementById('prefixInput');
    const suffixInput = document.getElementById('suffixInput');
    const saveButton = document.getElementById('saveButton');
    entriesList = document.getElementById('entriesList');
    const headerElem = document.querySelector('h1');
    const appInfo = document.querySelector('.app-info');

    // Get the request/response radio buttons
    const requestRadio = document.getElementById('requestHeaderType');
    const responseRadio = document.getElementById('responseHeaderType');

    const footerBottomSection = document.querySelector('.footer-bottom');
    let welcomeButton = null;

    // Add debug verification for enabled/disabled states
    storage.sync.get(['savedData'], (result) => {
        if (result.savedData) {
            // Check for any entries with isEnabled = false
            const disabledEntries = Object.keys(result.savedData).filter(id =>
                result.savedData[id].isEnabled === false
            );

            if (disabledEntries.length > 0) {
                console.log('Found disabled entries:', disabledEntries.map(id => ({
                    name: result.savedData[id].headerName,
                    enabled: result.savedData[id].isEnabled
                })));
            }
        }
    });

    // Create a cancel button for edit mode
    const cancelButton = document.createElement('button');
    cancelButton.id = 'cancelEditButton';
    cancelButton.textContent = 'Cancel';
    cancelButton.classList.add('cancelBtn');
    cancelButton.style.display = 'none'; // Hidden by default

    // Insert cancel button before save button
    saveButton.parentNode.insertBefore(cancelButton, saveButton);

    // Add event listener for the cancel button
    cancelButton.addEventListener('click', () => {
        // Remove editing-entry class from ALL entries
        document.querySelectorAll('.entryItem.editing-entry').forEach(item => {
            item.classList.remove('editing-entry');
        });

        // Reset edit mode
        isEditMode = false;
        editingEntryId = null;

        // Reset save button
        saveButton.dataset.editMode = 'false';
        saveButton.dataset.editId = '';
        saveButton.textContent = 'Save';

        // Hide cancel button
        cancelButton.style.display = 'none';

        // Clear form
        clearForm();
    });

    // Create the status indicator in the header
    const statusIndicator = initializeStatusIndicator(headerElem);

    // Apply disconnected status immediately
    updateConnectionStatus(false);
    updateAppInfoVisibility(false);

    // Initialize the domain tags manager
    domainTagsManager = initializeDomainTagsInput(domainInput, domainTags, () => {
        saveDraftInputs(getFormData());
    });

    // Make domain tags manager globally available
    window.domainTagsManager = domainTagsManager;

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
                    console.log('Import complete, config:', config);

                    // Reset the file input
                    configFileInput.value = null;

                    // Explicitly get the latest data from storage to ensure we have the imported entries
                    storage.sync.get(['savedData'], (result) => {
                        if (result.savedData) {
                            console.log('Loaded imported savedData:',
                                Object.keys(result.savedData).map(id => ({
                                    id,
                                    name: result.savedData[id].headerName
                                }))
                            );

                            // Update our local reference
                            currentSavedData = result.savedData;

                            // Now reload entries to show imported data
                            loadEntries(entriesList);

                            // Also load any imported dynamic sources
                            storage.local.get(['dynamicSources'], (result) => {
                                if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                                    console.log('Loaded imported dynamic sources:', result.dynamicSources.length);
                                    updateDynamicSelect(result.dynamicSources, dynamicValueSelect);
                                }
                            });
                        } else {
                            console.error('No savedData found after import');
                        }
                    });
                } catch (error) {
                    console.error('Import failed:', error);
                    // Error notification is shown in importConfiguration function

                    // Reset the file input
                    configFileInput.value = null;
                }
            }
        });
    }

    function addWelcomeButton() {
        // Only add the button if the footer-bottom section exists
        if (footerBottomSection) {
            // Create the welcome button
            welcomeButton = document.createElement('a');
            welcomeButton.href = '#';
            welcomeButton.id = 'welcomeButton';
            welcomeButton.title = 'Open Setup Guide';
            welcomeButton.innerHTML = '<i class="fas fa-book-open"></i>';
            welcomeButton.style.color = '#4285F4';
            welcomeButton.style.marginLeft = '8px';
            welcomeButton.style.fontSize = '16px';
            welcomeButton.style.transition = 'all 0.2s ease';

            // Add hover effect
            welcomeButton.addEventListener('mouseenter', () => {
                welcomeButton.style.transform = 'scale(1.2)';
            });

            welcomeButton.addEventListener('mouseleave', () => {
                welcomeButton.style.transform = 'scale(1)';
            });

            // Fix the click handler to open the welcome page
            welcomeButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation(); // Prevent event bubbling

                console.log('Welcome button clicked, forcing welcome page to open');

                // Send a message to FORCE open the welcome page (bypassing the setup check)
                runtime.sendMessage({
                    type: 'forceOpenWelcomePage' // New message type to bypass setup checks
                }, (response) => {
                    // Check for any errors
                    if (runtime.lastError) {
                        console.error('Error opening welcome page:', runtime.lastError);
                        return;
                    }

                    console.log('Force-open welcome page request sent, response:', response);

                    // Close the popup after sending the message
                    window.close();
                });
            });

            // Add to the social-links div if it exists, otherwise to the footer-bottom
            const socialLinks = footerBottomSection.querySelector('.social-links');
            if (socialLinks) {
                socialLinks.appendChild(welcomeButton);
            } else {
                footerBottomSection.appendChild(welcomeButton);
            }

            // Debug message to confirm button was added
            console.log('Welcome button added to footer');
        }
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
        // Get the selected header direction (request/response)
        const isResponse = requestRadio ? !requestRadio.checked : false;

        // Get enabled/disabled state from edit mode or default to enabled
        const isEnabled = isEditMode && editingEntryId ?
            (currentSavedData[editingEntryId]?.isEnabled !== false) : true;

        return {
            // Store the normalized header name to match Chrome's behavior
            headerName: headerNameInput.value,
            headerValue: headerValueInput.value,
            domains: domainTagsManager ? domainTagsManager.getDomains() : [],
            valueType: valueTypeSelect.value,
            isDynamic: valueTypeSelect.value === 'dynamic',
            sourceId: dynamicValueSelect.value,
            prefix: prefixInput ? prefixInput.value || '' : '',
            suffix: suffixInput ? suffixInput.value || '' : '',
            isResponse: isResponse, // Add response type flag
            isEnabled: isEnabled // Preserve enabled state when editing
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

        // Reset request/response radio buttons to default (request)
        if (requestRadio) requestRadio.checked = true;
        if (responseRadio) responseRadio.checked = false;

        // Remove editing-entry class from ALL entries, not just the current one
        document.querySelectorAll('.entryItem.editing-entry').forEach(item => {
            item.classList.remove('editing-entry');
        });

        // Reset edit mode
        isEditMode = false;
        editingEntryId = null;

        // Reset save button
        saveButton.dataset.editMode = 'false';
        saveButton.dataset.editId = '';
        saveButton.textContent = 'Save';

        // Hide cancel button
        cancelButton.style.display = 'none';

        // Also clear the draft data
        saveDraftInputs({}, true, true);
    }

    // Make clearForm available globally for other modules
    window.clearForm = clearForm;

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

    // Add event listeners for request/response radio buttons
    if (requestRadio) {
        requestRadio.addEventListener('change', () => {
            saveDraftInputs(getFormData(), false, true);
        });
    }

    if (responseRadio) {
        responseRadio.addEventListener('change', () => {
            saveDraftInputs(getFormData(), false, true);
        });
    }

    // Function to handle saving a header
    function handleSaveHeader() {
        // Get normalized header name
        const headerName = normalizeHeaderName(headerNameInput.value);
        // Update the input to show normalized version
        headerNameInput.value = headerName;

        // Get domains from domain tags manager
        const domains = domainTagsManager ? domainTagsManager.getDomains() : [];

        const isDynamic = valueTypeSelect.value === 'dynamic';

        // Get the header direction (request/response)
        const isResponse = requestRadio ? !requestRadio.checked : false;

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

        // Get the entry's current enabled state if editing, or default to enabled
        const isEnabled = isEditMode && editingEntryId ?
            (currentSavedData[editingEntryId]?.isEnabled !== false) : true;

        // Remove editing-entry class from ALL entries
        document.querySelectorAll('.entryItem.editing-entry').forEach(item => {
            item.classList.remove('editing-entry');
        });

        // Save the entry with normalized header name
        saveEntry(
            {
                headerName,
                headerValue,
                domains,
                isDynamic,
                sourceId,
                prefix,
                suffix,
                isResponse,
                isEnabled // Pass the enabled status
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
            runtime.sendMessage({ type: 'checkConnection' }, (response) => {
                if (response && response.connected === true) {
                    isConnected = true;
                    updateConnectionStatus(true);
                    updateAppInfoVisibility(true);

                    // Only show visual update indication if this is an actual update, not initial load
                    if (oldSources && oldSources.length > 0) {
                        showUpdatedStatus(true);
                    }
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

        // Safely handle entry updates using the current saved data
        updateEntriesFromSources(sources, oldSources);
    }

    // Safer method to update entries with dynamic sources
    function updateEntriesFromSources(sources, oldSources) {
        try {
            if (sources && Array.isArray(sources) && sources.length > 0) {
                const currentSavedData = getCurrentSavedData();

                // Don't treat reopening as an update that needs highlighting
                const isReopening = !oldSources || oldSources.length === 0;

                if (isReopening) {
                    // Instead of directly calling renderEntries, use loadEntries which is already verified to work
                    loadEntries(entriesList);

                    // Explicitly refresh to ensure enabled/disabled states are correct
                    refreshEntriesWithCurrentStatus();
                } else {
                    // For actual updates, find what changed and highlight those entries
                    const changedSourceIds = findChangedSourceIds(oldSources, sources);
                    console.log('Changed source IDs:', changedSourceIds);

                    if (changedSourceIds.length > 0) {
                        refreshEntriesList(entriesList, changedSourceIds);
                    }
                }
            }
        } catch (error) {
            console.error('Error updating entries:', error);
            // Fallback to simple reload if there's an error
            try {
                loadEntries(entriesList);

                // Also refresh for enabled/disabled states
                refreshEntriesWithCurrentStatus();
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
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
    runtime.onMessage.addListener((message) => {
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

    // Handle entry edit events triggered from entry-manager.js
    document.addEventListener('entryEdit', (event) => {
        const entryId = event.detail.id;

        // Set edit mode
        isEditMode = true;
        editingEntryId = entryId;

        // First, remove the editing-entry class from ALL entries
        document.querySelectorAll('.entryItem.editing-entry').forEach(item => {
            item.classList.remove('editing-entry');
        });

        // Then add the class only to the current entry being edited
        const entryElement = document.querySelector(`.entryItem[data-entry-id="${entryId}"]`);
        if (entryElement) {
            entryElement.classList.add('editing-entry');

            // Disable the toggle switch during edit
            const toggleSwitch = entryElement.querySelector('.switch input[type="checkbox"]');
            if (toggleSwitch) {
                // Save the original state to restore later if needed
                toggleSwitch.dataset.originalState = toggleSwitch.checked;
                // The CSS will handle disabling the appearance and preventing clicks
            }
        }

        // Show cancel button
        cancelButton.style.display = 'inline-block';

        // Load entry data
        editEntry(entryId, entriesList);
    });

    // Check connection status periodically
    function startConnectionCheck() {
        // Check connection status every 3 seconds
        setInterval(() => {
            try {
                runtime.sendMessage({ type: 'checkConnection' }, (response) => {
                    // If no response or error, assume disconnected
                    if (runtime.lastError) {
                        console.log('Runtime error checking connection:', runtime.lastError);
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

    // Safe function to update dynamic entries from storage
    function updateDynamicEntriesFromStorage() {
        try {
            storage.local.get(['dynamicSources'], (result) => {
                if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                    // Don't use functions that might not be properly imported
                    // Instead, just reload entries which is known to work
                    loadEntries(entriesList);

                    // Explicitly refresh for enabled/disabled states
                    refreshEntriesWithCurrentStatus();
                }
            });
        } catch (error) {
            console.error('Error updating from storage:', error);
        }
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

        addWelcomeButton();

        // Load entries first - this populates currentSavedData
        loadEntries(entriesList);

        // Make sure to refresh to ensure enabled/disabled states are correct
        refreshEntriesWithCurrentStatus();

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

        // Set request/response radio buttons from draft
        if (requestRadio && responseRadio && draft.isResponse === true) {
            requestRadio.checked = false;
            responseRadio.checked = true;
        }

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

        // Add CSS for edit and cancel buttons
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            .button-container {
                display: flex;
                gap: 4px;
                justify-content: flex-end;
            }
            .editBtn {
                background-color: #4285F4;
                color: #fff;
                border: none;
                padding: 4px 8px;
                cursor: pointer;
                font-size: 12px;
                border-radius: 4px;
                flex-shrink: 0;
            }
            .editBtn:hover {
                background-color: #3b77db;
            }
            .cancelBtn {
                background-color: #9e9e9e;
                color: #fff;
                border: none;
                padding: 8px;
                cursor: pointer;
                font-size: 14px;
                border-radius: 4px;
                margin-right: 8px;
            }
            .cancelBtn:hover {
                background-color: #757575;
            }
            #saveButton[data-edit-mode="true"] {
                background-color: #34A853;
            }
            
            /* Disabled state for switch when in edit mode */
            .editing-entry .switch {
                opacity: 0.6;
                cursor: not-allowed;
                pointer-events: none; /* Prevents clicking */
            }
            
            .editing-entry .slider {
                background-color: #ccc !important; /* Force gray appearance */
            }
            
            /* Add a subtle indicator that we're in edit mode */
            .editing-entry {
                background-color: #f8f9fa;
                border-left: 3px solid #4285F4;
            }
        `;
        document.head.appendChild(styleElement);

        // Let the background script know we're open and ready for updates
        try {
            runtime.sendMessage({ type: 'popupOpen' }, (response) => {
                // Check for runtime error
                if (runtime.lastError) {
                    console.log('Error notifying background script of popup open:', runtime.lastError);
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

    // Load dynamic sources from storage
    function loadDynamicSources() {
        storage.sync.get(['savedData'], (result) => {
            // Update our stored reference to ensure we have the latest data
            currentSavedData = result.savedData || {};
        });

        // First ensure we get the latest sources from storage
        storage.local.get(['dynamicSources'], (result) => {
            if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
                console.log('Loaded dynamic sources from storage:', result.dynamicSources.length);

                // Store the sources for later use
                const loadedSources = result.dynamicSources;

                // Verify connection status before displaying any status indicators
                runtime.sendMessage({ type: 'checkConnection' }, (response) => {
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

                    // Always update the dropdown with our loaded sources
                    updateDynamicSelect(loadedSources, dynamicValueSelect);

                    // Now also reload entries with these sources
                    loadEntries(entriesList);

                    // Explicitly refresh to ensure enabled/disabled states are correct
                    refreshEntriesWithCurrentStatus();

                    // Also request fresh sources from the background script
                    runtime.sendMessage({ type: 'getDynamicSources' }, (response) => {
                        if (response && response.sources && response.sources.length > 0) {
                            // Update with the freshest sources if available
                            console.log('Got fresh sources from background:', response.sources.length);
                            updateDynamicSelect(response.sources, dynamicValueSelect);
                            refreshEntriesList(entriesList);
                        }
                    });
                });
            }
        });
    }

    // Start initializing the popup
    initializePopup();
});