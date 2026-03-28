import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock header-manager before importing rule-engine
vi.mock('../../src/background/header-manager', () => ({
    updateNetworkRules: vi.fn(),
}));

vi.mock('../../src/background/modules/sources-store', () => ({
    getCurrentSources: vi.fn(() => []),
}));

vi.mock('../../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { updateNetworkRules } from '../../src/background/header-manager';
import { getCurrentSources } from '../../src/background/modules/sources-store';
import {
    scheduleUpdate,
    getLastSourcesHash, setLastSourcesHash,
    getLastSavedDataHash, setLastSavedDataHash, updateSavedDataHash,
    getLastRulesUpdateTime, setLastRulesUpdateTime,
} from '../../src/background/modules/rule-engine';
import type { Source } from '../../src/types/websocket';
import type { SavedDataMap } from '../../src/types/header';

const mockUpdateNetworkRules = updateNetworkRules as ReturnType<typeof vi.fn>;
const mockGetCurrentSources = getCurrentSources as ReturnType<typeof vi.fn>;

function makeSource(overrides: Partial<Source> = {}): Source {
    return {
        sourceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sourceContent: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
        ...overrides,
    };
}

describe('RuleEngine', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        setLastSourcesHash('');
        setLastSavedDataHash('');
        setLastRulesUpdateTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('scheduleUpdate with immediate: true', () => {
        it('calls updateNetworkRules immediately', () => {
            const sources = [makeSource()];
            mockGetCurrentSources.mockReturnValue(sources);

            scheduleUpdate('init', { immediate: true });

            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);
            expect(mockUpdateNetworkRules).toHaveBeenCalledWith(sources);
        });

        it('uses explicit sources when provided', () => {
            const sources = [makeSource({ sourceId: 'explicit-source' })];

            scheduleUpdate('init', { immediate: true, sources });

            expect(mockUpdateNetworkRules).toHaveBeenCalledWith(sources);
        });

        it('updates lastRulesUpdateTime', () => {
            scheduleUpdate('init', { immediate: true });

            expect(getLastRulesUpdateTime()).toBeGreaterThan(0);
        });
    });

    describe('scheduleUpdate with debounce (default)', () => {
        it('does not call updateNetworkRules before debounce period', () => {
            scheduleUpdate('sources');
            expect(mockUpdateNetworkRules).not.toHaveBeenCalled();
        });

        it('calls updateNetworkRules after debounce period', () => {
            scheduleUpdate('sources');
            vi.advanceTimersByTime(150);

            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);
        });

        it('coalesces multiple rapid calls into one', () => {
            scheduleUpdate('sources');
            scheduleUpdate('sources');
            scheduleUpdate('sources');
            scheduleUpdate('sources');
            scheduleUpdate('sources');

            vi.advanceTimersByTime(150);

            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);
        });

        it('resets debounce timer on each call', () => {
            scheduleUpdate('sources');
            vi.advanceTimersByTime(100);

            scheduleUpdate('sources');
            vi.advanceTimersByTime(100);
            expect(mockUpdateNetworkRules).not.toHaveBeenCalled();

            vi.advanceTimersByTime(50);
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);
        });
    });

    describe('hash deduplication', () => {
        it('skips update when source hash is unchanged for non-forced reasons', () => {
            const sources = [makeSource()];
            mockGetCurrentSources.mockReturnValue(sources);

            // First call sets the hash
            scheduleUpdate('sources', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);

            // Second call with same sources — skipped
            scheduleUpdate('sources', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);
        });

        it('does NOT skip for forced reasons even when hash matches', () => {
            const sources = [makeSource()];
            mockGetCurrentSources.mockReturnValue(sources);

            scheduleUpdate('init', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);

            // Forced reasons always execute
            scheduleUpdate('pause', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(2);

            scheduleUpdate('import', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(3);

            scheduleUpdate('rules', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(4);

            scheduleUpdate('init', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(5);
        });

        it('updates when sources actually change', () => {
            mockGetCurrentSources.mockReturnValue([makeSource({ sourceId: 'src-1' })]);
            scheduleUpdate('sources', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(1);

            mockGetCurrentSources.mockReturnValue([makeSource({ sourceId: 'src-2' })]);
            scheduleUpdate('sources', { immediate: true });
            expect(mockUpdateNetworkRules).toHaveBeenCalledTimes(2);
        });
    });

    describe('hash tracking', () => {
        it('tracks source hash after update', () => {
            const sources = [makeSource()];
            mockGetCurrentSources.mockReturnValue(sources);

            scheduleUpdate('init', { immediate: true });

            expect(getLastSourcesHash()).toBeTruthy();
            expect(getLastSourcesHash()).not.toBe('');
        });

        it('setLastSourcesHash / getLastSourcesHash round-trip', () => {
            setLastSourcesHash('abc123');
            expect(getLastSourcesHash()).toBe('abc123');
        });

        it('setLastSavedDataHash / getLastSavedDataHash round-trip', () => {
            setLastSavedDataHash('def456');
            expect(getLastSavedDataHash()).toBe('def456');
        });

        it('updateSavedDataHash computes hash from SavedDataMap', () => {
            const savedData: SavedDataMap = {
                'rule-1': {
                    headerName: 'Authorization',
                    headerValue: 'Bearer token',
                    domains: ['*.openheaders.io'],
                    isDynamic: false,
                },
            };

            updateSavedDataHash(savedData);
            const hash = getLastSavedDataHash();
            expect(hash).toBeTruthy();

            // Same data produces same hash
            updateSavedDataHash(savedData);
            expect(getLastSavedDataHash()).toBe(hash);
        });

        it('setLastRulesUpdateTime / getLastRulesUpdateTime round-trip', () => {
            setLastRulesUpdateTime(1700000000);
            expect(getLastRulesUpdateTime()).toBe(1700000000);
        });
    });
});
