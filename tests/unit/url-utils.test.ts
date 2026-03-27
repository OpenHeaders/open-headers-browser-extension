import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeUrlForTracking, isTrackableUrl, doesUrlMatchPattern, clearPatternCache, precompilePattern, precompileAllPatterns } from '../../src/background/modules/url-utils';

// ---------------------------------------------------------------------------
//  normalizeUrlForTracking
// ---------------------------------------------------------------------------

// Clear pattern cache between test suites to avoid cross-test leakage
beforeEach(() => {
    clearPatternCache();
});

describe('normalizeUrlForTracking', () => {
    it('removes fragment from enterprise URL', () => {
        const result = normalizeUrlForTracking('https://api.openheaders.io/v2/config#section-auth');
        expect(result).toBe('https://api.openheaders.io/v2/config');
    });

    it('lowercases hostname but preserves path case', () => {
        const result = normalizeUrlForTracking('https://API.OpenHeaders.IO/V2/Config');
        expect(result).toBe('https://api.openheaders.io/V2/Config');
    });

    it('removes default port 443 for https', () => {
        const result = normalizeUrlForTracking('https://api.openheaders.io:443/v2/sources');
        expect(result).toBe('https://api.openheaders.io/v2/sources');
    });

    it('removes default port 80 for http', () => {
        const result = normalizeUrlForTracking('http://api.openheaders.io:80/v2/sources');
        expect(result).toBe('http://api.openheaders.io/v2/sources');
    });

    it('preserves non-default port', () => {
        const result = normalizeUrlForTracking('https://api.openheaders.io:8443/v2/sources');
        expect(result).toBe('https://api.openheaders.io:8443/v2/sources');
    });

    it('attempts to remove trailing slash on root pathname (URL spec preserves it)', () => {
        // Per URL spec, setting pathname to '' on an origin-only URL results in '/'
        // The code attempts to strip it, but URL.toString() always includes the trailing slash
        const result = normalizeUrlForTracking('https://api.openheaders.io/');
        expect(result).toBe('https://api.openheaders.io/');
    });

    it('preserves non-root paths', () => {
        const result = normalizeUrlForTracking('https://api.openheaders.io/v2/');
        expect(result).toBe('https://api.openheaders.io/v2/');
    });

    it('handles IDN / punycode hostname', () => {
        const result = normalizeUrlForTracking('https://xn--bcher-kva.example.com/catalog');
        expect(result).toBe('https://xn--bcher-kva.example.com/catalog');
    });

    it('handles URL with port, fragment, and query together', () => {
        const result = normalizeUrlForTracking(
            'https://api.partner-service.io:9200/search?q=headers#results'
        );
        expect(result).toBe('https://api.partner-service.io:9200/search?q=headers');
    });

    it('returns lowercased original string for invalid URL', () => {
        const result = normalizeUrlForTracking('not a valid url at all');
        expect(result).toBe('not a valid url at all');
    });

    it('handles localhost with port', () => {
        const result = normalizeUrlForTracking('http://localhost:3000/api/v1');
        expect(result).toBe('http://localhost:3000/api/v1');
    });

    it('preserves trailing slash for origin-only URLs (URL spec behavior)', () => {
        // URL constructor always adds trailing slash for origin-only URLs
        // Even though the code sets pathname to '', the URL spec forces '/'
        const result = normalizeUrlForTracking('https://dashboard.openheaders.io');
        expect(result).toBe('https://dashboard.openheaders.io/');
    });
});

// ---------------------------------------------------------------------------
//  isTrackableUrl
// ---------------------------------------------------------------------------

