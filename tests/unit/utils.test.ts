import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeHeaderName } from '../../src/utils/utils';
import { generateSourcesHash, generateSavedDataHash, debounce } from '../../src/background/modules/utils';
import { formatUrlPattern } from '../../src/background/header-manager';
import type { SavedDataMap } from '../../src/types/header';
import type { Source } from '../../src/types/websocket';

// ---------------------------------------------------------------------------
//  Factory functions
// ---------------------------------------------------------------------------

function makeSource(overrides: Partial<Source> = {}): Source {
    return {
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceType: 'http',
        sourcePath: 'https://auth.openheaders.io/oauth2/token',
        sourceMethod: 'POST',
        sourceName: 'ACME Corp OAuth Token',
        sourceTag: 'production',
        sourceContent: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig',
        createdAt: '2025-11-15T09:30:00.000Z',
        updatedAt: '2025-11-15T10:00:00.000Z',
        ...overrides,
    };
}

function makeSavedDataMap(overrides: Partial<SavedDataMap> = {}): SavedDataMap {
    return {
        'b2c3d4e5-f6a7-8901-bcde-f12345678901': {
            headerName: 'Authorization',
            headerValue: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig',
            domains: ['*.openheaders.io', 'api.partner-service.io:8443'],
            isDynamic: true,
            sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            prefix: 'Bearer ',
            isResponse: false,
            isEnabled: true,
            tag: 'production',
            createdAt: '2025-11-15T09:30:00.000Z',
            updatedAt: '2025-11-15T10:00:00.000Z',
        },
        'c3d4e5f6-a7b8-9012-cdef-123456789012': {
            headerName: 'X-API-Key',
            headerValue: 'oh_live_a1b2c3d4e5f6g7h8i9j0klmnopqrstuvwxyz1234567890ABCDEF',
            domains: ['localhost:3000'],
            isDynamic: false,
            isResponse: false,
            isEnabled: true,
            createdAt: '2025-11-15T09:30:00.000Z',
        },
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
//  normalizeHeaderName
// ---------------------------------------------------------------------------

describe('normalizeHeaderName', () => {
    it('capitalizes each word separated by hyphens', () => {
        expect(normalizeHeaderName('content-type')).toBe('Content-Type');
        expect(normalizeHeaderName('x-forwarded-for')).toBe('X-Forwarded-For');
    });

    it('handles single word headers', () => {
        expect(normalizeHeaderName('authorization')).toBe('Authorization');
    });

    it('handles already capitalized headers', () => {
        expect(normalizeHeaderName('Content-Type')).toBe('Content-Type');
    });

    it('handles ALL CAPS headers', () => {
        expect(normalizeHeaderName('CONTENT-TYPE')).toBe('Content-Type');
    });

    it('trims whitespace', () => {
        expect(normalizeHeaderName('  content-type  ')).toBe('Content-Type');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeHeaderName('')).toBe('');
    });

    it('normalizes enterprise header names', () => {
        expect(normalizeHeaderName('x-b3-traceid')).toBe('X-B3-Traceid');
        expect(normalizeHeaderName('x-amz-security-token')).toBe('X-Amz-Security-Token');
        expect(normalizeHeaderName('x-correlation-id')).toBe('X-Correlation-Id');
    });
});

// ---------------------------------------------------------------------------
//  generateSourcesHash (from src/utils/utils.ts)
// ---------------------------------------------------------------------------

describe('generateSourcesHash', () => {
    it('returns empty string for null/undefined', () => {
        expect(generateSourcesHash(null as never)).toBe('');
        expect(generateSourcesHash(undefined as never)).toBe('');
    });

    it('returns empty string for non-array', () => {
        expect(generateSourcesHash('string' as never)).toBe('');
    });

    it('creates consistent hash for same enterprise sources', () => {
        const sources = [makeSource(), makeSource({ sourceId: 'f1e2d3c4-b5a6-0987-fedc-ba9876543210' })];
        const hash1 = generateSourcesHash(sources);
        const hash2 = generateSourcesHash(sources);
        expect(hash1).toBe(hash2);
    });

    it('creates different hash for different sourceContent', () => {
        const s1 = [makeSource({ sourceContent: 'Bearer token-v1' })];
        const s2 = [makeSource({ sourceContent: 'Bearer token-v2' })];
        expect(generateSourcesHash(s1)).not.toBe(generateSourcesHash(s2));
    });

    it('ignores fields other than sourceId and sourceContent', () => {
        const source1 = makeSource({ sourceName: 'Name A' });
        const source2 = makeSource({ sourceName: 'Name B' });
        // Same sourceId + sourceContent → same hash regardless of other fields
        expect(generateSourcesHash([source1])).toBe(generateSourcesHash([source2]));
    });

    it('returns empty string for empty array', () => {
        expect(generateSourcesHash([])).toBe('');
    });

    it('handles source with undefined sourceContent', () => {
        const source = makeSource({ sourceContent: undefined });
        const hash = generateSourcesHash([source]);
        expect(hash).toBeTruthy();
        // Should differ from source with content
        expect(hash).not.toBe(generateSourcesHash([makeSource()]));
    });
});

// ---------------------------------------------------------------------------
//  generateSavedDataHash (from src/background/modules/utils.ts)
// ---------------------------------------------------------------------------

describe('generateSavedDataHash', () => {
    it('returns empty string for null/undefined', () => {
        expect(generateSavedDataHash(null as unknown as SavedDataMap)).toBe('');
        expect(generateSavedDataHash(undefined as unknown as SavedDataMap)).toBe('');
    });

    it('creates consistent hash for same saved data', () => {
        const data = makeSavedDataMap();
        const hash1 = generateSavedDataHash(data);
        const hash2 = generateSavedDataHash(data);
        expect(hash1).toBe(hash2);
    });

    it('creates different hash when header value changes', () => {
        const data1 = makeSavedDataMap();
        const data2 = makeSavedDataMap({
            'b2c3d4e5-f6a7-8901-bcde-f12345678901': {
                ...data1['b2c3d4e5-f6a7-8901-bcde-f12345678901'],
                headerValue: 'Bearer new-token-value',
            },
        });
        expect(generateSavedDataHash(data1)).not.toBe(generateSavedDataHash(data2));
    });

    it('uses only key fields for hashing (ignores domains, tags, etc.)', () => {
        const data1: SavedDataMap = {
            'entry-001': {
                headerName: 'X-Test',
                headerValue: 'test-value',
                domains: ['*.example.com'],
                isDynamic: false,
                sourceId: 'src-001',
                sourceMissing: false,
            },
        };
        const data2: SavedDataMap = {
            'entry-001': {
                headerName: 'X-Test',
                headerValue: 'test-value',
                domains: ['*.different.com'],
                isDynamic: false,
                sourceId: 'src-001',
                sourceMissing: false,
                tag: 'production',
            },
        };
        // Same key fields → same hash (domains/tag not included)
        expect(generateSavedDataHash(data1)).toBe(generateSavedDataHash(data2));
    });

    it('returns empty string for empty object', () => {
        expect(generateSavedDataHash({})).toBe('');
    });
});

// ---------------------------------------------------------------------------
//  debounce
// ---------------------------------------------------------------------------

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('delays invocation until after wait period', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 250);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(249);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('only invokes once for multiple rapid calls', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced();
        debounced();
        debounced();
        debounced();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets timer on each call', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        vi.advanceTimersByTime(80);
        expect(fn).not.toHaveBeenCalled();

        debounced(); // resets
        vi.advanceTimersByTime(80);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(20);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes arguments from the last call', () => {
        const fn = vi.fn<(a: string, b: number) => void>();
        const debounced = debounce(fn, 50);

        debounced('first', 1);
        debounced('second', 2);
        debounced('third', 3);

        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('third', 3);
    });

    it('allows subsequent invocations after wait period', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 50);

        debounced();
        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledTimes(1);

        debounced();
        vi.advanceTimersByTime(50);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

