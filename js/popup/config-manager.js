/**
 * Configuration import/export functionality
 */
import { getCurrentSavedData } from './entry-manager.js';
import { getDynamicSources } from './ui-manager.js';
import { showNotification } from './notification-system.js';

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
            version: '1.0',
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
                const fileHandle = await window.showSaveFilePicker(opts);
                const writable = await fileHandle.createWritable();
                await writable.write(blob);
                await writable.close();

                showNotification('Configuration exported successfully');
                return;
            } catch (pickerError) {
                // If user cancels the save dialog, this will trigger
                // Don't show error for cancellation
                if (pickerError.name !== 'AbortError') {
                    console.log('File picker failed, falling back to download:', pickerError);
                    // Fall through to fallback method
                } else {
                    // User cancelled, don't show error
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
        }, 100);

        showNotification('Configuration exported successfully');
    } catch (error) {
        console.error('Export failed:', error);
        showNotification('Export failed: ' + error.message, true);
    }
}

/**
 * Imports configuration from a JSON file.
 * @param {File} file - The configuration file to import
 * @returns {Promise<void>}
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

                    // Store the header entries
                    await chrome.storage.sync.set({ savedData: configuration.headerEntries });

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