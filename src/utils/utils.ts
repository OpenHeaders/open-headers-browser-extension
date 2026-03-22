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
 */
export const normalizeHeaderName = (headerName: string): string => {
  if (!headerName) return '';

  return headerName
    .trim()
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
};

/**
 * Generates a unique ID for new entries
 */
export const generateUniqueId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};
