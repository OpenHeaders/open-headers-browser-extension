/**
 * Shared utility functions
 */

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