describe('isTrackableUrl', () => {
    it('returns true for standard https enterprise URL', () => {
        expect(isTrackableUrl('https://api.openheaders.io/v2/config')).toBe(true);
    });

    it('returns true for standard http URL', () => {
        expect(isTrackableUrl('http://staging.partner-service.io:8080/health')).toBe(true);
    });

    it('returns false for empty string', () => {
        expect(isTrackableUrl('')).toBe(false);
    });

    it('returns false for null-ish values coerced to string param', () => {
        // The function signature takes string, but runtime may receive falsy values
        expect(isTrackableUrl(null as unknown as string)).toBe(false);
        expect(isTrackableUrl(undefined as unknown as string)).toBe(false);
    });

    const nonTrackableSchemes = [
        'chrome://settings',
        'chrome-extension://abcdefg/popup.html',
        'about:blank',
        'about:config',
        'data:text/html,<h1>Hi</h1>',
        'blob:https://example.com/uuid-here',
        'javascript:void(0)',
        'view-source:https://example.com',
        'edge://settings',
        'opera://settings',
        'vivaldi://settings',
        'brave://settings',
        'moz-extension://uuid/popup.html',
        'extension://abcdefg/popup.html',
        'ws://realtime.openheaders.io/ws',
        'wss://realtime.openheaders.io/ws',
        'ftp://files.openheaders.io/downloads',
        'sftp://files.openheaders.io/downloads',
        'chrome-devtools://devtools/bundled/inspector.html',
        'devtools://devtools/bundled/inspector.html',
    ];

    it.each(nonTrackableSchemes)('returns false for non-trackable scheme: %s', (url) => {
        expect(isTrackableUrl(url)).toBe(false);
    });

    it('is case-insensitive for scheme detection', () => {
        expect(isTrackableUrl('CHROME://settings')).toBe(false);
        expect(isTrackableUrl('About:Blank')).toBe(false);
        expect(isTrackableUrl('DATA:text/html,test')).toBe(false);
    });

    it('returns true for file:// URLs (tracked with limited matching)', () => {
        expect(isTrackableUrl('file:///Users/dev/project/index.html')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
//  doesUrlMatchPattern
// ---------------------------------------------------------------------------

describe('doesUrlMatchPattern', () => {
    it('wildcard * matches any URL', () => {
        expect(doesUrlMatchPattern('https://api.openheaders.io/v2/config', '*')).toBe(true);
        expect(doesUrlMatchPattern('http://localhost:3000/test', '*')).toBe(true);
    });

    it('matches wildcard subdomain pattern *.openheaders.io', () => {
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', '*.openheaders.io')
        ).toBe(true);
        expect(
            doesUrlMatchPattern('https://dashboard.openheaders.io/settings', '*.openheaders.io')
        ).toBe(true);
    });

    it('does not match bare domain against wildcard subdomain pattern', () => {
        // *.openheaders.io should NOT match openheaders.io (no subdomain)
        expect(
            doesUrlMatchPattern('https://openheaders.io/', '*.openheaders.io')
        ).toBe(false);
    });

    it('matches exact domain pattern', () => {
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'api.openheaders.io')
        ).toBe(true);
    });

    it('does not match different domain', () => {
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'dashboard.openheaders.io')
        ).toBe(false);
    });

    it('matches localhost with port', () => {
        expect(doesUrlMatchPattern('http://localhost:3000/api/test', 'localhost:3000')).toBe(true);
    });

    it('does not match localhost on different port', () => {
        expect(doesUrlMatchPattern('http://localhost:3000/api/test', 'localhost:4000')).toBe(false);
    });

    it('bare localhost pattern does not match localhost with port', () => {
        // "localhost" compiles to *://localhost/* which should NOT match localhost:3000
        // because :3000 sits between the hostname and the / path separator
        expect(doesUrlMatchPattern('http://localhost:3000/api/test', 'localhost')).toBe(false);
    });

    it('bare localhost pattern matches localhost without port', () => {
        expect(doesUrlMatchPattern('http://localhost/api/test', 'localhost')).toBe(true);
    });

    it('bare domain does not match same domain on non-default port', () => {
        // "medicenter" should NOT match "http://medicenter:8080/api"
        expect(doesUrlMatchPattern('http://medicenter:8080/api', 'medicenter')).toBe(false);
    });

    it('matches IPv4 address pattern', () => {
        expect(doesUrlMatchPattern('http://192.168.1.100:8080/api', '192.168.1.100:8080')).toBe(true);
    });

    it('does not match different IPv4', () => {
        expect(doesUrlMatchPattern('http://192.168.1.100:8080/api', '10.0.0.1:8080')).toBe(false);
    });

    it('matches IPv6 address pattern in brackets', () => {
        expect(
            doesUrlMatchPattern('http://[::1]:3000/api', '[::1]:3000')
        ).toBe(true);
    });

    it('normalizes default port 443 in pattern', () => {
        // Pattern with :443 should match URL without explicit port (https default)
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'api.openheaders.io:443')
        ).toBe(true);
    });

    it('normalizes default port 80 in pattern', () => {
        expect(
            doesUrlMatchPattern('http://api.openheaders.io/v2/config', 'api.openheaders.io:80')
        ).toBe(true);
    });

    it('matches pattern with explicit path', () => {
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'api.openheaders.io/v2/*')
        ).toBe(true);
    });

    it('does not match pattern with non-matching path', () => {
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v3/config', 'api.openheaders.io/v2/*')
        ).toBe(false);
    });

    it('is case-insensitive for domain matching', () => {
        expect(
            doesUrlMatchPattern('https://API.OpenHeaders.IO/v2/config', 'api.openheaders.io')
        ).toBe(true);
    });

    it('handles pattern with protocol prefix', () => {
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'https://api.openheaders.io/*')
        ).toBe(true);
    });

    it('returns false for completely invalid input without crashing', () => {
        expect(doesUrlMatchPattern('', 'api.openheaders.io')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
//  Pattern cache
// ---------------------------------------------------------------------------

describe('pattern cache', () => {
    it('precompilePattern makes subsequent matches work', () => {
        precompilePattern('api.openheaders.io');
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'api.openheaders.io')
        ).toBe(true);
    });

    it('precompileAllPatterns compiles multiple patterns', () => {
        precompileAllPatterns(['api.openheaders.io', '*.partner-service.io', 'localhost:3000']);
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'api.openheaders.io')
        ).toBe(true);
        expect(
            doesUrlMatchPattern('https://staging.partner-service.io/health', '*.partner-service.io')
        ).toBe(true);
        expect(
            doesUrlMatchPattern('http://localhost:3000/api', 'localhost:3000')
        ).toBe(true);
    });

    it('clearPatternCache forces recompilation', () => {
        precompilePattern('api.openheaders.io');
        clearPatternCache();
        // Should still work — doesUrlMatchPattern lazily recompiles
        expect(
            doesUrlMatchPattern('https://api.openheaders.io/v2/config', 'api.openheaders.io')
        ).toBe(true);
    });

    it('doesUrlMatchPattern works without pre-compilation (lazy compile)', () => {
        // No precompilePattern call — pattern should be compiled on first use
        expect(
            doesUrlMatchPattern('https://example.com/page', 'example.com')
        ).toBe(true);
    });
});
