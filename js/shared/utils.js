/**
 * Utility functions shared across the extension
 */

/**
 * Formats a file name from a full path.
 * @param {string} path - The full file path
 * @returns {string} - The extracted file name
 */
export function formatFileName(path) {
    if (!path) return '';
    // Extract the file name from the path
    const parts = path.split(/[/\\]/);
    return parts[parts.length - 1];
}

/**
 * Truncates a header value for display.
 * @param {string} headerValue - The header value to truncate
 * @param {number} frontChars - Number of characters to keep at the front
 * @param {number} backChars - Number of characters to keep at the end
 * @returns {string} - The truncated header value
 */
export function formatHeaderValue(headerValue, frontChars = 15, backChars = 5) {
    if (!headerValue || headerValue.length <= frontChars + backChars) {
        return headerValue;
    }
    return (
        headerValue.slice(0, frontChars) +
        '...' +
        (backChars > 0 ? headerValue.slice(-backChars) : '')
    );
}

/**
 * Truncates a domain value for display.
 * @param {string} domainValue - The domain to truncate
 * @param {number} maxChars - Maximum number of characters before truncation
 * @returns {string} - The truncated domain
 */
export function formatDomainValue(domainValue, maxChars = 15) {
    if (!domainValue || domainValue.length <= maxChars) {
        return domainValue;
    }
    return domainValue.slice(0, maxChars) + '...';
}

/**
 * More flexible text truncation that handles different text types better.
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length before truncation
 * @returns {string} - The truncated text
 */
export function truncateText(text, maxLength = 20) {
    if (!text) return '';

    // Convert to string if not already
    const str = String(text);

    if (str.length <= maxLength) return str;

    // For very long text, show character count
    if (str.length > 100) {
        return str.substring(0, maxLength - 7) + `...[${str.length}]`;
    }

    // Standard truncation
    return str.substring(0, maxLength) + '...';
}

/**
 * Normalizes HTTP header names to match Chrome's network stack behavior.
 * @param {string} headerName - The header name to normalize
 * @returns {string} - The normalized header name
 */
export function normalizeHeaderName(headerName) {
    if (!headerName) return '';

    // Split by hyphens and capitalize first letter of each part
    return headerName.split('-')
        .map(part => {
            if (part.length === 0) return '';
            return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('-');
}

/**
 * Generates a unique ID for entries.
 * @returns {string} - A unique ID
 */
export function generateUniqueId() {
    return (window.crypto?.randomUUID)
        ? window.crypto.randomUUID()
        : 'uid_' + Date.now();
}