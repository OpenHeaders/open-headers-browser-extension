import { describe, it, expect } from 'vitest';
import { isValidHeaderValue, sanitizeHeaderValue, validateHeaderValue } from '../../src/background/rule-validator';
import type { HeaderValueValidation } from '../../src/types/header';

// ---------------------------------------------------------------------------
//  Enterprise test data
// ---------------------------------------------------------------------------

const JWT_TOKEN =
    'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIiwiaWF0IjoxNzMxNjYwMjAwLCJleHAiOjE3MzE2NjM4MDAsImF1ZCI6Imh0dHBzOi8vYXBpLm9wZW5oZWFkZXJzLmlvIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLm9wZW5oZWFkZXJzLmlvIiwic2NvcGUiOiJyZWFkIHdyaXRlIGFkbWluIn0.kL7G5z-signature-placeholder';

const API_KEY = 'oh_live_a1b2c3d4e5f6g7h8i9j0klmnopqrstuvwxyz1234567890ABCDEF';

const BASE64_VALUE =
    'SGVsbG8gT3BlbkhlYWRlcnMhIFRoaXMgaXMgYSBiYXNlNjQgZW5jb2RlZCB2YWx1ZSBmb3IgdGVzdGluZy4=';

// ---------------------------------------------------------------------------
//  isValidHeaderValue
// ---------------------------------------------------------------------------

describe('isValidHeaderValue', () => {
    it('returns true for a valid JWT bearer token', () => {
        expect(isValidHeaderValue(JWT_TOKEN, 'Authorization')).toBe(true);
    });

    it('returns true for a valid API key', () => {
        expect(isValidHeaderValue(API_KEY, 'X-API-Key')).toBe(true);
    });

    it('returns true for a base64-encoded value', () => {
        expect(isValidHeaderValue(BASE64_VALUE, 'X-Custom-Payload')).toBe(true);
    });

    it('returns true for application/json content type', () => {
        expect(isValidHeaderValue('application/json; charset=utf-8', 'Content-Type')).toBe(true);
    });

    it('returns false for empty string', () => {
        expect(isValidHeaderValue('', 'Authorization')).toBe(false);
    });

    it('returns false for value with null bytes', () => {
        expect(isValidHeaderValue('Bearer token\0injected', 'Authorization')).toBe(false);
    });

    it('returns false for value with newlines', () => {
        expect(isValidHeaderValue('Bearer token\r\nX-Injected: evil', 'Authorization')).toBe(false);
    });

    it('returns false for value with control characters', () => {
        expect(isValidHeaderValue('token\x01\x02value', 'X-Custom')).toBe(false);
    });

    it('returns false for value exceeding 8192 characters', () => {
        const longValue = 'A'.repeat(8193);
        expect(isValidHeaderValue(longValue, 'X-Large-Payload')).toBe(false);
    });

    it('returns true for value with special chars in API key', () => {
        expect(isValidHeaderValue('sk-proj_abc123+def456/ghi789==', 'X-API-Key')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
//  sanitizeHeaderValue
// ---------------------------------------------------------------------------

describe('sanitizeHeaderValue', () => {
    it('removes null bytes from JWT token', () => {
        const tainted = 'Bearer eyJhbGci\0OiJSUzI1NiJ9';
        const result = sanitizeHeaderValue(tainted);
        expect(result).toBe('Bearer eyJhbGciOiJSUzI1NiJ9');
    });

    it('removes control characters from API key', () => {
        const tainted = 'oh_live_abc\x01\x02def';
        const result = sanitizeHeaderValue(tainted);
        expect(result).toBe('oh_live_abcdef');
    });

    it('trims whitespace from value', () => {
        expect(sanitizeHeaderValue('  Bearer token  ')).toBe('Bearer token');
    });

    it('truncates values longer than 8192 chars', () => {
        const longValue = 'X'.repeat(10000);
        const result = sanitizeHeaderValue(longValue);
        expect(result.length).toBeLessThanOrEqual(8192);
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeHeaderValue('')).toBe('');
    });

    it('passes through valid JWT unchanged', () => {
        expect(sanitizeHeaderValue(JWT_TOKEN)).toBe(JWT_TOKEN);
    });
});

// ---------------------------------------------------------------------------
//  validateHeaderValue (full validation result)
// ---------------------------------------------------------------------------

describe('validateHeaderValue', () => {
    it('returns full valid result for JWT bearer token', () => {
        const result: HeaderValueValidation = validateHeaderValue(JWT_TOKEN, 'Authorization');
        expect(result).toEqual({
            valid: true,
            message: '',
        });
    });

    it('returns full valid result for API key with special characters', () => {
        const result: HeaderValueValidation = validateHeaderValue(API_KEY, 'X-API-Key');
        expect(result).toEqual({
            valid: true,
            message: '',
        });
    });

    it('returns full valid result for base64-encoded value', () => {
        const result: HeaderValueValidation = validateHeaderValue(BASE64_VALUE, 'X-Payload');
        expect(result).toEqual({
            valid: true,
            message: '',
        });
    });

    it('returns invalid result for empty value', () => {
        const result: HeaderValueValidation = validateHeaderValue('', 'Authorization');
        expect(result.valid).toBe(false);
        expect(result.message).toBeTruthy();
    });

    it('returns invalid result for whitespace-only value', () => {
        const result: HeaderValueValidation = validateHeaderValue('   ', 'Authorization');
        expect(result.valid).toBe(false);
    });

    it('returns invalid result for value with null bytes', () => {
        const result: HeaderValueValidation = validateHeaderValue(
            'Bearer\0injected',
            'Authorization'
        );
        expect(result.valid).toBe(false);
        expect(result.message).toContain('null');
    });

    it('returns invalid result for value with CRLF injection', () => {
        const result: HeaderValueValidation = validateHeaderValue(
            'Bearer token\r\nSet-Cookie: evil=1',
            'Authorization'
        );
        expect(result.valid).toBe(false);
    });

    it('returns invalid result for value with control chars', () => {
        const result: HeaderValueValidation = validateHeaderValue(
            '\x01\x02\x03',
            'X-Custom'
        );
        expect(result.valid).toBe(false);
    });

    it('returns invalid result for oversized value', () => {
        const result: HeaderValueValidation = validateHeaderValue(
            'B'.repeat(8193),
            'X-Huge'
        );
        expect(result.valid).toBe(false);
        expect(result.message).toContain('too long');
    });
});
