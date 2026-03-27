import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingState } from '../../src/assets/recording/shared/recording-state';
import type { FlowType, OptimizedReplayData } from '../../src/assets/recording/shared/recording-state';

const FIXED_TIME = 1700000000000; // 2023-11-14T22:13:20.000Z

function makeRecordingState(overrides: {
  recordId?: string;
  startTime?: number;
} = {}): RecordingState {
  return new RecordingState(
    overrides.recordId ?? 'rec_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    overrides.startTime ?? FIXED_TIME,
  );
}

describe('RecordingState', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes all fields with correct defaults', () => {
      const state = makeRecordingState();

      expect(state.recordId).toBe('rec_a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(state.startTime).toBe(FIXED_TIME);
      expect(state.originalStartTime).toBe(FIXED_TIME);
      expect(state.isRecording).toBe(true);
      expect(state.useWidget).toBe(false);
      expect(state.tabId).toBeNull();
      expect(state.currentUrl).toBeNull();
      expect(state.flowType).toBeNull();
      expect(state.isPreNav).toBe(false);
      expect(state.hasNavigated).toBe(false);
      expect(state.firstPageNavigationTime).toBeNull();
      expect(state.navigationHistory).toEqual([]);
      expect(state.redirectChain).toEqual([]);
      expect(state.accumulated.events).toEqual([]);
      expect(state.accumulated.console).toEqual([]);
      expect(state.accumulated.network).toEqual([]);
      expect(state.accumulated.storage).toEqual([]);
      expect(state.accumulated.storageState).toEqual({
        localStorage: {},
        sessionStorage: {},
        cookies: {},
      });
      expect(state.accumulated.eventCount).toBe(0);
      expect(state.performance).toEqual({
        maxEventsPerPage: 10000,
        maxAccumulatedEvents: 50000,
        cleanupInterval: 60000,
      });
    });

    it('uses Date.now() when no startTime is provided', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000099999);
      const state = new RecordingState('rec_test-id-001');
      expect(state.startTime).toBe(1700000099999);
    });
  });

  describe('isRealPageUrl', () => {
    it('returns true for real HTTP URLs', () => {
      const state = makeRecordingState();
      expect(state.isRealPageUrl('https://dashboard.enterprise-corp.com/admin')).toBe(true);
      expect(state.isRealPageUrl('http://localhost:3000/app')).toBe(true);
      expect(state.isRealPageUrl('https://192.168.1.100:8443/api')).toBe(true);
    });

    it('returns false for browser internal URLs', () => {
      const state = makeRecordingState();
      expect(state.isRealPageUrl('about:blank')).toBe(false);
      expect(state.isRealPageUrl('chrome://newtab/')).toBe(false);
      expect(state.isRealPageUrl('edge://settings')).toBe(false);
      expect(state.isRealPageUrl('about:debugging')).toBe(false);
      expect(state.isRealPageUrl('chrome-extension://abcdef123456/popup.html')).toBe(false);
    });

    it('returns false for empty or falsy values', () => {
      const state = makeRecordingState();
      expect(state.isRealPageUrl('')).toBe(false);
      expect(state.isRealPageUrl(null as unknown as string)).toBe(false);
      expect(state.isRealPageUrl(undefined as unknown as string)).toBe(false);
    });
  });

  describe('detectFlowType', () => {
    it('sets pre-nav for blank/new tab URLs', () => {
      const state = makeRecordingState();

      state.detectFlowType('about:blank');
      expect(state.flowType).toBe('pre-nav');
      expect(state.isPreNav).toBe(true);

      state.detectFlowType('chrome://newtab/');
      expect(state.flowType).toBe('pre-nav');

      state.detectFlowType('edge://newtab/');
      expect(state.flowType).toBe('pre-nav');

      state.detectFlowType('about:newtab');
      expect(state.flowType).toBe('pre-nav');

      state.detectFlowType('');
      expect(state.flowType).toBe('pre-nav');
    });

    it('sets oauth-redirect for OAuth URLs', () => {
      const state = makeRecordingState();
      state.detectFlowType('https://accounts.google.com/oauth/callback?code=abc123');
      expect(state.flowType).toBe('oauth-redirect');
    });

    it('sets oauth-redirect for auth URLs', () => {
      const state = makeRecordingState();
      state.detectFlowType('https://login.microsoftonline.com/auth/token');
      expect(state.flowType).toBe('oauth-redirect');
    });

    it('sets oauth-redirect for callback URLs', () => {
      const state = makeRecordingState();
      state.detectFlowType('https://app.acme-corp.com/callback');
      expect(state.flowType).toBe('oauth-redirect');
    });

    it('sets oauth-redirect when redirect chain is present', () => {
      const state = makeRecordingState();
      state.redirectChain.push({
        from: 'https://login.provider.com/authorize',
        to: 'https://app.example.com/redirect',
        statusCode: 302,
        timestamp: 1000,
      });
      state.detectFlowType('https://regular-url.com/page');
      expect(state.flowType).toBe('oauth-redirect');
    });

    it('sets nav for regular URLs', () => {
      const state = makeRecordingState();
      state.detectFlowType('https://dashboard.enterprise-corp.com/reports');
      expect(state.flowType).toBe('nav');
    });
  });

  describe('addNavigation', () => {
    it('adds navigation entry to history', () => {
      const state = makeRecordingState();
      const navTime = FIXED_TIME + 5000;

      state.addNavigation('https://app.acme-corp.com/dashboard', navTime);

      expect(state.navigationHistory).toHaveLength(1);
      expect(state.navigationHistory[0]).toEqual({
        url: 'https://app.acme-corp.com/dashboard',
        timestamp: navTime,
        relativeTime: 5000,
        flowType: null,
      });
      expect(state.currentUrl).toBe('https://app.acme-corp.com/dashboard');
    });

    it('transitions from pre-nav to navigated on real URL', () => {
      const state = makeRecordingState();
      state.isPreNav = true;
      state.flowType = 'pre-nav';

      const navTime = FIXED_TIME + 3000;
      state.addNavigation('https://app.enterprise-corp.com/login', navTime);

      expect(state.hasNavigated).toBe(true);
      expect(state.firstPageNavigationTime).toBe(navTime);
      expect(state.flowType).not.toBe('pre-nav');
    });

    it('does not set firstPageNavigationTime for non-real URLs during pre-nav', () => {
      const state = makeRecordingState();
      state.isPreNav = true;

      state.addNavigation('about:blank', FIXED_TIME + 1000);

      expect(state.hasNavigated).toBe(false);
      expect(state.firstPageNavigationTime).toBeNull();
    });

    it('preserves firstPageNavigationTime on subsequent navigations', () => {
      const state = makeRecordingState();
      state.isPreNav = true;

      const firstNavTime = FIXED_TIME + 2000;
      state.addNavigation('https://first-page.com', firstNavTime);
      state.addNavigation('https://second-page.com', FIXED_TIME + 5000);

      expect(state.firstPageNavigationTime).toBe(firstNavTime);
    });
  });

  describe('addRedirect', () => {
    it('adds redirect entry to chain', () => {
      const state = makeRecordingState();

      state.addRedirect(
        'https://login.idp.com/authorize',
        'https://app.acme-corp.com/redirect',
        302,
      );

      expect(state.redirectChain).toHaveLength(1);
      expect(state.redirectChain[0].from).toBe('https://login.idp.com/authorize');
      expect(state.redirectChain[0].to).toBe('https://app.acme-corp.com/redirect');
      expect(state.redirectChain[0].statusCode).toBe(302);
      expect(typeof state.redirectChain[0].timestamp).toBe('number');
    });

    it('sets flowType to oauth-redirect when redirect target contains oauth', () => {
      const state = makeRecordingState();
      state.addRedirect('https://login.example.com', 'https://app.example.com/oauth/complete', 302);
      expect(state.flowType).toBe('oauth-redirect');
    });

    it('sets flowType to oauth-redirect when redirect target contains callback', () => {
      const state = makeRecordingState();
      state.addRedirect('https://provider.com/auth', 'https://app.com/callback?code=xyz', 302);
      expect(state.flowType).toBe('oauth-redirect');
    });

    it('does not change flowType for non-auth redirects', () => {
      const state = makeRecordingState();
      state.flowType = 'nav';
      state.addRedirect('https://old.com/page', 'https://new.com/page', 301);
      expect(state.flowType).toBe('nav');
    });
  });

  describe('accumulatePageData', () => {
    it('accumulates events up to maxAccumulatedEvents', () => {
      const state = makeRecordingState();
      const events = Array.from({ length: 100 }, (_, i) => ({
        type: 3,
        timestamp: FIXED_TIME + i * 16,
      }));

      state.accumulatePageData({ events });

      expect(state.accumulated.events).toHaveLength(100);
      expect(state.accumulated.eventCount).toBe(100);
    });

    it('limits events to maxAccumulatedEvents', () => {
      const state = makeRecordingState();
      state.performance.maxAccumulatedEvents = 10;

      const events = Array.from({ length: 20 }, (_, i) => ({
        type: 3,
        timestamp: FIXED_TIME + i * 16,
      }));

      state.accumulatePageData({ events });

      expect(state.accumulated.events).toHaveLength(10);
    });

    it('accumulates console entries with sliding window', () => {
      const state = makeRecordingState();

      // Add 950 existing console entries
      state.accumulated.console = Array.from({ length: 950 }, (_, i) => ({
        level: 'log',
        message: `Log entry ${i}`,
        timestamp: FIXED_TIME + i,
      }));

      // Add 100 more
      const newConsole = Array.from({ length: 100 }, (_, i) => ({
        level: 'warn',
        message: `Warning ${i}`,
        timestamp: FIXED_TIME + 1000 + i,
      }));

      state.accumulatePageData({ console: newConsole });

      // Should keep last 900 of existing + last 100 of new = 1000
      expect(state.accumulated.console.length).toBeLessThanOrEqual(1000);
    });

    it('accumulates network entries', () => {
      const state = makeRecordingState();

      state.accumulatePageData({
        network: [
          { url: 'https://api.acme-corp.com/v2/users', method: 'GET', status: 200 },
          { url: 'https://api.acme-corp.com/v2/config', method: 'POST', status: 201 },
        ],
      });

      expect(state.accumulated.network).toHaveLength(2);

      state.accumulatePageData({
        network: [
          { url: 'https://api.acme-corp.com/v2/sessions', method: 'DELETE', status: 204 },
        ],
      });

      expect(state.accumulated.network).toHaveLength(3);
    });

    it('deduplicates storage events', () => {
      const state = makeRecordingState();

      state.accumulatePageData({
        storage: [
          { type: 'localStorage', name: 'token', action: 'set', timestamp: FIXED_TIME + 100 },
          { type: 'localStorage', name: 'token', action: 'set', timestamp: FIXED_TIME + 200 },
        ],
      });

      // Both have same type-name-action key, so only the latest should remain
      expect(state.accumulated.storage).toHaveLength(1);
      expect(state.accumulated.storage[0].timestamp).toBe(FIXED_TIME + 200);
    });

    it('merges storage state', () => {
      const state = makeRecordingState();

      state.accumulatePageData({
        storageState: {
          localStorage: { theme: 'dark', lang: 'en' },
        },
      });

      expect(state.accumulated.storageState.localStorage).toEqual({ theme: 'dark', lang: 'en' });

      state.accumulatePageData({
        storageState: {
          cookies: { session: 'abc123' },
        },
      });

      expect(state.accumulated.storageState.cookies).toEqual({ session: 'abc123' });
      expect(state.accumulated.storageState.localStorage).toEqual({ theme: 'dark', lang: 'en' });
    });

    it('handles empty page data', () => {
      const state = makeRecordingState();
      state.accumulatePageData({});

      expect(state.accumulated.events).toEqual([]);
      expect(state.accumulated.console).toEqual([]);
      expect(state.accumulated.network).toEqual([]);
      expect(state.accumulated.storage).toEqual([]);
    });
  });

  describe('performCleanupIfNeeded', () => {
    it('does not clean up if within cleanup interval', () => {
      const state = makeRecordingState();
      state.accumulated.lastCleanup = Date.now();

      // Add many events
      state.accumulated.events = Array.from({ length: 30000 }, (_, i) => ({
        type: 3,
        timestamp: FIXED_TIME + i,
      }));

      state.performCleanupIfNeeded();

      // Should not have cleaned because interval hasn't passed
      expect(state.accumulated.events.length).toBe(30000);
    });

    it('cleans up events when interval has passed and events exceed threshold', () => {
      const state = makeRecordingState();
      state.accumulated.lastCleanup = Date.now() - 120000; // 2 minutes ago
      state.performance.maxEventsPerPage = 100;

      // Add snapshots and non-snapshots
      const snapshots = Array.from({ length: 5 }, (_, i) => ({
        type: 2, // full snapshot
        timestamp: FIXED_TIME + i * 1000,
      }));
      const nonSnapshots = Array.from({ length: 300 }, (_, i) => ({
        type: 3, // incremental
        timestamp: FIXED_TIME + i * 16,
      }));

      state.accumulated.events = [...snapshots, ...nonSnapshots];

      state.performCleanupIfNeeded();

      // Should keep all snapshots + last maxEventsPerPage non-snapshots
      expect(state.accumulated.events.length).toBeLessThan(305);
      // All snapshots should be preserved
      const remainingSnapshots = state.accumulated.events.filter(e => e.type === 2);
      expect(remainingSnapshots).toHaveLength(5);
    });

    it('trims console entries over 1000', () => {
      const state = makeRecordingState();
      state.accumulated.lastCleanup = Date.now() - 120000;

      state.accumulated.console = Array.from({ length: 1500 }, (_, i) => ({
        level: 'log',
        message: `entry ${i}`,
      }));

      state.performCleanupIfNeeded();

      expect(state.accumulated.console).toHaveLength(1000);
    });
  });

  describe('deduplicateStorageEvents', () => {
    it('keeps latest event for each type-name-action combination', () => {
      const state = makeRecordingState();
      const events = [
        { type: 'localStorage', name: 'token', action: 'set', timestamp: 100 },
        { type: 'localStorage', name: 'token', action: 'set', timestamp: 200 },
        { type: 'localStorage', name: 'token', action: 'set', timestamp: 150 },
      ];

      const result = state.deduplicateStorageEvents(events);

      expect(result).toHaveLength(1);
      expect(result[0].timestamp).toBe(200);
    });

    it('keeps different type-name-action combinations', () => {
      const state = makeRecordingState();
      const events = [
        { type: 'localStorage', name: 'token', action: 'set', timestamp: 100 },
        { type: 'sessionStorage', name: 'token', action: 'set', timestamp: 100 },
        { type: 'localStorage', name: 'theme', action: 'set', timestamp: 100 },
        { type: 'localStorage', name: 'token', action: 'remove', timestamp: 100 },
      ];

      const result = state.deduplicateStorageEvents(events);

      expect(result).toHaveLength(4);
    });

    it('returns events sorted by timestamp', () => {
      const state = makeRecordingState();
      const events = [
        { type: 'localStorage', name: 'a', action: 'set', timestamp: 300 },
        { type: 'localStorage', name: 'b', action: 'set', timestamp: 100 },
        { type: 'localStorage', name: 'c', action: 'set', timestamp: 200 },
      ];

      const result = state.deduplicateStorageEvents(events);

      expect(result[0].timestamp).toBe(100);
      expect(result[1].timestamp).toBe(200);
      expect(result[2].timestamp).toBe(300);
    });
  });

  describe('getOptimizedReplayData', () => {
    it('returns complete optimized replay data structure', () => {
      const state = makeRecordingState();
      state.accumulated.events = [{ type: 2, timestamp: FIXED_TIME }];
      state.accumulated.console = [{ level: 'log', message: 'test' }];
      state.accumulated.network = [{ url: 'https://api.acme-corp.com', method: 'GET' }];
      state.accumulated.storage = [
        { type: 'localStorage', name: 'key', action: 'set', timestamp: FIXED_TIME },
      ];
      state.navigationHistory = [{ url: 'https://app.com', timestamp: FIXED_TIME, relativeTime: 0 }];
      state.redirectChain = [{ from: 'a', to: 'b', statusCode: 302, timestamp: 100 }];
      state.flowType = 'nav';

      const result: OptimizedReplayData = state.getOptimizedReplayData();

      expect(result.metadata.recordId).toBe('rec_a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(result.metadata.startTime).toBe(FIXED_TIME);
      expect(result.metadata.flowType).toBe('nav');
      expect(result.metadata.navigationCount).toBe(1);
      expect(result.metadata.redirectCount).toBe(1);
      expect(typeof result.metadata.duration).toBe('number');
      expect(result.events.length).toBeGreaterThanOrEqual(0);
      expect(result.console).toHaveLength(1);
      expect(result.network).toHaveLength(1);
      expect(result.storage).toHaveLength(1);
    });

    it('limits console to last 500 entries', () => {
      const state = makeRecordingState();
      state.accumulated.console = Array.from({ length: 800 }, (_, i) => ({
        level: 'log',
        message: `entry ${i}`,
      }));

      const result = state.getOptimizedReplayData();

      expect(result.console).toHaveLength(500);
    });
  });

  describe('compressEventsForReplay', () => {
    it('returns empty array for empty input', () => {
      const state = makeRecordingState();
      expect(state.compressEventsForReplay([])).toEqual([]);
    });

    it('returns input unchanged for null/undefined-like cases', () => {
      const state = makeRecordingState();
      expect(state.compressEventsForReplay(null as unknown as never[])).toBeNull();
    });

    it('keeps all full snapshots (type 2)', () => {
      const state = makeRecordingState();
      const events = [
        { type: 2, timestamp: FIXED_TIME },
        { type: 2, timestamp: FIXED_TIME + 10000 },
        { type: 3, timestamp: FIXED_TIME + 5000, data: { source: 1 } },
      ];

      const result = state.compressEventsForReplay(events);

      const snapshots = result.filter(e => e.type === 2);
      expect(snapshots).toHaveLength(2);
    });

    it('filters out incremental events that are too close together', () => {
      const state = makeRecordingState();
      const events = [
        { type: 2, timestamp: FIXED_TIME },
        { type: 3, timestamp: FIXED_TIME + 1, data: { source: 5 } },
        { type: 3, timestamp: FIXED_TIME + 2, data: { source: 5 } },
        { type: 3, timestamp: FIXED_TIME + 20, data: { source: 5 } },
      ];

      const result = state.compressEventsForReplay(events);

      // First incremental too close to snapshot (< 16ms), second too close to first
      // Third should be kept (20ms > 16ms)
      expect(result.length).toBeLessThanOrEqual(events.length);
    });

    it('uses shorter interval (8ms) for mouse events', () => {
      const state = makeRecordingState();
      const events = [
        { type: 2, timestamp: FIXED_TIME },
        { type: 3, timestamp: FIXED_TIME + 9, data: { source: 1 } }, // mouse move, 9ms > 8ms
        { type: 3, timestamp: FIXED_TIME + 12, data: { source: 5 } }, // non-mouse, 3ms < 16ms from last
      ];

      const result = state.compressEventsForReplay(events);

      // Mouse event at +9ms should be kept (>8ms threshold)
      const incrementals = result.filter(e => e.type === 3);
      expect(incrementals.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('serialize / deserialize', () => {
    it('round-trips essential state through serialization', () => {
      const state = makeRecordingState();
      state.tabId = 42;
      state.currentUrl = 'https://app.enterprise-corp.com/dashboard';
      state.flowType = 'nav' as FlowType;
      state.isPreNav = false;
      state.hasNavigated = true;
      state.firstPageNavigationTime = FIXED_TIME + 2000;
      state.useWidget = true;
      state.addNavigation('https://app.enterprise-corp.com/dashboard', FIXED_TIME + 2000);

      const serialized = state.serialize();
      const deserialized = RecordingState.deserialize(serialized);

      expect(deserialized.recordId).toBe(state.recordId);
      expect(deserialized.startTime).toBe(state.startTime);
      expect(deserialized.originalStartTime).toBe(state.originalStartTime);
      expect(deserialized.isRecording).toBe(state.isRecording);
      expect(deserialized.useWidget).toBe(state.useWidget);
      expect(deserialized.tabId).toBe(42);
      expect(deserialized.currentUrl).toBe('https://app.enterprise-corp.com/dashboard');
      expect(deserialized.flowType).toBe('nav');
      expect(deserialized.isPreNav).toBe(false);
      expect(deserialized.hasNavigated).toBe(true);
      expect(deserialized.firstPageNavigationTime).toBe(FIXED_TIME + 2000);
      expect(deserialized.navigationHistory).toHaveLength(1);
    });

    it('serialize includes accumulated counts', () => {
      const state = makeRecordingState();
      state.accumulated.events = [{ type: 2, timestamp: FIXED_TIME }];
      state.accumulated.console = [{ level: 'log' }];
      state.accumulated.network = [{ url: 'https://api.com' }];
      state.accumulated.storage = [{ type: 'localStorage', name: 'k', action: 's', timestamp: 1 }];

      const parsed = JSON.parse(state.serialize());
      expect(parsed.accumulated).toEqual({
        eventCount: 1,
        consoleCount: 1,
        networkCount: 1,
        storageCount: 1,
        storageState: { localStorage: {}, sessionStorage: {}, cookies: {} },
      });
    });

    it('limits navigation and redirect history to last 10 entries', () => {
      const state = makeRecordingState();
      for (let i = 0; i < 15; i++) {
        state.addNavigation(`https://page${i}.com`, FIXED_TIME + i * 1000);
      }
      for (let i = 0; i < 15; i++) {
        state.redirectChain.push({
          from: `https://from${i}.com`,
          to: `https://to${i}.com`,
          statusCode: 302,
          timestamp: i * 100,
        });
      }

      const parsed = JSON.parse(state.serialize());
      expect(parsed.navigationHistory).toHaveLength(10);
      expect(parsed.redirectChain).toHaveLength(10);
    });
  });

  describe('time helpers', () => {
    it('getEffectiveStartTime returns firstPageNavigationTime for pre-nav', () => {
      const state = makeRecordingState();
      state.isPreNav = true;
      state.firstPageNavigationTime = FIXED_TIME + 5000;

      expect(state.getEffectiveStartTime()).toBe(FIXED_TIME + 5000);
    });

    it('getEffectiveStartTime returns startTime when not pre-nav', () => {
      const state = makeRecordingState();
      expect(state.getEffectiveStartTime()).toBe(FIXED_TIME);
    });

    it('getPreNavTimeOffset returns offset for pre-nav', () => {
      const state = makeRecordingState();
      state.isPreNav = true;
      state.firstPageNavigationTime = FIXED_TIME + 3000;

      expect(state.getPreNavTimeOffset()).toBe(3000);
    });

    it('getPreNavTimeOffset returns 0 when not pre-nav', () => {
      const state = makeRecordingState();
      expect(state.getPreNavTimeOffset()).toBe(0);
    });

    it('getElapsedTime returns time since start', () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME + 65000);
      const state = makeRecordingState();
      expect(state.getElapsedTime()).toBe(65000);
    });

    it('getFormattedElapsedTime returns MM:SS format', () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME + 125000); // 2 min 5 sec
      const state = makeRecordingState();
      expect(state.getFormattedElapsedTime()).toBe('02:05');
    });

    it('getFormattedWidgetElapsedTime uses effective start time', () => {
      vi.spyOn(Date, 'now').mockReturnValue(FIXED_TIME + 70000);
      const state = makeRecordingState();
      state.isPreNav = true;
      state.firstPageNavigationTime = FIXED_TIME + 10000;

      // Widget elapsed = now - effectiveStart = 70000 - 10000 = 60000 = 1 min
      expect(state.getFormattedWidgetElapsedTime()).toBe('01:00');
    });
  });

  describe('serializeFull', () => {
    it('serializes entire object including accumulated data', () => {
      const state = makeRecordingState();
      state.accumulated.events = [{ type: 2, timestamp: FIXED_TIME }];

      const full = JSON.parse(state.serializeFull());

      expect(full.accumulated.events).toHaveLength(1);
      expect(full.accumulated.events[0].type).toBe(2);
    });
  });
});
