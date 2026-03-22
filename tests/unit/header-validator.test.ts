import { describe, it, expect } from 'vitest';
import {
    validateHeaderName,
    validateHeaderValue,
    validateDomain,
    validateDomains,
    sanitizeHeaderValue,
    getSuggestedHeaders,
} from '../../src/utils/header-validator';

// ---------------------------------------------------------------------------
//  Enterprise test data
// ---------------------------------------------------------------------------

const JWT_LONG =
    'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InByb2QtcnNhLTIwMjUtMDEifQ.' +
    'eyJzdWIiOiJ1c2VyQGFjbWUuY29tIiwiaWF0IjoxNzMxNjYwMjAwLCJleHAiOjE3MzE2NjM4MDAsImF1ZCI6Imh0dHBzOi8vYXBpLm9wZW5oZWFkZXJzLmlvIiwiaXNzIjoiaHR0cHM6Ly9hdXRoLm9wZW5oZWFkZXJzLmlvIiwic2NvcGUiOiJyZWFkIHdyaXRlIGFkbWluIiwib3JnX2lkIjoib3JnXzEyMzQ1Njc4OTBhYmNkZWYifQ.' +
    'kL7G5z8Q9xYt2mNpO4rSdEfGhIjKlMnBvCxZaWqErTyUiOpAsDfGhJkLzXcVbNm1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const API_KEY_ENTERPRISE = 'oh_live_a1b2c3d4e5f6g7h8i9j0klmnopqrstuvwxyz1234567890ABCDEF';

const ENTERPRISE_DOMAINS = [
    '*.openheaders.io',
    'api.partner-service.io:8443',
    'dashboard.acme-corp.com',
    'staging.openheaders.io',
    'canary.openheaders.io',
    'api-gateway.us-east-1.openheaders.io',
    'api-gateway.eu-west-1.openheaders.io',
    'api-gateway.ap-southeast-1.openheaders.io',
    'cdn.openheaders.io',
    'websocket.openheaders.io',
    'grpc.openheaders.io',
    'graphql.openheaders.io',
    'auth.openheaders.io',
    'sso.openheaders.io',
    'idp.openheaders.io',
    'metrics.openheaders.io',
    'logs.openheaders.io',
    'traces.openheaders.io',
    'alerts.openheaders.io',
    'status.openheaders.io',
    'docs.openheaders.io',
    'support.openheaders.io',
    'billing.openheaders.io',
    'admin.openheaders.io',
    'internal.openheaders.io',
    'dev.openheaders.io',
    'test.openheaders.io',
    'sandbox.openheaders.io',
    'preview.openheaders.io',
    'demo.openheaders.io',
    'beta.openheaders.io',
    'alpha.openheaders.io',
    'nightly.openheaders.io',
    'rc.openheaders.io',
    'release.openheaders.io',
    'hotfix.openheaders.io',
    'feature.openheaders.io',
    'experiment.openheaders.io',
    'a-b-test.openheaders.io',
    'perf.openheaders.io',
    'load.openheaders.io',
    'stress.openheaders.io',
    'chaos.openheaders.io',
    'dr.openheaders.io',
    'failover.openheaders.io',
    'backup.openheaders.io',
    'archive.openheaders.io',
    'legacy.openheaders.io',
    'v1.openheaders.io',
    'v2.openheaders.io',
    'localhost:3000',
];

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
//  validateDomain
// ---------------------------------------------------------------------------

describe('validateDomain', () => {
    it('accepts valid domains', () => {
        expect(validateDomain('example.com').valid).toBe(true);
        expect(validateDomain('*.example.com').valid).toBe(true);
        expect(validateDomain('https://example.com/*').valid).toBe(true);
    });

    it('rejects empty domains', () => {
        expect(validateDomain('').valid).toBe(false);
        expect(validateDomain('   ').valid).toBe(false);
    });

    it('rejects domains with spaces', () => {
        expect(validateDomain('example .com').valid).toBe(false);
    });

    it('rejects domains starting with dots', () => {
        expect(validateDomain('.example.com').valid).toBe(false);
    });

    it('rejects domains with consecutive wildcards', () => {
        expect(validateDomain('**.example.com').valid).toBe(false);
    });

    it('rejects invalid protocols', () => {
        expect(validateDomain('foobar://example.com').valid).toBe(false);
    });

    it('validates IPv4 addresses', () => {
        expect(validateDomain('192.168.1.1').valid).toBe(true);
        expect(validateDomain('999.999.999.999').valid).toBe(false);
    });

    it('warns about localhost patterns', () => {
        const result = validateDomain('localhost');
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('local');
    });

    it('warns about wildcard matching all sites', () => {
        const result = validateDomain('*');
        expect(result.valid).toBe(true);
        expect(result.warning).toContain('ALL');
    });

    it('accepts enterprise domain with port', () => {
        const result = validateDomain('api.partner-service.io:8443');
        expect(result.valid).toBe(true);
    });

    it('accepts deep subdomain pattern', () => {
        const result = validateDomain('api-gateway.us-east-1.openheaders.io');
        expect(result.valid).toBe(true);
    });
});

