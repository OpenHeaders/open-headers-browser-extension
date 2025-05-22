/**
 * Functions for validating and sanitizing header values for use in React components
 */

/**
 * Validates if a header value is acceptable for browser APIs
 * @param {string} value - The header value to validate
 * @returns {object} - Validation result with valid flag and message
 */
export function validateHeaderValue(value) {
  if (!value) {
    return {
      valid: false,
      message: 'Header value cannot be empty'
    };
  }

  if (typeof value !== 'string') {
    return {
      valid: false,
      message: 'Header value must be a string'
    };
  }

  // Check for control characters (0-31 and 127) except tab (9)
  const hasControlChars = /[\x00-\x08\x0A-\x1F\x7F]/.test(value);
  if (hasControlChars) {
    return {
      valid: false,
      message: 'Header value contains invalid control characters'
    };
  }

  // Check for non-ASCII characters (128-255)
  const hasNonAscii = /[\x80-\xFF]/.test(value);
  if (hasNonAscii) {
    return {
      valid: false,
      message: 'Header value contains non-ASCII characters that may cause issues'
    };
  }

  // Check for newlines or carriage returns
  if (/[\r\n]/.test(value)) {
    return {
      valid: false,
      message: 'Header value cannot contain line breaks'
    };
  }

  return {
    valid: true,
    message: ''
  };
}

/**
 * Sanitizes a header value by removing or replacing invalid characters
 * @param {string} value - The header value to sanitize
 * @returns {string} - The sanitized header value
 */
export function sanitizeHeaderValue(value) {
  if (!value) return '';

  // Remove control characters except tab
  let sanitized = value.replace(/[\x00-\x08\x0A-\x1F\x7F]/g, '');

  // Replace newlines and carriage returns with spaces
  sanitized = sanitized.replace(/[\r\n]/g, ' ');

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}