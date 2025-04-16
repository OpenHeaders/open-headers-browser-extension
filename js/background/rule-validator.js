/**
 * Functions for validating and sanitizing header values
 */

/**
 * Validates if a header value is acceptable for Chrome's API.
 * @param {string} value - The header value to validate
 * @returns {boolean} - True if the value is valid
 */
export function isValidHeaderValue(value) {
    if (!value || typeof value !== 'string') return false;

    // Check if the header value contains any line breaks or special characters that might cause issues
    if (/[\r\n]/.test(value)) return false;

    // Check length - Chrome has a limit on header value size
    if (value.length > 1024) return false;

    return true;
}

/**
 * Sanitizes a header value to make it valid for Chrome's API.
 * @param {string} value - The header value to sanitize
 * @returns {string} - The sanitized header value
 */
export function sanitizeHeaderValue(value) {
    if (!value) return '';

    // Convert to string if not already
    value = String(value);

    // Remove line breaks and replace with spaces
    value = value.replace(/[\r\n]+/g, ' ');

    // Truncate if too long
    if (value.length > 1024) {
        value = value.substring(0, 1020) + '...';
    }

    return value;
}

/**
 * Client-side validation for header values with user feedback messages.
 * @param {string} value - The header value to validate
 * @returns {Object} - Validation result and message
 */
export function validateHeaderValue(value) {
    if (!value) return { valid: false, message: 'Header value cannot be empty' };

    // Check for line breaks and special characters
    if (/[\r\n]/.test(value)) {
        return {
            valid: false,
            message: 'Header value cannot contain line breaks - they will be replaced with spaces'
        };
    }

    // Check length
    if (value.length > 1024) {
        return {
            valid: false,
            message: 'Header value is too long (max 1024 characters) - it will be truncated'
        };
    }

    return { valid: true };
}