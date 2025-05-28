/**
 * Functions for validating and sanitizing header values for declarativeNetRequest
 */
import { validateHeaderValue as validateHeaderValueCore, sanitizeHeaderValue as sanitizeHeaderValueCore } from '../utils/header-validator';

/**
 * Validates if a header value is acceptable for Chrome's declarativeNetRequest API.
 * @param {string} value - The header value to validate
 * @param {string} headerName - The header name for context
 * @returns {boolean} - True if the value is valid
 */
export function isValidHeaderValue(value, headerName = '') {
    // Use the core validation function
    const validation = validateHeaderValueCore(value, headerName);
    return validation.valid;
}

/**
 * Sanitizes a header value to make it valid for Chrome's declarativeNetRequest API.
 * @param {string} value - The header value to sanitize
 * @returns {string} - The sanitized header value
 */
export function sanitizeHeaderValue(value) {
    // Use the core sanitization function
    return sanitizeHeaderValueCore(value);
}

/**
 * Client-side validation for header values with user feedback messages.
 * @param {string} value - The header value to validate
 * @param {string} headerName - The header name for context
 * @returns {Object} - Validation result and message
 */
export function validateHeaderValue(value, headerName = '') {
    // Delegate to the core validation function
    return validateHeaderValueCore(value, headerName);
}