/**
 * Unified recording state management with flow support and performance optimization
 */

import { logger } from '../../../utils/logger';

export type FlowType = 'pre-nav' | 'nav' | 'oauth-redirect' | null;

interface NavigationEntry {
  url: string;
  timestamp: number;
  relativeTime?: number;
  flowType?: FlowType;
}

interface RedirectEntry {
  from: string;
  to: string;
  statusCode: number;
  timestamp: number;
}

interface StorageState {
  localStorage: Record<string, unknown>;
  sessionStorage: Record<string, unknown>;
  cookies: Record<string, unknown>;
}

interface StorageEvent {
  type: string;
  name: string;
  action: string;
  timestamp: number;
  [key: string]: unknown;
}

interface RrwebEvent {
  type: number;
  timestamp: number;
  data?: {
    source?: number;
    positions?: unknown[];
    node?: { childNodes?: unknown[] };
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface PageData {
  events?: RrwebEvent[];
  console?: Array<Record<string, unknown>>;
  network?: Array<Record<string, unknown>>;
  storage?: StorageEvent[];
  storageState?: Partial<StorageState>;
}

interface AccumulatedData {
  events: RrwebEvent[];
  console: Array<Record<string, unknown>>;
  network: Array<Record<string, unknown>>;
  storage: StorageEvent[];
  storageState: StorageState;
  eventCount: number;
  lastCleanup: number;
}

interface PerformanceSettings {
  maxEventsPerPage: number;
  maxAccumulatedEvents: number;
  cleanupInterval: number;
}

interface SerializedState {
  recordId: string;
  startTime: number;
  originalStartTime: number;
  isRecording: boolean;
  useWidget: boolean;
  tabId: number | null;
  currentUrl: string | null;
  flowType: FlowType;
  isPreNav: boolean;
  hasNavigated: boolean;
  firstPageNavigationTime: number | null;
  navigationHistory: NavigationEntry[];
  redirectChain: RedirectEntry[];
  accumulated?: {
    eventCount: number;
    consoleCount: number;
    networkCount: number;
    storageCount: number;
    storageState: StorageState;
  };
}

export interface OptimizedReplayData {
  events: RrwebEvent[];
  console: Array<Record<string, unknown>>;
  network: Array<Record<string, unknown>>;
  storage: StorageEvent[];
  metadata: {
    recordId: string;
    startTime: number;
    duration: number;
    flowType: FlowType;
    navigationCount: number;
    redirectCount: number;
  };
}

export class RecordingState {
  recordId: string;
  startTime: number;
  originalStartTime: number;
  isRecording: boolean;
  useWidget: boolean;
  tabId: number | null;
  currentUrl: string | null;
  flowType: FlowType;
  isPreNav: boolean;
  hasNavigated: boolean;
  firstPageNavigationTime: number | null;
  accumulated: AccumulatedData;
  navigationHistory: NavigationEntry[];
  redirectChain: RedirectEntry[];
  performance: PerformanceSettings;
  // Additional properties used by RecordingService
  preNavTimeAdjustment?: number;
  hasVideoSync?: boolean;
  actualStartTime?: number;
  lastNavigationUrl?: string;
  lastNavigationTime?: number;

  constructor(recordId: string, startTime: number = Date.now()) {
    this.recordId = recordId;
    this.startTime = startTime;
    this.originalStartTime = startTime;
    this.isRecording = true;
    this.useWidget = false;
    this.tabId = null;
    this.currentUrl = null;

    this.flowType = null;
    this.isPreNav = false;
    this.hasNavigated = false;
    this.firstPageNavigationTime = null;

    this.accumulated = {
      events: [],
      console: [],
      network: [],
      storage: [],
      storageState: {
        localStorage: {},
        sessionStorage: {},
        cookies: {}
      },
      eventCount: 0,
      lastCleanup: Date.now()
    };

    this.navigationHistory = [];
    this.redirectChain = [];

    this.performance = {
      maxEventsPerPage: 10000,
      maxAccumulatedEvents: 50000,
      cleanupInterval: 60000
    };
  }

  isRealPageUrl(url: string): boolean {
    return !!url &&
           url !== '' &&
           url !== 'about:blank' &&
           !url.startsWith('chrome://') &&
           !url.startsWith('edge://') &&
           !url.startsWith('about:') &&
           !url.startsWith('chrome-extension://');
  }

  detectFlowType(url: string): void {
    if (!url || url === '' || url === 'about:blank' || url === 'chrome://newtab/' ||
        url === 'edge://newtab/' || url === 'about:newtab') {
      this.flowType = 'pre-nav';
      this.isPreNav = true;
    } else if (this.redirectChain.length > 0 || url.includes('callback') ||
               url.includes('oauth') || url.includes('auth')) {
      this.flowType = 'oauth-redirect';
    } else {
      this.flowType = 'nav';
    }
  }

  addNavigation(url: string, timestamp: number = Date.now()): void {
    if (this.isPreNav && url && this.isRealPageUrl(url)) {
      this.hasNavigated = true;
      this.detectFlowType(url);

      if (!this.firstPageNavigationTime) {
        this.firstPageNavigationTime = timestamp;
        logger.info('RecordingState', 'Set firstPageNavigationTime:', timestamp, 'for URL:', url);
      }
    }

    this.navigationHistory.push({
      url,
      timestamp,
      relativeTime: timestamp - this.startTime,
      flowType: this.flowType
    });
    this.currentUrl = url;
  }

  addRedirect(from: string, to: string, statusCode: number): void {
    this.redirectChain.push({
      from,
      to,
      statusCode,
      timestamp: Date.now() - this.startTime
    });

    if (to.includes('callback') || to.includes('oauth') || to.includes('auth')) {
      this.flowType = 'oauth-redirect';
    }
  }

  accumulatePageData(pageData: PageData): void {
    this.performCleanupIfNeeded();

    if (pageData.events && this.accumulated.events.length < this.performance.maxAccumulatedEvents) {
      const eventsToAdd = pageData.events.slice(0,
        this.performance.maxAccumulatedEvents - this.accumulated.events.length
      );
      this.accumulated.events.push(...eventsToAdd);
      this.accumulated.eventCount = this.accumulated.events.length;
    }

    if (pageData.console) {
      this.accumulated.console = [
        ...this.accumulated.console.slice(-900),
        ...pageData.console.slice(-100)
      ];
    }

    if (pageData.network) {
      this.accumulated.network.push(...pageData.network);
    }

    if (pageData.storage) {
      this.accumulated.storage = this.deduplicateStorageEvents([
        ...this.accumulated.storage,
        ...pageData.storage
      ]);
    }

    if (pageData.storageState) {
      Object.assign(this.accumulated.storageState, pageData.storageState);
    }
  }

  performCleanupIfNeeded(): void {
    const now = Date.now();
    if (now - this.accumulated.lastCleanup < this.performance.cleanupInterval) {
      return;
    }

    this.accumulated.lastCleanup = now;

    if (this.accumulated.events.length > this.performance.maxEventsPerPage * 2) {
      const snapshots = this.accumulated.events.filter(e => e.type === 2);
      const nonSnapshots = this.accumulated.events.filter(e => e.type !== 2);
      const recentNonSnapshots = nonSnapshots.slice(-this.performance.maxEventsPerPage);

      this.accumulated.events = [...snapshots, ...recentNonSnapshots];
      logger.info('RecordingState', 'Cleaned up events:', this.accumulated.events.length);
    }

    if (this.accumulated.console.length > 1000) {
      this.accumulated.console = this.accumulated.console.slice(-1000);
    }
  }

  deduplicateStorageEvents(events: StorageEvent[]): StorageEvent[] {
    const seen = new Map<string, StorageEvent>();

    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const key = `${event.type}-${event.name}-${event.action}`;

      if (!seen.has(key) || event.timestamp > (seen.get(key)!).timestamp) {
        seen.set(key, event);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
  }

  getOptimizedReplayData(): OptimizedReplayData {
    return {
      events: this.compressEventsForReplay(this.accumulated.events),
      console: this.accumulated.console.slice(-500),
      network: this.accumulated.network,
      storage: this.deduplicateStorageEvents(this.accumulated.storage),
      metadata: {
        recordId: this.recordId,
        startTime: this.startTime,
        duration: Date.now() - this.startTime,
        flowType: this.flowType,
        navigationCount: this.navigationHistory.length,
        redirectCount: this.redirectChain.length
      }
    };
  }

  compressEventsForReplay(events: RrwebEvent[]): RrwebEvent[] {
    if (!events || events.length === 0) return events;

    const compressed: RrwebEvent[] = [];
    const fullSnapshots: RrwebEvent[] = [];
    const incrementalsBySnapshot = new Map<number, RrwebEvent[]>();
    let currentSnapshotTime = 0;

    events.forEach(event => {
      if (event.type === 2) {
        fullSnapshots.push(event);
        currentSnapshotTime = event.timestamp;
        incrementalsBySnapshot.set(currentSnapshotTime, []);
      } else if (event.type === 3 && currentSnapshotTime > 0) {
        const snapshots = incrementalsBySnapshot.get(currentSnapshotTime);
        if (snapshots) {
          snapshots.push(event);
        }
      } else {
        compressed.push(event);
      }
    });

    fullSnapshots.forEach(snapshot => {
      compressed.push(snapshot);

      const incrementals = incrementalsBySnapshot.get(snapshot.timestamp) || [];
      let lastTime = snapshot.timestamp;

      incrementals.forEach(event => {
        const isMouseEvent = event.data && (
          (event.data.source === 1) ||
          (event.data.source === 6) ||
          (event.data.source === 2) ||
          (event.data.positions && event.data.positions.length > 0)
        );

        const minInterval = isMouseEvent ? 8 : 16;

        if (event.timestamp - lastTime >= minInterval) {
          compressed.push(event);
          lastTime = event.timestamp;
        }
      });
    });

    compressed.sort((a, b) => a.timestamp - b.timestamp);

    logger.info('RecordingState', `Compressed ${events.length} events to ${compressed.length} (kept all ${fullSnapshots.length} snapshots)`);
    return compressed;
  }

  serialize(): string {
    const essentialData: SerializedState = {
      recordId: this.recordId,
      startTime: this.startTime,
      originalStartTime: this.originalStartTime,
      isRecording: this.isRecording,
      useWidget: this.useWidget,
      tabId: this.tabId,
      currentUrl: this.currentUrl,
      flowType: this.flowType,
      isPreNav: this.isPreNav,
      hasNavigated: this.hasNavigated,
      firstPageNavigationTime: this.firstPageNavigationTime,
      navigationHistory: this.navigationHistory.slice(-10),
      redirectChain: this.redirectChain.slice(-10),
      accumulated: {
        eventCount: this.accumulated.events.length,
        consoleCount: this.accumulated.console.length,
        networkCount: this.accumulated.network.length,
        storageCount: this.accumulated.storage.length,
        storageState: this.accumulated.storageState
      }
    };

    return JSON.stringify(essentialData);
  }

  serializeFull(): string {
    return JSON.stringify(this);
  }

  static deserialize(serialized: string): RecordingState {
    const data: SerializedState = JSON.parse(serialized);
    const state = new RecordingState(data.recordId, data.startTime);

    state.originalStartTime = data.originalStartTime;
    state.isRecording = data.isRecording;
    state.useWidget = data.useWidget;
    state.tabId = data.tabId;
    state.currentUrl = data.currentUrl;
    state.flowType = data.flowType;
    state.isPreNav = data.isPreNav;
    state.hasNavigated = data.hasNavigated;
    state.firstPageNavigationTime = data.firstPageNavigationTime;
    state.navigationHistory = data.navigationHistory || [];
    state.redirectChain = data.redirectChain || [];

    return state;
  }

  getEffectiveStartTime(): number {
    if (this.isPreNav && this.firstPageNavigationTime) {
      return this.firstPageNavigationTime;
    }
    return this.startTime;
  }

  getPreNavTimeOffset(): number {
    if (this.isPreNav && this.firstPageNavigationTime) {
      return this.firstPageNavigationTime - this.originalStartTime;
    }
    return 0;
  }

  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  getWidgetElapsedTime(): number {
    return Date.now() - this.getEffectiveStartTime();
  }

  getFormattedElapsedTime(): string {
    const elapsed = Math.floor(this.getElapsedTime() / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  getFormattedWidgetElapsedTime(): string {
    const elapsed = Math.floor(this.getWidgetElapsedTime() / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
