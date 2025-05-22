/**
 * Shared utility functions
 */

/**
 * Normalizes a header name to proper capitalization format
 * @param {string} headerName - The header name to normalize
 * @returns {string} - The normalized header name (e.g. "content-type" -> "Content-Type")
 */
export const normalizeHeaderName = (headerName) => {
  if (!headerName) return '';
  
  return headerName
    .trim()
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
};

/**
 * Generates a unique ID for new entries
 * @returns {string} - A unique ID string
 */
export const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

/**
 * Creates a simple hash of object content to detect changes
 * @param {Array} sources - Array of source objects
 * @returns {string} - String hash of the sources
 */
export const generateSourcesHash = (sources) => {
  if (!sources || !Array.isArray(sources)) return '';

  // Create a simplified representation of the sources to compare
  const simplifiedSources = sources.map(source => {
    return {
      id: source.sourceId || source.locationId,
      content: source.sourceContent || source.locationContent
    };
  });

  return JSON.stringify(simplifiedSources);
};

/**
 * Creates a debounced function that delays invoking the callback
 * @param {Function} func - The function to debounce
 * @param {number} wait - The delay in milliseconds
 * @returns {Function} - Debounced function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
};

/**
 * Format a domain string into a proper URL pattern for rule matching
 * @param {string} domain - Domain pattern
 * @returns {string} - Formatted URL pattern
 */
export const formatUrlPattern = (domain) => {
  let urlFilter = domain.trim();

  // If the domain doesn't include a protocol and doesn't start with *, add * at the beginning
  if (!urlFilter.includes('://') && !urlFilter.startsWith('*')) {
    // If it contains a wildcard, ensure proper formatting
    if (urlFilter.includes('*')) {
      // Make sure wildcards work correctly with dot notation
      urlFilter = urlFilter.replace(/\*\./g, '*://');
    } else {
      // For exact domains, add *:// prefix to match both http and https
      urlFilter = '*://' + urlFilter;
    }
  }

  // Make sure the pattern includes a path component for proper matching
  if (!urlFilter.includes('/') && !urlFilter.endsWith('*')) {
    urlFilter = urlFilter + '/*';
  }

  return urlFilter;
};