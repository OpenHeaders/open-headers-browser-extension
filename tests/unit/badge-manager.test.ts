import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateExtensionBadge, resetBadgeState } from '../../src/background/modules/badge-manager';
import type { IRecordingService } from '../../src/types/recording';

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function getActionMock() {
    return chrome.action as unknown as {
        setBadgeText: ReturnType<typeof vi.fn>;
        setBadgeBackgroundColor: ReturnType<typeof vi.fn>;
        setTitle: ReturnType<typeof vi.fn>;
    };
}

function makeActiveRules(count: number): unknown[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `rule-${crypto.randomUUID?.() ?? `a1b2c3d4-e5f6-7890-abcd-ef123456${String(i).padStart(4, '0')}`}`,
        headerName: 'Authorization',
        headerValue: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyQGFjbWUuY29tIn0.sig',
        domains: ['*.openheaders.io'],
    }));
}

function makeRecordingService(overrides: Partial<IRecordingService> = {}): IRecordingService {
    return {
        isRecording: vi.fn().mockReturnValue(false),
        getRecordingState: vi.fn().mockReturnValue({}),
        startRecording: vi.fn().mockResolvedValue({ id: 'rec-001' }),
        stopRecording: vi.fn().mockResolvedValue(null),
        cleanupTab: vi.fn(),
        handleNavigation: vi.fn().mockResolvedValue(undefined),
        addEvent: vi.fn(),
        handleContentScriptReady: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    } as IRecordingService;
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe('updateExtensionBadge', () => {
    beforeEach(() => {
        resetBadgeState();
        vi.clearAllMocks();
        // Ensure tabs.query returns empty array by default (no recording tabs)
        (chrome.tabs.query as ReturnType<typeof vi.fn>).mockImplementation(
            (_q: chrome.tabs.QueryInfo, cb: (tabs: chrome.tabs.Tab[]) => void) => cb([])
        );
    });

    // ── Priority: disconnected > paused > active > none ──

    describe('badge state priority', () => {
        it('shows disconnected badge when not connected (above threshold), even when paused with active rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(false, makeActiveRules(5), true, null, 10);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' }, expect.any(Function));
            expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith(
                { color: '#ffcd04' },
                expect.any(Function)
            );
            expect(action.setTitle).toHaveBeenCalledWith({
                title: 'Open Headers - Disconnected\nUsing cached data',
            });
        });

        it('shows disconnected badge when not connected (above threshold), not paused', async () => {
            const action = getActionMock();
            await updateExtensionBadge(false, makeActiveRules(3), false, null, 3);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' }, expect.any(Function));
            expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith(
                { color: '#ffcd04' },
                expect.any(Function)
            );
            expect(action.setTitle).toHaveBeenCalledWith({
                title: 'Open Headers - Disconnected\nUsing cached data',
            });
        });

        it('shows paused badge when paused and connected', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(5), true, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '\u2212' }, expect.any(Function));
            expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith(
                { color: '#8c8c8c' },
                expect.any(Function)
            );
            expect(action.setTitle).toHaveBeenCalledWith({
                title: 'Open Headers - Paused\nRules execution is paused',
            });
        });

        it('shows active badge when connected, not paused, has rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(7), false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '7' }, expect.any(Function));
            expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith(
                { color: '#E8E8E8' },
                expect.any(Function)
            );
            expect(action.setTitle).toHaveBeenCalledWith({
                title: 'Open Headers - Active\n7 rules active for this site',
            });
        });

        it('clears badge when connected, not paused, no rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, [], false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
            expect(action.setTitle).toHaveBeenCalledWith({ title: 'Open Headers' });
        });
    });

    // ── Active rules count display ──

    describe('active rules count display', () => {
        it('shows "1" for a single active rule with singular "rule" in tooltip', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(1), false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '1' }, expect.any(Function));
            expect(action.setTitle).toHaveBeenCalledWith({
                title: 'Open Headers - Active\n1 rule active for this site',
            });
        });

        it('shows "50" for 50 rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(50), false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '50' }, expect.any(Function));
        });

        it('shows "99" for 99 rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(99), false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '99' }, expect.any(Function));
        });

        it('shows "99+" for 100 or more rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(100), false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '99+' }, expect.any(Function));
        });

        it('shows "99+" for 250 rules', async () => {
            const action = getActionMock();
            await updateExtensionBadge(true, makeActiveRules(250), false, null, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '99+' }, expect.any(Function));
        });
    });

    // ── Disconnected badge threshold ──

    describe('disconnected badge threshold', () => {
        it('does NOT show disconnected badge when reconnectAttempts < 3', async () => {
            const action = getActionMock();
            // With 2 reconnect attempts and no active rules → should be "none" state
            await updateExtensionBadge(false, [], false, null, 2);

            // Should clear badge (none state), not show disconnected
            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '' });
        });

        it('shows disconnected badge when reconnectAttempts === 3', async () => {
            const action = getActionMock();
            await updateExtensionBadge(false, [], false, null, 3);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' }, expect.any(Function));
            expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith(
                { color: '#ffcd04' },
                expect.any(Function)
            );
        });

        it('shows disconnected badge when reconnectAttempts > 3', async () => {
            const action = getActionMock();
            await updateExtensionBadge(false, [], false, null, 10);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '!' }, expect.any(Function));
            expect(action.setBadgeBackgroundColor).toHaveBeenCalledWith(
                { color: '#ffcd04' },
                expect.any(Function)
            );
        });
    });

    // ── Recording active skips badge update ──

    describe('recording active skips badge update', () => {
        it('skips badge update when a tab is recording', async () => {
            const action = getActionMock();
            const recordingService = makeRecordingService({
                isRecording: vi.fn().mockReturnValue(true),
            });

            (chrome.tabs.query as ReturnType<typeof vi.fn>).mockImplementation(
                (_q: chrome.tabs.QueryInfo, cb: (tabs: chrome.tabs.Tab[]) => void) =>
                    cb([{ id: 42, index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 } as chrome.tabs.Tab])
            );

            await updateExtensionBadge(true, makeActiveRules(5), false, recordingService, 0);

            expect(action.setBadgeText).not.toHaveBeenCalled();
            expect(action.setBadgeBackgroundColor).not.toHaveBeenCalled();
            expect(action.setTitle).not.toHaveBeenCalled();
        });

        it('does not skip badge update when recording service exists but no tab is recording', async () => {
            const action = getActionMock();
            const recordingService = makeRecordingService({
                isRecording: vi.fn().mockReturnValue(false),
            });

            (chrome.tabs.query as ReturnType<typeof vi.fn>).mockImplementation(
                (_q: chrome.tabs.QueryInfo, cb: (tabs: chrome.tabs.Tab[]) => void) =>
                    cb([{ id: 42, index: 0, pinned: false, highlighted: false, windowId: 1, active: true, incognito: false, selected: false, discarded: false, autoDiscardable: true, groupId: -1 } as chrome.tabs.Tab])
            );

            await updateExtensionBadge(true, makeActiveRules(3), false, recordingService, 0);

            expect(action.setBadgeText).toHaveBeenCalledWith({ text: '3' }, expect.any(Function));
        });
    });

    // ── State deduplication ──

    describe('state deduplication', () => {
        it('does not re-update badge when called twice with same state', async () => {
            const action = getActionMock();

            await updateExtensionBadge(true, makeActiveRules(5), false, null, 0);
            expect(action.setBadgeText).toHaveBeenCalledTimes(1);

            await updateExtensionBadge(true, makeActiveRules(5), false, null, 0);
            // Should NOT be called again — same state key
            expect(action.setBadgeText).toHaveBeenCalledTimes(1);
        });

        it('updates badge when state changes between calls', async () => {
            const action = getActionMock();

            await updateExtensionBadge(true, makeActiveRules(5), false, null, 0);
            expect(action.setBadgeText).toHaveBeenCalledTimes(1);

            await updateExtensionBadge(true, makeActiveRules(10), false, null, 0);
            expect(action.setBadgeText).toHaveBeenCalledTimes(2);
        });
    });

    // ── resetBadgeState ──

    describe('resetBadgeState', () => {
        it('allows badge to be updated again after reset', async () => {
            const action = getActionMock();

            await updateExtensionBadge(true, makeActiveRules(5), false, null, 0);
            expect(action.setBadgeText).toHaveBeenCalledTimes(1);

            // Same state — deduplicated
            await updateExtensionBadge(true, makeActiveRules(5), false, null, 0);
            expect(action.setBadgeText).toHaveBeenCalledTimes(1);

            // Reset cached state
            resetBadgeState();

            // Now the same state should trigger an update
            await updateExtensionBadge(true, makeActiveRules(5), false, null, 0);
            expect(action.setBadgeText).toHaveBeenCalledTimes(2);
        });
    });
});
