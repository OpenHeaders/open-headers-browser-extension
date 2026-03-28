import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '../../src/types/websocket';
import type { SavedDataMap } from '../../src/types/header';

// ── Mocks ────────────────────────────────────────────────────────────

let mockSavedData: SavedDataMap = {};

vi.mock('../../src/utils/storage-chunking', () => ({
    getChunkedData: vi.fn((_key: string, cb: (data: SavedDataMap | null) => void) => {
        cb(mockSavedData);
    }),
    setChunkedData: vi.fn(),
}));

vi.mock('../../src/utils/browser-api', () => ({
    declarativeNetRequest: {
        getDynamicRules: vi.fn(() => Promise.resolve([])),
        updateDynamicRules: vi.fn(() => Promise.resolve()),
    },
    storage: { sync: { get: vi.fn((_k: string[], cb: (r: Record<string, unknown>) => void) => cb({})) } },
}));

vi.mock('../../src/utils/messaging', () => ({
    sendMessageWithCallback: vi.fn(),
}));

vi.mock('../../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { updateNetworkRules, setRulesPaused, formatUrlPattern } from '../../src/background/header-manager';
import { declarativeNetRequest } from '../../src/utils/browser-api';

const mockGetDynamicRules = declarativeNetRequest!.getDynamicRules as ReturnType<typeof vi.fn>;
const mockUpdateDynamicRules = declarativeNetRequest!.updateDynamicRules as ReturnType<typeof vi.fn>;

/** Flush the getDynamicRules().then(...) promise chain */
const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

// ── Helpers ──────────────────────────────────────────────────────────

function makeSource(overrides: Partial<Source> = {}): Source {
    return {
        sourceId: `src-${crypto.randomUUID?.() ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'}`,
        sourceContent: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig',
        ...overrides,
    };
}

function makeSavedEntry(overrides: Partial<SavedDataMap[string]> = {}): SavedDataMap[string] {
    return {
        headerName: 'Authorization',
        headerValue: '',
        domains: ['*.openheaders.io'],
        isDynamic: true,
        sourceId: 'src-1',
        isEnabled: true,
        ...overrides,
    };
}

function getRulesFromLastCall(): unknown[] {
    const lastCall = mockUpdateDynamicRules.mock.calls.at(-1);
    return lastCall?.[0]?.addRules ?? [];
}

// ── Tests ────────────────────────────────────────────────────────────

describe('header-manager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSavedData = {};
        setRulesPaused(false);
        mockGetDynamicRules.mockResolvedValue([]);
        mockUpdateDynamicRules.mockResolvedValue(undefined);
    });

    // ── Dynamic headers with cached sources (no connection gate) ──

    describe('dynamic headers inject from available sources regardless of connection', () => {
        it('injects dynamic header when source has content (simulates cached/offline start)', async () => {
            const source = makeSource({ sourceId: 'src-1', sourceContent: 'token-abc-123' });
            mockSavedData = {
                'rule-1': makeSavedEntry({ headerName: 'Authorization', sourceId: 'src-1', prefix: 'Bearer ' }),
            };

            updateNetworkRules([source]);
            await flushPromises();

            expect(mockUpdateDynamicRules).toHaveBeenCalledTimes(1);
            const rules = getRulesFromLastCall();
            expect(rules.length).toBeGreaterThan(0);
            const rule = rules[0] as { action: { requestHeaders: { value: string }[] } };
            expect(rule.action.requestHeaders[0].value).toBe('Bearer token-abc-123');
        });

        it('injects dynamic header with empty sources array when source was restored from storage', async () => {
            // No sources passed — simulates init before WebSocket connects
            mockSavedData = {
                'rule-1': makeSavedEntry({ headerName: 'Authorization', sourceId: 'src-1' }),
            };

            updateNetworkRules([]);
            await flushPromises();

            expect(mockUpdateDynamicRules).toHaveBeenCalledTimes(1);
            // No matching source → source_not_found, no rules produced
            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });

        it('produces source_not_found when source is missing', () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({ headerName: 'Authorization', sourceId: 'src-missing' }),
            };

            updateNetworkRules([makeSource({ sourceId: 'src-other' })]);

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });
    });

    // ── Dynamic header resolution ──

    describe('dynamic header resolution', () => {
        it('resolves dynamic header with prefix and suffix', async () => {
            const source = makeSource({ sourceId: 'src-1', sourceContent: 'my-token' });
            mockSavedData = {
                'rule-1': makeSavedEntry({ sourceId: 'src-1', prefix: 'Bearer ', suffix: ' ;extra' }),
            };

            updateNetworkRules([source]);
            await flushPromises();

            const rules = getRulesFromLastCall();
            expect(rules.length).toBeGreaterThan(0);
            const rule = rules[0] as { action: { requestHeaders: { value: string }[] } };
            expect(rule.action.requestHeaders[0].value).toBe('Bearer my-token ;extra');
        });

        it('returns empty_source placeholder when source exists but has no content', () => {
            const source = makeSource({ sourceId: 'src-1', sourceContent: '' });
            mockSavedData = {
                'rule-1': makeSavedEntry({ sourceId: 'src-1' }),
            };

            updateNetworkRules([source]);

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });

        it('returns source_not_found placeholder when source does not exist', () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({ sourceId: 'src-nonexistent' }),
            };

            updateNetworkRules([makeSource({ sourceId: 'src-other' })]);

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });

        it('matches source by string-coerced sourceId', async () => {
            const source = makeSource({ sourceId: '42', sourceContent: 'val' });
            mockSavedData = {
                'rule-1': makeSavedEntry({ sourceId: 42 as unknown as string }),
            };

            updateNetworkRules([source]);
            await flushPromises();

            const rules = getRulesFromLastCall();
            expect(rules.length).toBeGreaterThan(0);
        });
    });

    // ── Static headers ──

    describe('static header resolution', () => {
        it('injects static header with literal value', async () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({
                    isDynamic: false,
                    sourceId: undefined,
                    headerName: 'X-Custom',
                    headerValue: 'static-value',
                    domains: ['example.com'],
                }),
            };

            updateNetworkRules([]);
            await flushPromises();

            const rules = getRulesFromLastCall();
            expect(rules.length).toBeGreaterThan(0);
            const rule = rules[0] as { action: { requestHeaders: { header: string; value: string }[] } };
            expect(rule.action.requestHeaders[0].header).toBe('X-Custom');
            expect(rule.action.requestHeaders[0].value).toBe('static-value');
        });

        it('returns empty_value placeholder for static header with empty value', () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({
                    isDynamic: false,
                    sourceId: undefined,
                    headerName: 'X-Custom',
                    headerValue: '   ',
                    domains: ['example.com'],
                }),
            };

            updateNetworkRules([]);

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });
    });

    // ── Disabled rules ──

    describe('disabled rules', () => {
        it('skips disabled rules entirely', () => {
            const source = makeSource({ sourceId: 'src-1', sourceContent: 'token' });
            mockSavedData = {
                'rule-1': makeSavedEntry({ isEnabled: false }),
            };

            updateNetworkRules([source]);

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });
    });

    // ── Paused state ──

    describe('paused state', () => {
        it('clears all rules when paused', async () => {
            setRulesPaused(true);

            updateNetworkRules([makeSource()]);
            await flushPromises();

            expect(mockUpdateDynamicRules).toHaveBeenCalledWith(
                expect.objectContaining({ addRules: [] })
            );
        });
    });

    // ── Response headers ──

    describe('response headers', () => {
        it('creates response header rules with higher priority', async () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({
                    isDynamic: false,
                    sourceId: undefined,
                    headerName: 'X-Frame-Options',
                    headerValue: 'DENY',
                    isResponse: true,
                    domains: ['example.com'],
                }),
            };

            updateNetworkRules([]);
            await flushPromises();

            const rules = getRulesFromLastCall();
            expect(rules.length).toBeGreaterThan(0);
            const rule = rules[0] as { priority: number; action: { responseHeaders: { header: string }[] } };
            expect(rule.priority).toBe(1000);
            expect(rule.action.responseHeaders[0].header).toBe('X-Frame-Options');
        });
    });

    // ── Multiple domains ──

    describe('multiple domains', () => {
        it('creates one rule per domain', async () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({
                    isDynamic: false,
                    sourceId: undefined,
                    headerName: 'X-Test',
                    headerValue: 'value',
                    domains: ['example.com', 'other.com', 'third.com'],
                }),
            };

            updateNetworkRules([]);
            await flushPromises();

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(3);
        });

        it('skips empty domain strings', async () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({
                    isDynamic: false,
                    sourceId: undefined,
                    headerName: 'X-Test',
                    headerValue: 'value',
                    domains: ['example.com', '', '  '],
                }),
            };

            updateNetworkRules([]);
            await flushPromises();

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(1);
        });
    });

    // ── No domains ──

    describe('no domains', () => {
        it('skips entry with empty domains array', () => {
            mockSavedData = {
                'rule-1': makeSavedEntry({
                    isDynamic: false,
                    sourceId: undefined,
                    headerName: 'X-Test',
                    headerValue: 'value',
                    domains: [],
                }),
            };

            updateNetworkRules([]);

            const rules = getRulesFromLastCall();
            expect(rules).toHaveLength(0);
        });
    });

    // ── formatUrlPattern ──

    describe('formatUrlPattern', () => {
        it('wraps plain domain with protocol wildcard and path', () => {
            expect(formatUrlPattern('example.com')).toBe('*://example.com/*');
        });

        it('preserves explicit protocol', () => {
            expect(formatUrlPattern('https://example.com')).toBe('https://example.com/*');
        });

        it('preserves explicit protocol with path', () => {
            expect(formatUrlPattern('https://example.com/api')).toBe('https://example.com/api');
        });

        it('handles wildcard subdomain', () => {
            expect(formatUrlPattern('*.example.com')).toBe('*://*.example.com/*');
        });

        it('handles IP address', () => {
            expect(formatUrlPattern('192.168.1.1')).toBe('*://192.168.1.1/*');
        });

        it('handles IP address with port', () => {
            expect(formatUrlPattern('192.168.1.1:8080')).toBe('*://192.168.1.1:8080/*');
        });

        it('handles localhost', () => {
            expect(formatUrlPattern('localhost')).toBe('*://localhost/*');
        });

        it('handles localhost with port', () => {
            expect(formatUrlPattern('localhost:3000')).toBe('*://localhost:3000/*');
        });
    });
});
