/**
 * Configuration import/export functionality with edit mode support
 */
import { getCurrentSavedData } from './entry-manager.js';
import { getDynamicSources } from './ui-manager.js';
import { showNotification } from './notification-system.js';
import { storage, runtime } from '../shared/browser-api.js';

/**
 * Exports the current configuration to a JSON file.
 * @returns {Promise<void>}
 */
export async function exportConfiguration() {
    try {
        // Get current header entries
        const headerEntries = getCurrentSavedData();

        // Get current dynamic sources
        const dynamicSources = getDynamicSources();

        // Create configuration object
        const configuration = {
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            headerEntries,
            dynamicSources
        };

        // Convert to JSON string with pretty formatting
        const jsonString = JSON.stringify(configuration, null, 2);

        // Create a blob
        const blob = new Blob([jsonString], { type: 'application/json' });

        // Default filename
        const suggestedName = `open-headers-config-${new Date().toISOString().slice(0, 10)}.json`;

        // Track if the export was successful
        let exportSuccessful = false;

        // Use the File System Access API if available (modern browsers)
        if ('showSaveFilePicker' in window) {
            try {
                const opts = {
                    suggestedName,
                    types: [{
                        description: 'Open Headers Configuration',
                        accept: { 'application/json': ['.json'] }
                    }]
                };

                // Show file picker dialog
                console.log('Showing save file picker...');
                const fileHandle = await window.showSaveFilePicker(opts);

                console.log('File handle obtained, creating writable...');
                const writable = await fileHandle.createWritable();

                console.log('Writing data...');
                await writable.write(blob);

                console.log('Closing writable...');
                await writable.close();

                console.log('File saved successfully');
                exportSuccessful = true;

                // Only now show the notification after everything is complete
                showNotification('Configuration exported successfully');
                return;
            } catch (pickerError) {
                // If user cancels the save dialog, this will trigger
                if (pickerError.name !== 'AbortError') {
                    console.error('File picker failed, falling back to download:', pickerError);
                    // Fall through to fallback method
                } else {
                    console.log('User cancelled the save dialog');
                    // User cancelled, don't show error or success
                    return;
                }
            }
        }

        // Fallback method for browsers that don't support File System Access API
        const url = URL.createObjectURL(blob);

        // Create and trigger download
        const a = document.createElement('a');
        a.href = url;
        a.download = suggestedName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            // Only show notification after everything is complete
            if (!exportSuccessful) {
                showNotification('Configuration exported successfully');
            }
        }, 500); // Increased from 100ms to 500ms to ensure download has started
    } catch (error) {
        console.error('Export failed:', error);
        showNotification('Export failed: ' + error.message, true);
    }
}

/**
 * Imports configuration from a JSON file.
 * @param {File} file - The configuration file to import
 * @returns {Promise<Object>} - The imported configuration
 */
export async function importConfiguration(file) {
    return new Promise((resolve, reject) => {
        try {
            const reader = new FileReader();

            reader.onload = async (event) => {
                try {
                    const jsonString = event.target.result;
                    const configuration = JSON.parse(jsonString);

                    // Validate configuration structure
                    if (!configuration.headerEntries) {
                        throw new Error('Invalid configuration file: missing header entries');
                    }

                    console.log('Importing configuration:', configuration);

                    // Process header entries to ensure new fields have default values
                    const processedEntries = {};

                    // Process each entry to add default values for new fields if they don't exist
                    Object.entries(configuration.headerEntries).forEach(([id, entry]) => {
                        processedEntries[id] = {
                            ...entry,
                            // Set defaults for new fields if not present
                            isResponse: entry.isResponse || false,
                            isEnabled: entry.isEnabled !== undefined ? entry.isEnabled : true,
                            // Ensure prefix and suffix are defined
                            prefix: entry.prefix || '',
                            suffix: entry.suffix || ''
                        };
                    });

                    console.log('Processed entries:', processedEntries);

                    // Store the processed header entries - using Promise for better async handling
                    await new Promise((resolveStorage, rejectStorage) => {
                        storage.sync.set({ savedData: processedEntries }, () => {
                            if (runtime.lastError) {
                                console.error('Storage error:', runtime.lastError);
                                rejectStorage(runtime.lastError);
                            } else {
                                console.log('Saved header entries to storage');
                                resolveStorage();
                            }
                        });
                    });

                    // Save dynamic sources if present
                    if (configuration.dynamicSources && Array.isArray(configuration.dynamicSources)) {
                        await new Promise((resolveSourcesStorage, rejectSourcesStorage) => {
                            storage.local.set({ dynamicSources: configuration.dynamicSources }, () => {
                                if (runtime.lastError) {
                                    console.error('Storage error:', runtime.lastError);
                                    rejectSourcesStorage(runtime.lastError);
                                } else {
                                    console.log('Saved dynamic sources to storage');
                                    resolveSourcesStorage();
                                }
                            });
                        });
                    }

                    // Notify background script about the imported configuration
                    await new Promise((resolveNotify, rejectNotify) => {
                        runtime.sendMessage({
                            type: 'configurationImported',
                            dynamicSources: configuration.dynamicSources || [],
                            savedData: processedEntries
                        }, (response) => {
                            if (runtime.lastError) {
                                console.error('Notification error:', runtime.lastError);
                                rejectNotify(runtime.lastError);
                            } else {
                                console.log('Notified background script of import');
                                resolveNotify();
                            }
                        });
                    });

                    // Exit edit mode if active to prevent confusion
                    const saveButton = document.getElementById('saveButton');
                    if (saveButton && saveButton.dataset.editMode === 'true') {
                        // Reset edit mode
                        saveButton.dataset.editMode = 'false';
                        saveButton.dataset.editId = '';
                        saveButton.textContent = 'Save';

                        // Hide cancel button if exists
                        const cancelButton = document.getElementById('cancelEditButton');
                        if (cancelButton) {
                            cancelButton.style.display = 'none';
                        }

                        // Clear form using the window function if available
                        if (window.clearForm && typeof window.clearForm === 'function') {
                            window.clearForm();
                        }
                    }

                    // Show success notification
                    showNotification('Configuration imported successfully');

                    // Resolve with the imported config for further processing
                    resolve(configuration);
                } catch (parseError) {
                    console.error('Import parsing failed:', parseError);
                    showNotification('Import failed: ' + parseError.message, true);
                    reject(parseError);
                }
            };

            reader.onerror = (error) => {
                console.error('File reading failed:', error);
                showNotification('File reading failed', true);
                reject(error);
            };

            reader.readAsText(file);
        } catch (error) {
            console.error('Import failed:', error);
            showNotification('Import failed: ' + error.message, true);
            reject(error);
        }
    });
}