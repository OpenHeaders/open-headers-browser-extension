/**
 * Manages saving and loading draft form inputs
 */
import { storage } from '../shared/browser-api.js';

// Add debounce functionality to prevent excessive storage operations
let saveTimeout = null;
const SAVE_DELAY = 500; // Delay in milliseconds

/**
 * Persists form inputs so they're restored if the popup closes.
 * Uses debouncing to prevent excessive storage operations.
 * @param {Object} formData - Form data to save
 * @param {boolean} clear - Whether to clear the draft data
 * @param {boolean} immediate - Whether to save immediately, bypassing debounce
 */
export function saveDraftInputs(formData, clear = false, immediate = false) {
    // Clear any pending save operation
    if (saveTimeout) {
        clearTimeout(saveTimeout);
        saveTimeout = null;
    }

    // If clearing, do it immediately
    if (clear) {
        storage.sync.set({
            draftInputs: {
                headerName: '',
                headerValue: '',
                domains: [],
                valueType: 'static',
                sourceId: '',
                prefix: '',  // Clear prefix
                suffix: ''   // Clear suffix
            }
        });
        return;
    }

    // Function to perform the actual save
    const performSave = () => {
        // Ensure domains is always an array when saving
        const domains = formData.domains ||
            (formData.domain ? [formData.domain] : []);

        // Save current state including dynamic selection and domains array
        storage.sync.set({
            draftInputs: {
                ...formData,
                domains,
                prefix: formData.prefix || '',  // Ensure prefix is saved
                suffix: formData.suffix || ''   // Ensure suffix is saved
            }
        });
    };

    // If immediate, save right away
    if (immediate) {
        performSave();
        return;
    }

    // Otherwise, debounce the save operation
    saveTimeout = setTimeout(performSave, SAVE_DELAY);
}

/**
 * Loads any saved draft inputs.
 * @returns {Promise} - Promise that resolves with the draft data
 */
export function loadDraftInputs() {
    return new Promise((resolve) => {
        storage.sync.get(['draftInputs'], (result) => {
            const draft = result.draftInputs || {};

            // Handle legacy data with different property names
            if (draft.locationId && !draft.sourceId) {
                draft.sourceId = draft.locationId;
            }
            // Handle very legacy data with ruleId instead of sourceId
            if (draft.ruleId && !draft.sourceId) {
                draft.sourceId = draft.ruleId;
            }

            // Ensure domains is always an array
            if (!draft.domains) {
                draft.domains = draft.domain ? [draft.domain] : [];
            }

            // Ensure prefix and suffix are defined
            draft.prefix = draft.prefix || '';
            draft.suffix = draft.suffix || '';

            resolve(draft);
        });
    });
}

/**
 * Sets up listeners to automatically save draft inputs.
 * @param {Object} elements - Object containing form elements
 * @param {Function} getFormDataFn - Function to get current form data
 */
export function setupDraftInputListeners(elements, getFormDataFn) {
    const { headerNameInput, headerValueInput, domainInput, prefixInput, suffixInput } = elements;

    // Use input event with debounced save
    headerNameInput.addEventListener('input', () =>
        saveDraftInputs(getFormDataFn()));

    headerValueInput.addEventListener('input', () =>
        saveDraftInputs(getFormDataFn()));

    // Only save on blur for domain input to further reduce writes
    domainInput.addEventListener('input', () =>
        saveDraftInputs(getFormDataFn()));

    // Add listeners for prefix and suffix inputs
    if (prefixInput) {
        prefixInput.addEventListener('input', () =>
            saveDraftInputs(getFormDataFn()));
        prefixInput.addEventListener('blur', () =>
            saveDraftInputs(getFormDataFn(), false, true));
    }

    if (suffixInput) {
        suffixInput.addEventListener('input', () =>
            saveDraftInputs(getFormDataFn()));
        suffixInput.addEventListener('blur', () =>
            saveDraftInputs(getFormDataFn(), false, true));
    }

    // Save immediately on blur events
    headerNameInput.addEventListener('blur', () =>
        saveDraftInputs(getFormDataFn(), false, true));

    headerValueInput.addEventListener('blur', () =>
        saveDraftInputs(getFormDataFn(), false, true));

    // Value type and dynamic select changes are typically handled by their own listeners
}