/**
 * Functions for validating and sanitizing header values for declarativeNetRequest
 */
import { validateHeaderValue as validateHeaderValueCore, sanitizeHeaderValue as sanitizeHeaderValueCore } from '../utils/header-validator';

import type { HeaderValueValidation } from '../types/header';

/**
 * Validates if a header value is acceptable for Chrome's declarativeNetRequest API.
 */
export function isValidHeaderValue(value: string, headerName: string = ''): boolean {
    // Use the core validation function
    const validation: HeaderValueValidation = validateHeaderValueCore(value, headerName);
    return validation.valid;
}

/**
 * Sanitizes a header value to make it valid for Chrome's declarativeNetRequest API.
 */
export function sanitizeHeaderValue(value: string): string {
    // Use the core sanitization function
    return sanitizeHeaderValueCore(value);
}

/**
 * Client-side validation for header values with user feedback messages.
 */
export function validateHeaderValue(value: string, headerName: string = ''): HeaderValueValidation {
    // Delegate to the core validation function
    return validateHeaderValueCore(value, headerName);
}
