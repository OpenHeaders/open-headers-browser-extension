/**
 * URL Utilities - Common URL handling functions
 */

/**
 * Normalize a URL for consistent tracking
 * Removes fragments, normalizes case, handles IDN domains
 */
export function normalizeUrlForTracking(url) {
    try {
        const urlObj = new URL(url);

        // Remove fragment
        urlObj.hash = '';

        // Normalize hostname to lowercase
        urlObj.hostname = urlObj.hostname.toLowerCase();

        // Handle IDN domains - convert to ASCII (punycode)
        if (urlObj.hostname.includes('xn--') || /[^\x00-\x7F]/.test(urlObj.hostname)) {
            // Already punycoded or contains non-ASCII
            // Browser already handles this, but ensure consistency
        }

        // Remove default ports
        if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
            (urlObj.protocol === 'https:' && urlObj.port === '443')) {
            urlObj.port = '';
        }

        // Remove trailing slash from pathname if it's just /
        if (urlObj.pathname === '/') {
            urlObj.pathname = '';
        }

        return urlObj.toString();
    } catch (e) {
        // If URL parsing fails, return original
        return url.toLowerCase();
    }
}

/**
 * Check if a URL should be tracked at all
 */
export function isTrackableUrl(url) {
    if (!url) return false;

    // List of URL schemes that should not be tracked
    const nonTrackableSchemes = [
        'about:',
        'chrome:',
        'chrome-extension:',
        'edge:',
        'extension:',
        'moz-extension:',
        'opera:',
        'vivaldi:',
        'brave:',
        'data:',
        'blob:',
        'javascript:',
        'view-source:',
        'ws:',
        'wss:',
        'ftp:',
        'sftp:',
        'chrome-devtools:',
        'devtools:'
    ];

    // Check if URL starts with any non-trackable scheme
    const lowerUrl = url.toLowerCase();
    for (const scheme of nonTrackableSchemes) {
        if (lowerUrl.startsWith(scheme)) {
            console.log(`Info: Ignoring non-trackable URL scheme: ${url}`);
            return false;
        }
    }

    // Special handling for file:// URLs - only track if extension has file access
    if (lowerUrl.startsWith('file://')) {
        // You might want to check if the extension has file access permission
        // For now, we'll allow tracking but pattern matching might need adjustment
        console.log(`Info: File URL detected, tracking may be limited: ${url}`);
    }

    return true;
}

/**
 * Enhanced URL pattern matching with better edge case handling
 * @param {string} url - The URL to check
 * @param {string} pattern - The domain pattern (can include wildcards)
 * @returns {boolean} - Whether the URL matches the pattern
 */
export function doesUrlMatchPattern(url, pattern) {
    try {
        // Normalize both URL and pattern for comparison
        const normalizedUrl = normalizeUrlForTracking(url);
        let urlFilter = pattern.trim().toLowerCase();

        // Convert pattern to a regex
        if (urlFilter === '*') {
            return true; // Matches everything
        }

        // Handle IDN in patterns
        try {
            // If pattern contains non-ASCII, try to parse it as URL
            if (/[^\x00-\x7F]/.test(urlFilter)) {
                const patternUrl = new URL(urlFilter.includes('://') ? urlFilter : 'http://' + urlFilter);
                urlFilter = patternUrl.hostname.toLowerCase();
            }
        } catch (e) {
            // Pattern is not a valid URL, continue with original
        }

        // If pattern doesn't have protocol, add wildcard
        if (!urlFilter.includes('://')) {
            // Handle localhost and IP addresses specially
            if (urlFilter.startsWith('localhost') ||
                urlFilter.match(/^(\d{1,3}\.){3}\d{1,3}/) ||
                urlFilter.includes('[') && urlFilter.includes(']')) { // IPv6
                urlFilter = '*://' + urlFilter;
            } else {
                urlFilter = '*://' + urlFilter;
            }
        }

        // Ensure pattern has a path
        if (!urlFilter.includes('/', urlFilter.indexOf('://') + 3)) {
            urlFilter = urlFilter + '/*';
        }

        // Handle port numbers in pattern - normalize default ports
        urlFilter = urlFilter.replace(/:80\//, '/').replace(/:443\//, '/');

        // Convert to regex pattern
        let regexPattern = urlFilter
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
            .replace(/\*/g, '.*'); // Replace * with .*

        // Create regex (case insensitive)
        const regex = new RegExp('^' + regexPattern + '$', 'i');

        // Test the normalized URL
        const matches = regex.test(normalizedUrl);

        // Debug log for troubleshooting
        if (matches) {
            console.log(`Info: URL "${normalizedUrl}" matches pattern "${pattern}"`);
        }

        return matches;
    } catch (e) {
        console.log('Error matching URL pattern:', e);
        return false;
    }
}