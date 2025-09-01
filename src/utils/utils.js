/**
 * Shared utility functions
 */

export {
  validateHeaderName,
  validateHeaderValue,
  validateDomain,
  validateDomains,
  sanitizeHeaderValue,
  getSuggestedHeaders
} from './header-validator';

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
      id: source.sourceId,
      content: source.sourceContent
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

  // If it's already a full URL pattern, return as-is
  if (urlFilter.includes('://')) {
    // Ensure it has a path component
    const protocolEnd = urlFilter.indexOf('://') + 3;
    const afterProtocol = urlFilter.substring(protocolEnd);

    if (!afterProtocol.includes('/')) {
      urlFilter = urlFilter + '/*';
    }

    return urlFilter;
  }

  // Handle IP addresses specially
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;
  if (ipRegex.test(urlFilter)) {
    return '*://' + urlFilter + '/*';
  }

  // Handle localhost
  if (urlFilter === 'localhost' || urlFilter.startsWith('localhost:')) {
    return '*://' + urlFilter + '/*';
  }

  // If the domain doesn't include a protocol and doesn't start with *, add *:// at the beginning
  if (!urlFilter.startsWith('*')) {
    urlFilter = '*://' + urlFilter;
  } else if (urlFilter.startsWith('*.')) {
    // Convert *.example.com to *://*.example.com
    urlFilter = '*://' + urlFilter;
  } else if (urlFilter.startsWith('*') && !urlFilter.startsWith('*://')) {
    // Convert *example.com to *://*example.com (but not *://)
    urlFilter = '*://' + urlFilter;
  }

  // Make sure the pattern includes a path component for proper matching
  if (!urlFilter.includes('/') || urlFilter.endsWith('://')) {
    urlFilter = urlFilter + '/*';
  } else {
    // Check if it ends with a domain without path
    const lastSlash = urlFilter.lastIndexOf('/');
    const protocolSlashes = urlFilter.indexOf('://');

    // If the only slashes are from the protocol, add /*
    if (lastSlash <= protocolSlashes + 1) {
      urlFilter = urlFilter + '/*';
    }
  }

  return urlFilter;
};