// ---------------------------------------------------------------------------
//  formatUrlPattern
// ---------------------------------------------------------------------------

describe('formatUrlPattern', () => {
    it('adds protocol and path to bare domains', () => {
        expect(formatUrlPattern('example.com')).toBe('*://example.com/*');
    });

    it('preserves full URL patterns', () => {
        expect(formatUrlPattern('https://example.com/path')).toBe('https://example.com/path');
    });

    it('adds path to URL patterns without path', () => {
        expect(formatUrlPattern('https://example.com')).toBe('https://example.com/*');
    });

    it('handles IP addresses', () => {
        expect(formatUrlPattern('192.168.1.1')).toBe('*://192.168.1.1/*');
        expect(formatUrlPattern('192.168.1.1:8080')).toBe('*://192.168.1.1:8080/*');
    });

    it('handles localhost', () => {
        expect(formatUrlPattern('localhost')).toBe('*://localhost/*');
        expect(formatUrlPattern('localhost:3000')).toBe('*://localhost:3000/*');
    });

    it('handles wildcard subdomains', () => {
        expect(formatUrlPattern('*.example.com')).toBe('*://*.example.com/*');
    });

    it('trims whitespace', () => {
        expect(formatUrlPattern('  example.com  ')).toBe('*://example.com/*');
    });

    it('handles enterprise domain patterns', () => {
        expect(formatUrlPattern('api.openheaders.io')).toBe('*://api.openheaders.io/*');
        expect(formatUrlPattern('*.partner-service.io')).toBe('*://*.partner-service.io/*');
    });

    it('handles bare single-label domains from env vars', () => {
        // Real-world: MC2_DOMAIN_LIST includes "medicenter" and "ifap.vos"
        expect(formatUrlPattern('medicenter')).toBe('*://medicenter/*');
        expect(formatUrlPattern('ifap.vos')).toBe('*://ifap.vos/*');
        expect(formatUrlPattern('development.medicenter.cgm.ag')).toBe('*://development.medicenter.cgm.ag/*');
    });
});
