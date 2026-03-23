/**
 * Functions for validating and sanitizing header names and values
 * for use with Chrome's declarativeNetRequest API.
 */

export interface ValidationResult {
  valid: boolean;
  sanitized?: string;
  warning?: string;
  message: string;
}

// Headers that cannot be modified by extensions
const FORBIDDEN_REQUEST_HEADERS = new Set([
  'host', 'content-length', 'connection', 'keep-alive', 'upgrade',
  'te', 'trailer', 'transfer-encoding',
  'accept-charset', 'accept-encoding', 'access-control-request-headers',
  'access-control-request-method', 'date', 'dnt', 'expect', 'origin',
  'permissions-policy', 'tk', 'upgrade-insecure-requests',
  'proxy-authorization', 'proxy-connection',
  'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-user',
  'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
  'x-devtools-emulate-network-conditions-client-id', 'x-devtools-request-id'
]);

const FORBIDDEN_RESPONSE_HEADERS = new Set([
  'alt-svc', 'clear-site-data', 'connection', 'content-length',
  'content-encoding', 'content-range', 'date', 'expect-ct',
  'keep-alive', 'public-key-pins', 'strict-transport-security',
  'trailer', 'transfer-encoding', 'upgrade', 'vary'
]);

/**
 * Validates a header name for browser extension compatibility
 */
export function validateHeaderName(name: string, isResponse = false): ValidationResult {
  if (!name) {
    return { valid: false, message: 'Header name cannot be empty' };
  }

  const trimmedName = name.trim();

  if (!trimmedName) {
    return { valid: false, message: 'Header name cannot be only whitespace' };
  }

  if (trimmedName.length > 256) {
    return { valid: false, message: 'Header name is too long (max 256 characters)' };
  }

  const lowerName = trimmedName.toLowerCase();

  const forbiddenSet = isResponse ? FORBIDDEN_RESPONSE_HEADERS : FORBIDDEN_REQUEST_HEADERS;
  if (forbiddenSet.has(lowerName)) {
    return { valid: false, message: `"${trimmedName}" is a protected header that cannot be modified by extensions` };
  }

  // RFC 7230: header field names must be valid tokens
  const validHeaderNameRegex = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/;
  if (!validHeaderNameRegex.test(trimmedName)) {
    return { valid: false, message: 'Header name contains invalid characters. Only letters, numbers, and -_.~!#$%&\'*+^`| are allowed' };
  }

  let warning: string | undefined = undefined;
  if (lowerName === 'referrer') {
    warning = 'Note: The correct spelling is "Referer" (single r)';
  }

  return { valid: true, sanitized: trimmedName, warning, message: '' };
}

/**
 * Validates if a header value is acceptable for browser APIs
 */
export function validateHeaderValue(value: string, headerName = ''): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return { valid: false, message: 'Header value cannot be empty' };
  }

  if (!value.trim()) {
    return { valid: false, message: 'Header value cannot be only whitespace' };
  }

  if (value.length > 8192) {
    return { valid: false, message: 'Header value is too long (max 8192 characters)' };
  }

  if (value.includes('\0')) {
    return { valid: false, message: 'Header value cannot contain null bytes' };
  }

  if (/\r\n[\t ]/.test(value)) {
    return { valid: false, message: 'Header value cannot contain line folding (CRLF followed by space/tab)' };
  }

  if (/[\r\n]/.test(value)) {
    return { valid: false, message: 'Header value cannot contain line breaks' };
  }

  if (/[\x00-\x08\x0A-\x1F\x7F]/.test(value)) {
    return { valid: false, message: 'Header value contains invalid control characters' };
  }

  if (headerName.toLowerCase() === 'content-type') {
    if (!/^[\w\-/+.]+/.test(value)) {
      return { valid: false, message: 'Content-Type header has invalid format' };
    }
  }

  if (/[\x80-\xFF]/.test(value)) {
    return { valid: true, warning: 'Header value contains non-ASCII characters that may cause compatibility issues', message: '' };
  }

  return { valid: true, message: '' };
}

/**
 * Sanitizes a header value by removing or replacing invalid characters
 */
export function sanitizeHeaderValue(value: string): string {
  if (!value) return '';

  let sanitized = String(value);
  sanitized = sanitized.replace(/\0/g, '');
  sanitized = sanitized.replace(/[\x00-\x08\x0A-\x1F\x7F]/g, '');
  sanitized = sanitized.replace(/[\r\n]+/g, ' ');
  sanitized = sanitized.trim();

  if (sanitized.length > 8192) {
    sanitized = sanitized.substring(0, 8189) + '...';
  }

  return sanitized;
}
