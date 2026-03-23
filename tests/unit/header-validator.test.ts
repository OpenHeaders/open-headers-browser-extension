import { describe, it, expect } from 'vitest';
import {
    validateHeaderName,
    validateHeaderValue,
    sanitizeHeaderValue,
} from '../../src/utils/header-validator';

// ---------------------------------------------------------------------------
//  Enterprise test data
// ---------------------------------------------------------------------------

const JWT_LONG =
    'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InByb2QtcnNhLTIwMjUtMDEifQ.' +
    'eyJzdWIiOiJ1c2VyQGFjbWUuY29tIiwiaWF0IjoxNzMxNjYwMjAwLCJleHAiOjE3MzE2NjM4MDAsImF1ZCI6Imh0dHBzOi8vYXBpLm9wZW5oZWFkZXJzLmlvIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLm9wZW5oZWFkZXJzLmlvIiwic2NvcGUiOiJyZWFkIHdyaXRlIGFkbWluIiwib3JnX2lkIjoib3JnXzEyMzQ1Njc4OTBhYmNkZWYifQ.' +
    'kL7G5z8Q9xYt2mNpO4rSdEfGhIjKlMnBvCxZaWqErTyUiOpAsDfGhJkLzXcVbNm1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const API_KEY_ENTERPRISE = 'oh_live_a1b2c3d4e5f6g7h8i9j0klmnopqrstuvwxyz1234567890ABCDEF';


// ---------------------------------------------------------------------------
//  validateHeaderName
// ---------------------------------------------------------------------------

describe('validateHeaderName', () => {
    it('accepts valid header names', () => {
        expect(validateHeaderName('X-Custom-Header').valid).toBe(true);
        expect(validateHeaderName('Authorization').valid).toBe(true);
        expect(validateHeaderName('Content-Type').valid).toBe(true);
    });

    it('rejects empty header names', () => {
        expect(validateHeaderName('').valid).toBe(false);
        expect(validateHeaderName('   ').valid).toBe(false);
    });

    it('rejects forbidden request headers', () => {
        expect(validateHeaderName('host').valid).toBe(false);
        expect(validateHeaderName('content-length').valid).toBe(false);
        expect(validateHeaderName('connection').valid).toBe(false);
    });

    it('rejects forbidden response headers', () => {
        expect(validateHeaderName('content-length', true).valid).toBe(false);
        expect(validateHeaderName('transfer-encoding', true).valid).toBe(false);
    });

    it('rejects header names with invalid characters', () => {
        expect(validateHeaderName('Header Name').valid).toBe(false);
        expect(validateHeaderName('Header\tName').valid).toBe(false);
    });

    it('rejects header names longer than 256 characters', () => {
        expect(validateHeaderName('X-' + 'a'.repeat(255)).valid).toBe(false);
    });

    it('provides sanitized name', () => {
        const result = validateHeaderName('X-Custom-Header');
        expect(result.sanitized).toBe('X-Custom-Header');
    });

    it('warns about referrer spelling', () => {
        const result = validateHeaderName('Referrer');
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('Referer');
    });

    it('accepts enterprise tracing headers', () => {
        expect(validateHeaderName('X-B3-TraceId').valid).toBe(true);
        expect(validateHeaderName('X-Correlation-ID').valid).toBe(true);
        expect(validateHeaderName('Traceparent').valid).toBe(true);
        expect(validateHeaderName('X-Amz-Security-Token').valid).toBe(true);
    });
});

// ---------------------------------------------------------------------------
//  validateHeaderValue
// ---------------------------------------------------------------------------

describe('validateHeaderValue', () => {
    it('accepts valid header values', () => {
        expect(validateHeaderValue('Bearer token123').valid).toBe(true);
        expect(validateHeaderValue('application/json').valid).toBe(true);
    });

    it('rejects empty values', () => {
        expect(validateHeaderValue('').valid).toBe(false);
        expect(validateHeaderValue('   ').valid).toBe(false);
    });

    it('rejects values with null bytes', () => {
        expect(validateHeaderValue('value\0with\0null').valid).toBe(false);
    });

    it('rejects values with line breaks', () => {
        expect(validateHeaderValue('value\nwith\nnewlines').valid).toBe(false);
        expect(validateHeaderValue('value\r\nwith\r\ncrlf').valid).toBe(false);
    });

    it('rejects values with control characters', () => {
        expect(validateHeaderValue('value\x01with\x02control').valid).toBe(false);
    });

    it('rejects values longer than 8192 characters', () => {
        expect(validateHeaderValue('a'.repeat(8193)).valid).toBe(false);
    });

    it('warns about non-ASCII characters', () => {
        const result = validateHeaderValue('caf\u00e9');
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('non-ASCII');
    });

    it('accepts realistic JWT header value (300+ chars)', () => {
        expect(JWT_LONG.length).toBeGreaterThan(300);
        const result = validateHeaderValue(JWT_LONG, 'Authorization');
        expect(result.valid).toBe(true);
        expect(result.message).toBe('');
    });

    it('accepts enterprise API key with special characters', () => {
        const result = validateHeaderValue(API_KEY_ENTERPRISE, 'X-API-Key');
        expect(result.valid).toBe(true);
    });

    it('accepts connection-string-style value', () => {
        const connStr = 'Server=db.openheaders.io;Port=5432;Database=headers_prod;User Id=app_svc;Password=s3cur3P@ss!';
        const result = validateHeaderValue(connStr, 'X-DB-Connection');
        expect(result.valid).toBe(true);
    });

    it('accepts value at exactly 8192 characters (boundary)', () => {
        const result = validateHeaderValue('X'.repeat(8192));
        expect(result.valid).toBe(true);
    });

    it('rejects value at 8193 characters (boundary)', () => {
        const result = validateHeaderValue('X'.repeat(8193));
        expect(result.valid).toBe(false);
        expect(result.message).toContain('too long');
    });
});

// ---------------------------------------------------------------------------
//  sanitizeHeaderValue
// ---------------------------------------------------------------------------

describe('sanitizeHeaderValue', () => {
    it('removes null bytes', () => {
        expect(sanitizeHeaderValue('hello\0world')).toBe('helloworld');
    });

    it('removes control characters', () => {
        expect(sanitizeHeaderValue('hello\x01world')).toBe('helloworld');
    });

    it('removes newlines', () => {
        expect(sanitizeHeaderValue('hello\nworld')).toBe('helloworld');
    });

    it('trims whitespace', () => {
        expect(sanitizeHeaderValue('  hello  ')).toBe('hello');
    });

    it('truncates long values', () => {
        const longValue = 'a'.repeat(10000);
        const sanitized = sanitizeHeaderValue(longValue);
        expect(sanitized.length).toBeLessThanOrEqual(8192);
    });

    it('returns empty string for empty input', () => {
        expect(sanitizeHeaderValue('')).toBe('');
    });

    it('passes through valid JWT token unchanged', () => {
        expect(sanitizeHeaderValue(JWT_LONG)).toBe(JWT_LONG);
    });

    it('sanitizes tainted enterprise API key', () => {
        const tainted = '  oh_live_abc\x01\x02def\0ghi  ';
        expect(sanitizeHeaderValue(tainted)).toBe('oh_live_abcdefghi');
    });
});

