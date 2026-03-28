import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Source } from '../../src/types/websocket';

// ── Mocks ────────────────────────────────────────────────────────────

let storedDynamicSources: Source[] | undefined;
const mockStorageLocalSet = vi.fn((_items: Record<string, unknown>, cb?: () => void) => {
    const items = _items as { dynamicSources?: Source[] };
    if (items.dynamicSources !== undefined) {
        storedDynamicSources = items.dynamicSources;
    }
    if (cb) cb();
});
const mockStorageLocalGet = vi.fn((_keys: string[], cb: (result: Record<string, unknown>) => void) => {
    cb({ dynamicSources: storedDynamicSources });
});

vi.mock('../../src/utils/browser-api', () => ({
    storage: {
        local: {
            get: (...args: unknown[]) => mockStorageLocalGet(...args as [string[], (result: Record<string, unknown>) => void]),
            set: (...args: unknown[]) => mockStorageLocalSet(...args as [Record<string, unknown>, (() => void)?]),
        },
    },
}));

vi.mock('../../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { getCurrentSources, setSourcesFromApp, hydrateFromStorage } from '../../src/background/modules/sources-store';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSource(overrides: Partial<Source> = {}): Source {
    return {
        sourceId: `src-${crypto.randomUUID?.() ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'}`,
        sourceContent: 'Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.sig',
        ...overrides,
    };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('sources-store', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        storedDynamicSources = undefined;
        // Reset in-memory state by writing empty
        setSourcesFromApp([]);
        vi.clearAllMocks(); // clear the set call from the reset above
    });

    describe('getCurrentSources', () => {
        it('returns empty array initially', () => {
            expect(getCurrentSources()).toEqual([]);
        });

        it('returns sources after setSourcesFromApp', () => {
            const sources = [makeSource({ sourceId: 'src-1' }), makeSource({ sourceId: 'src-2' })];
            setSourcesFromApp(sources);

            expect(getCurrentSources()).toBe(sources);
        });
    });

    describe('setSourcesFromApp', () => {
        it('updates in-memory cache', () => {
            const sources = [makeSource({ sourceId: 'src-1', sourceContent: 'token-abc' })];
            setSourcesFromApp(sources);

            expect(getCurrentSources()).toEqual(sources);
            expect(getCurrentSources()[0].sourceContent).toBe('token-abc');
        });

        it('persists to storage.local', () => {
            const sources = [makeSource({ sourceId: 'src-1' })];
            setSourcesFromApp(sources);

            expect(mockStorageLocalSet).toHaveBeenCalledTimes(1);
            expect(mockStorageLocalSet).toHaveBeenCalledWith(
                { dynamicSources: sources },
                expect.any(Function)
            );
        });

        it('overwrites previous sources completely', () => {
            setSourcesFromApp([makeSource({ sourceId: 'src-1' })]);
            setSourcesFromApp([makeSource({ sourceId: 'src-2' }), makeSource({ sourceId: 'src-3' })]);

            expect(getCurrentSources()).toHaveLength(2);
            expect(getCurrentSources()[0].sourceId).toBe('src-2');
        });

        it('can set empty array to clear sources', () => {
            setSourcesFromApp([makeSource()]);
            expect(getCurrentSources()).toHaveLength(1);

            setSourcesFromApp([]);
            expect(getCurrentSources()).toEqual([]);
        });
    });

    describe('hydrateFromStorage', () => {
        it('populates in-memory cache from storage.local', async () => {
            const stored = [makeSource({ sourceId: 'restored-1', sourceContent: 'cached-token' })];
            storedDynamicSources = stored;

            const result = await hydrateFromStorage();

            expect(result).toEqual(stored);
            expect(getCurrentSources()).toEqual(stored);
        });

        it('returns empty array when storage has no sources', async () => {
            storedDynamicSources = undefined;

            const result = await hydrateFromStorage();

            expect(result).toEqual([]);
        });

        it('returns empty array when storage has empty array', async () => {
            storedDynamicSources = [];

            const result = await hydrateFromStorage();

            expect(result).toEqual([]);
        });

        it('does not persist back to storage (read-only on hydrate)', async () => {
            storedDynamicSources = [makeSource({ sourceId: 'restored-1' })];

            await hydrateFromStorage();

            expect(mockStorageLocalSet).not.toHaveBeenCalled();
        });

        it('app write overwrites hydrated data', async () => {
            storedDynamicSources = [makeSource({ sourceId: 'old-cached' })];
            await hydrateFromStorage();
            expect(getCurrentSources()[0].sourceId).toBe('old-cached');

            const fresh = [makeSource({ sourceId: 'fresh-from-app' })];
            setSourcesFromApp(fresh);

            expect(getCurrentSources()).toEqual(fresh);
            expect(getCurrentSources()[0].sourceId).toBe('fresh-from-app');
        });
    });
});