// ---------------------------------------------------------------------------
//  validateDomains (enterprise list with 50+ domains)
// ---------------------------------------------------------------------------

describe('validateDomains', () => {
    it('accepts enterprise domain list with 50+ domains', () => {
        expect(ENTERPRISE_DOMAINS.length).toBeGreaterThanOrEqual(51);
        const result = validateDomains(ENTERPRISE_DOMAINS);
        expect(result.valid).toBe(true);
    });

    it('rejects empty array', () => {
        const result = validateDomains([]);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('At least one');
    });

    it('rejects non-array input', () => {
        const result = validateDomains('not-an-array' as unknown as string[]);
        expect(result.valid).toBe(false);
    });

    it('rejects more than 100 domains', () => {
        const tooMany = Array.from({ length: 101 }, (_, i) => `sub${i}.openheaders.io`);
        const result = validateDomains(tooMany);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('max 100');
    });

    it('rejects duplicate domains', () => {
        const result = validateDomains(['api.openheaders.io', 'api.openheaders.io']);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('Duplicate');
    });

    it('collects errors from invalid domains in the list', () => {
        const result = validateDomains(['.invalid.com', 'good.com']);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('.invalid.com');
    });

    it('collects warnings from domains with cautions', () => {
        const result = validateDomains(['localhost', '127.0.0.1']);
        expect(result.valid).toBe(true);
        expect(result.warning).toBeTruthy();
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

// ---------------------------------------------------------------------------
//  getSuggestedHeaders
// ---------------------------------------------------------------------------

describe('getSuggestedHeaders', () => {
    it('returns suggestions matching partial input "auth"', () => {
        const suggestions = getSuggestedHeaders('auth');
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions.some(h => h.toLowerCase().includes('auth'))).toBe(true);
    });

    it('returns suggestions for "x-api" prefix', () => {
        const suggestions = getSuggestedHeaders('x-api');
        expect(suggestions.length).toBeGreaterThan(0);
        suggestions.forEach(h => {
            expect(h.toLowerCase()).toContain('x-api');
        });
    });

    it('returns response headers when isResponse=true', () => {
        const suggestions = getSuggestedHeaders('cache', true);
        expect(suggestions.length).toBeGreaterThan(0);
    });

    it('returns empty array for input matching no headers', () => {
        const suggestions = getSuggestedHeaders('zzzznonexistentheaderzzzz');
        expect(suggestions).toEqual([]);
    });

    it('filters out forbidden headers from suggestions', () => {
        const suggestions = getSuggestedHeaders('content-length');
        // content-length is forbidden in both request and response
        const hasContentLength = suggestions.some(h => h.toLowerCase() === 'content-length');
        expect(hasContentLength).toBe(false);
    });

    it('returns request headers for tracing prefix "x-b3"', () => {
        const suggestions = getSuggestedHeaders('x-b3');
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions.some(h => h.startsWith('X-B3-'))).toBe(true);
    });

    it('returns AWS-related headers for "x-amz"', () => {
        const suggestions = getSuggestedHeaders('x-amz');
        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions.some(h => h.startsWith('X-Amz-'))).toBe(true);
    });

    it('is case-insensitive for input matching', () => {
        const lower = getSuggestedHeaders('authorization');
        const upper = getSuggestedHeaders('AUTHORIZATION');
        // Both should find the same headers
        expect(lower.length).toBe(upper.length);
        expect(lower).toEqual(upper);
    });
});
