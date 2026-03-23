/**
 * Recording Service — single authority for recording lifecycle.
 *
 * Architecture:
 * - Owns all state transitions (via StateMachine)
 * - Owns all tab notifications (notifyTab moved here from StateMachine)
 * - Uses per-tab stop lock to make concurrent stop calls idempotent
 * - Uses atomic tryTransition to prevent TOCTOU races
 */

import { RecordingStateMachine, RecordingStates } from '../shared/state-machine';
import { RecordingState } from '../shared/recording-state';
import { MESSAGE_TYPES } from '../shared/constants';
import { tabs, downloads } from '../../../utils/browser-api';
import { isWebSocketConnected, sendViaWebSocket, sendRecordingViaWebSocket } from '../../../background/websocket.js';
import { DisplayDetector } from '../../../utils/display-detector';
import { logger } from '../../../utils/logger';
import type { RecordingEvent, IRecordingService } from '../../../types/recording';

declare const browser: typeof chrome | undefined;

// Browser API reference
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

interface RecordingOptions {
  useWidget?: boolean;
  [key: string]: unknown;
}

interface StopOptions {
  fromWidget?: boolean;
  [key: string]: unknown;
}

interface RecordingResult {
  id: string;
  tabId: number;
  startTime: number;
  status: string;
  url: string | undefined;
  title: string | undefined;
  [key: string]: unknown;
}

interface RecordingData {
  id: string;
  tabId: number;
  startTime: number;
  endTime: number;
  status: string;
  url: string;
  title: string;
  events: RecordingEvent[];
  preNavTimeAdjustment: number | undefined;
  hasVideoSync: boolean;
  [key: string]: unknown;
}

interface ContentScriptReadyResult {
  shouldStartRecording: boolean;
  state: {
    state: string;
    metadata?: {
      startTime: number | undefined;
      recordingId: string | undefined;
      isPreNavigation: boolean;
    };
  };
}

export class RecordingService implements IRecordingService {
  private stateMachine: RecordingStateMachine;
  private recordings: Map<number, RecordingState>;
  private recordingData: Map<string, RecordingEvent[]>;
  /**
   * Per-tab stop lock. While a tabId is in this set, concurrent stopRecording
   * calls for that tab are dropped. This makes stop fully idempotent regardless
   * of how many sources trigger it simultaneously (widget, popup, hotkey, tab close).
   */
  private stoppingTabs: Set<number>;

  constructor() {
    this.stateMachine = new RecordingStateMachine();
    this.recordings = new Map();
    this.recordingData = new Map();
    this.stoppingTabs = new Set();
  }

  // ── Tab notification (moved from StateMachine) ─────────────────────

  /**
   * Notify a tab's content script about a recording state change.
   * This is the ONLY place tab notifications originate.
   */
  private async notifyTab(tabId: number, state: string, recording: RecordingState | null): Promise<void> {
    // Don't notify during pre-navigation (no content script yet)
    if (state === RecordingStates.PRE_NAVIGATION) return;

    try {
      await browserAPI.tabs.sendMessage(tabId, {
        type: 'RECORDING_STATE_CHANGED',
        action: 'recordingStateChanged',
        data: {
          state: state,
          isRecording: state === RecordingStates.RECORDING || state === RecordingStates.PRE_NAVIGATION,
          isPreNav: state === RecordingStates.PRE_NAVIGATION,
          recordingId: recording?.recordId,
          startTime: recording?.actualStartTime || recording?.startTime
        }
      });
    } catch (error) {
      const err = error as Error;
      // Silently ignore expected errors (tab closed, context invalidated, etc.)
      if (!err.message?.includes('tab') &&
          !err.message?.includes('context') &&
          !err.message?.includes('receiving end does not exist') &&
          !err.message?.includes('Could not establish connection')) {
        logger.info('RecordingService', `Could not notify tab ${tabId}:`, err.message);
      }
    }
  }

  // ── Start recording ────────────────────────────────────────────────

  async startRecording(tabId: number, options: RecordingOptions = {}): Promise<RecordingResult> {
    logger.info('RecordingService', 'Starting recording for tab:', tabId);

    const newState = this.stateMachine.tryTransition(tabId, 'START_RECORDING');
    if (!newState) {
      throw new Error('Cannot start recording in current state');
    }

    try {
      const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
        tabs.get(tabId, (tab: chrome.tabs.Tab) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
      const isPreNavigation = this.isNewTabUrl(tab.url);

      const recordingState = new RecordingState(
        `recording_${Date.now()}`,
        Date.now()
      );

      recordingState.tabId = tabId;
      recordingState.currentUrl = tab.url || 'about:blank';
      recordingState.useWidget = options.useWidget !== false;
      recordingState.detectFlowType(tab.url || '');

      this.recordings.set(tabId, recordingState);
      this.recordingData.set(recordingState.recordId, []);
      this.stateMachine.setRecording(tabId, recordingState);

      await this.updateBadge(tabId, true);

      this.addEvent(tabId, {
        timestamp: recordingState.startTime,
        type: 'recording-start',
        url: tab.url || 'about:blank',
        data: {
          recordingId: recordingState.recordId,
          status: isPreNavigation ? 'pre_navigation' : 'active',
          isPreNavigation,
          title: tab.title,
          tabId: tabId
        }
      });

      if (!isPreNavigation) {
        this.addEvent(tabId, {
          timestamp: Date.now(),
          type: 'navigation',
          url: tab.url,
          data: {
            isInitial: true,
            title: tab.title,
            transitionType: 'start_recording'
          }
        });
      }

      const readyState = this.stateMachine.tryTransition(tabId, isPreNavigation ? 'START_PRE_NAV' : 'RECORDING_READY');
      if (readyState) {
        await this.notifyTab(tabId, readyState, recordingState);
      }

      if (isWebSocketConnected() && !isPreNavigation) {
        let displayInfo = null;
        try {
          const windowInfo = await new Promise<chrome.windows.Window>((resolve, reject) => {
            browserAPI.windows.get(tab.windowId, { populate: false }, (win: chrome.windows.Window) => {
              if (browserAPI.runtime.lastError) {
                reject(new Error(browserAPI.runtime.lastError.message));
              } else {
                resolve(win);
              }
            });
          });

          const detector = new DisplayDetector();
          displayInfo = await detector.getDisplayForWindow(windowInfo);
          logger.debug('RecordingService', 'Detected display for recording:', displayInfo);
        } catch (error) {
          logger.debug('RecordingService', 'Could not detect display:', error);
        }

        const syncData = {
          tabId,
          url: tab.url,
          title: tab.title,
          windowId: tab.windowId,
          recordingId: recordingState.recordId,
          timestamp: Date.now(),
          displayInfo: displayInfo
        };

        const sent = sendViaWebSocket({
          type: 'startSyncRecording',
          data: syncData
        });

        if (sent) {
          logger.info('RecordingService', 'Sent sync recording request with display info:', displayInfo);
          recordingState.hasVideoSync = true;
        }
      }

      if (!isPreNavigation) {
        try {
          await browserAPI.scripting.executeScript({
            target: { tabId },
            files: ['js/content/workflow-recorder/index.js'],
            world: 'ISOLATED' as chrome.scripting.ExecutionWorld,
          });

          await new Promise(resolve => setTimeout(resolve, 100));
          logger.debug('RecordingService', 'Content script injected, it will check recording state');
        } catch (error) {
          logger.info('RecordingService', 'Failed to inject content script:', (error as Error).message);
        }
      } else {
        logger.info('RecordingService', 'Pre-navigation recording started - waiting for navigation');
      }

      return {
        id: recordingState.recordId,
        tabId: tabId,
        startTime: recordingState.startTime,
        status: isPreNavigation ? 'pre_navigation' : 'active',
        url: tab.url,
        title: tab.title
      };

    } catch (error) {
      this.stateMachine.tryTransition(tabId, 'ERROR', { error: (error as Error).message });
      throw error;
    }
  }

  // ── Stop recording (idempotent, lock-protected) ────────────────────

  async stopRecording(tabId: number, options: StopOptions = {}): Promise<RecordingData | null> {
    // Per-tab lock: if a stop is already in progress for this tab, drop silently.
    if (this.stoppingTabs.has(tabId)) {
      logger.debug('RecordingService', 'Stop already in progress for tab:', tabId, '— skipping duplicate');
      return null;
    }

    const recordingState = this.recordings.get(tabId);
    if (!recordingState) {
      logger.debug('RecordingService', 'No recording state found for tab:', tabId);
      return null;
    }

    // Atomic transition: if we can't move to STOPPING, another caller already did.
    const newState = this.stateMachine.tryTransition(tabId, 'STOP_RECORDING');
    if (!newState) {
      logger.debug('RecordingService', 'Cannot stop recording in current state for tab:', tabId);
      return null;
    }

    // Acquire lock
    this.stoppingTabs.add(tabId);
    logger.info('RecordingService', 'Stopping recording for tab:', tabId, 'options:', options);

    try {
      // Notify content script about the stop (unless it came from the widget,
      // which means the content script already knows).
      if (!options.fromWidget) {
        await this.sendStopToContentScript(tabId);
      }

      // Notify tab about state change to STOPPING
      await this.notifyTab(tabId, RecordingStates.STOPPING, recordingState);

      // Add stop event
      try {
        const tab = await this.getTab(tabId);
        this.addEvent(tabId, {
          timestamp: Date.now(),
          type: 'recording-stop',
          url: tab.url || recordingState.currentUrl || '',
          data: {
            finalUrl: tab.url,
            finalTitle: tab.title,
            duration: Date.now() - (recordingState.actualStartTime || recordingState.startTime),
            totalEvents: this.recordingData.get(recordingState.recordId)?.length || 0
          }
        });
      } catch (error) {
        logger.info('RecordingService', 'Could not add stop event:', error);
      }

      recordingState.isRecording = false;
      const events = this.recordingData.get(recordingState.recordId) || [];

      let tabInfo = { url: recordingState.currentUrl || '', title: 'Recording' };
      try {
        const tab = await this.getTab(tabId);
        tabInfo = { url: tab.url || recordingState.currentUrl || '', title: tab.title || 'Recording' };
      } catch (error) {
        logger.info('RecordingService', 'Could not get tab info:', error);
      }

      const recording: RecordingData = {
        id: recordingState.recordId,
        tabId: tabId,
        startTime: recordingState.startTime,
        endTime: Date.now(),
        status: 'stopped',
        url: tabInfo.url,
        title: tabInfo.title,
        events: events,
        preNavTimeAdjustment: recordingState.preNavTimeAdjustment,
        hasVideoSync: recordingState.hasVideoSync || false
      };

      if (recordingState.hasVideoSync && isWebSocketConnected()) {
        sendViaWebSocket({
          type: 'stopSyncRecording',
          data: {
            recordingId: recordingState.recordId,
            timestamp: Date.now()
          }
        });
      }

      try {
        await this.exportRecording(recording);
      } catch (error) {
        logger.error('RecordingService', 'Failed to export recording:', error);
      }

      // Cleanup state
      this.recordings.delete(tabId);
      this.recordingData.delete(recordingState.recordId);

      await this.updateBadge(tabId, false);

      const idleState = this.stateMachine.tryTransition(tabId, 'RECORDING_STOPPED');
      if (idleState) {
        await this.notifyTab(tabId, idleState, null);
      }

      return recording;
    } finally {
      // Always release the lock
      this.stoppingTabs.delete(tabId);
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────

  private async getTab(tabId: number): Promise<chrome.tabs.Tab> {
    return new Promise<chrome.tabs.Tab>((resolve, reject) => {
      tabs.get(tabId, (tab: chrome.tabs.Tab) => {
        if (browserAPI.runtime.lastError) {
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          resolve(tab);
        }
      });
    });
  }

  private async sendStopToContentScript(tabId: number): Promise<void> {
    try {
      await new Promise<void>((resolve) => {
        tabs.sendMessage(tabId, {
          type: MESSAGE_TYPES.STOP_RECORDING,
          action: 'stopRecording'
        }, () => {
          if (browserAPI.runtime.lastError) {
            if (!browserAPI.runtime.lastError.message?.includes('tab was closed') &&
                !browserAPI.runtime.lastError.message?.includes('context invalidated')) {
              logger.info('RecordingService', 'Could not send stop message:', browserAPI.runtime.lastError.message);
            }
          }
          resolve();
        });
      });
    } catch (error) {
      const err = error as Error;
      if (!err.message?.includes('tab') && !err.message?.includes('context')) {
        logger.info('RecordingService', 'Could not send stop message:', error);
      }
    }
  }

  // ── Events ─────────────────────────────────────────────────────────

  addEvent(tabId: number, event: RecordingEvent): void {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) {
      logger.warn('RecordingService', 'No recording found for tab:', tabId);
      return;
    }

    const adjustedEvent = { ...event };
    if (recordingState.preNavTimeAdjustment !== undefined) {
      adjustedEvent.timestamp = event.timestamp - recordingState.preNavTimeAdjustment;
    }

    const events = this.recordingData.get(recordingState.recordId) || [];
    events.push(adjustedEvent);
    this.recordingData.set(recordingState.recordId, events);

    logger.debug('RecordingService', `Event added: ${adjustedEvent.type}, Total: ${events.length}`);
  }

  // ── Export ─────────────────────────────────────────────────────────

  async exportRecording(recording: RecordingData): Promise<void> {
    logger.info('RecordingService', 'Exporting recording:', recording.id);

    let viewport = { width: 1920, height: 1080 };
    const rrwebEvents = recording.events.filter(e => e.type === 'rrweb');
    if (rrwebEvents.length > 0 && rrwebEvents[0].data) {
      const firstEvent = rrwebEvents[0].data as { type?: number; data?: { node?: { childNodes?: unknown[] }; width?: number; height?: number }; width?: number; height?: number };
      if (firstEvent.type === 2 && firstEvent.data?.node?.childNodes) {
        const meta = firstEvent.data;
        if (meta.width && meta.height) {
          viewport = { width: meta.width, height: meta.height };
        }
      }
    }

    if (isWebSocketConnected()) {
      const recordingData = {
        record: {
          id: recording.id,
          tabId: recording.tabId,
          startTime: recording.startTime,
          endTime: recording.endTime,
          url: recording.url,
          title: recording.title || 'Recording',
          events: recording.events || [],
          preNavTimeAdjustment: recording.preNavTimeAdjustment,
          hasVideoSync: recording.hasVideoSync || false,
          metadata: {
            recordId: recording.id,
            timestamp: recording.startTime,
            startTime: recording.startTime,
            endTime: recording.endTime,
            duration: recording.endTime - recording.startTime,
            url: recording.url,
            title: recording.title || 'Recording',
            tabId: recording.tabId,
            viewport: viewport,
            userAgent: navigator.userAgent || 'Unknown'
          }
        }
      };

      const sent = sendRecordingViaWebSocket(recordingData);

      if (sent) {
        logger.info('RecordingService', 'Successfully sent recording to desktop app');
        return;
      }
    }

    const json = JSON.stringify(recording, null, 2);
    const dataUrl = 'data:application/json;base64,' + btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
    const filename = `recording_${recording.id}_${new Date(recording.startTime).toISOString().replace(/[:.]/g, '-')}.json`;

    await new Promise<void>((resolve, reject) => {
      downloads!.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, (downloadId: number) => {
        if (browserAPI.runtime.lastError) {
          logger.error('RecordingService', 'Download failed:', browserAPI.runtime.lastError);
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          logger.debug('RecordingService', 'Download started with ID:', downloadId);
          resolve();
        }
      });
    });
  }

  // ── Badge ──────────────────────────────────────────────────────────

  async updateBadge(tabId: number, isRecording: boolean): Promise<void> {
    try {
      await this.getTab(tabId);

      if (isRecording) {
        await browserAPI.action.setBadgeText({ tabId, text: '\u2022' });
        await browserAPI.action.setBadgeBackgroundColor({
          tabId,
          color: '#EF4444'
        });
      } else {
        await browserAPI.action.setBadgeText({ tabId, text: '' });
      }
    } catch (error) {
      const err = error as Error;
      if (!err.message?.includes('No tab with id') &&
          !err.message?.includes('tab') &&
          !err.message?.includes('Cannot access')) {
        logger.debug('RecordingService', 'Badge update skipped:', err.message);
      }
    }
  }

  // ── State queries ──────────────────────────────────────────────────

  isRecording(tabId: number): boolean {
    return this.stateMachine.isRecording(tabId);
  }

  getRecordingState(tabId: number): {
    state: string;
    metadata: {
      startTime: number | undefined;
      recordingId: string | undefined;
      isPreNavigation: boolean;
    };
    shouldInjectScripts: boolean;
  } {
    const tabState = this.stateMachine.getTabState(tabId);
    const recordingState = this.recordings.get(tabId);

    return {
      state: tabState.state,
      metadata: {
        startTime: recordingState?.actualStartTime || recordingState?.startTime,
        recordingId: recordingState?.recordId,
        isPreNavigation: tabState.state === RecordingStates.PRE_NAVIGATION
      },
      shouldInjectScripts: tabState.state === RecordingStates.RECORDING ||
                          tabState.state === RecordingStates.PRE_NAVIGATION
    };
  }

  async handleContentScriptReady(tabId: number, _payload?: unknown): Promise<ContentScriptReadyResult> {
    const tabState = this.stateMachine.getTabState(tabId);
    const recordingState = this.recordings.get(tabId);

    if (tabState.state === RecordingStates.RECORDING && recordingState) {
      return {
        shouldStartRecording: true,
        state: {
          state: tabState.state,
          metadata: {
            startTime: recordingState.actualStartTime || recordingState.startTime,
            recordingId: recordingState.recordId,
            isPreNavigation: false
          }
        }
      };
    }

    return {
      shouldStartRecording: false,
      state: { state: 'idle' }
    };
  }

  // ── Navigation handling ────────────────────────────────────────────

  isNewTabUrl(url: string | undefined): boolean {
    return !url || url === '' || url === 'about:blank' ||
           url === 'chrome://newtab/' || url === 'edge://newtab/' ||
           url === 'about:newtab' || url.startsWith('chrome://') ||
           url.startsWith('edge://');
  }

  async handleNavigation(tabId: number, url: string, _details: Record<string, unknown> = {}): Promise<void> {
    const tabState = this.stateMachine.getTabState(tabId);
    const recordingState = this.recordings.get(tabId);

    if (recordingState && recordingState.lastNavigationUrl === url &&
        Date.now() - (recordingState.lastNavigationTime || 0) < 100) {
      return;
    }

    if (tabState.state === RecordingStates.PRE_NAVIGATION &&
        recordingState && !this.isNewTabUrl(url)) {

      if (recordingState.preNavTimeAdjustment === undefined) {
        recordingState.preNavTimeAdjustment = Date.now() - recordingState.startTime;
      }

      recordingState.addNavigation(url);
      recordingState.currentUrl = url;

      const newState = this.stateMachine.tryTransition(tabId, 'NAVIGATION_COMMITTED');
      if (newState) {
        await this.notifyTab(tabId, newState, recordingState);
      }

      if (recordingState.hasVideoSync && isWebSocketConnected()) {
        sendViaWebSocket({
          type: 'recordingStateSync',
          data: {
            recordingId: recordingState.recordId,
            state: 'recording',
            timestamp: Date.now()
          }
        });
      }

      this.addEvent(tabId, {
        timestamp: Date.now(),
        type: 'navigation',
        url: url,
        data: {
          title: 'Navigation',
          transitionType: 'typed',
          isInitial: true,
          fromPreNav: true
        }
      });

      recordingState.lastNavigationUrl = url;
      recordingState.lastNavigationTime = Date.now();
      recordingState.actualStartTime = Date.now();

      if (isWebSocketConnected()) {
        const tab = await this.getTab(tabId);

        const syncData = {
          tabId,
          url: url,
          title: tab.title || 'Recording',
          windowId: tab.windowId,
          recordingId: recordingState.recordId,
          timestamp: Date.now()
        };

        const sent = sendViaWebSocket({
          type: 'startSyncRecording',
          data: syncData
        });

        if (sent) {
          recordingState.hasVideoSync = true;
        }
      }

      try {
        await browserAPI.scripting.executeScript({
          target: { tabId },
          files: ['js/content/workflow-recorder/index.js'],
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        logger.info('RecordingService', 'Failed to inject content script:', (error as Error).message);
      }
    } else if (tabState.state === RecordingStates.RECORDING &&
               recordingState && !this.isNewTabUrl(url)) {

      recordingState.addNavigation(url);
      recordingState.currentUrl = url;

      this.addEvent(tabId, {
        timestamp: Date.now(),
        type: 'navigation',
        url: url,
        data: {
          title: 'Navigation',
          transitionType: 'link',
          isInitial: false
        }
      });

      recordingState.lastNavigationUrl = url;
      recordingState.lastNavigationTime = Date.now();

      try {
        await browserAPI.scripting.executeScript({
          target: { tabId },
          files: ['js/content/workflow-recorder/index.js'],
        });
      } catch (error) {
        logger.info('RecordingService', 'Failed to inject content script:', (error as Error).message);
      }
    }
  }

  // ── Tab cleanup ────────────────────────────────────────────────────

  async cleanupTab(tabId: number): Promise<void> {
    if (this.isRecording(tabId)) {
      const recordingState = this.recordings.get(tabId);
      if (recordingState) {
        this.addEvent(tabId, {
          timestamp: Date.now(),
          type: 'recording-stop',
          url: recordingState.currentUrl || 'unknown',
          data: {
            reason: 'tab_closed',
            finalUrl: recordingState.currentUrl,
            duration: Date.now() - (recordingState.actualStartTime || recordingState.startTime),
            totalEvents: this.recordingData.get(recordingState.recordId)?.length || 0
          }
        });

        const events = this.recordingData.get(recordingState.recordId) || [];
        const recording: RecordingData = {
          id: recordingState.recordId,
          tabId: tabId,
          startTime: recordingState.startTime,
          endTime: Date.now(),
          status: 'stopped_tab_closed',
          url: recordingState.currentUrl || '',
          title: 'Recording (Tab Closed)',
          events: events,
          preNavTimeAdjustment: recordingState.preNavTimeAdjustment,
          hasVideoSync: recordingState.hasVideoSync || false
        };

        if (recordingState.hasVideoSync && isWebSocketConnected()) {
          sendViaWebSocket({
            type: 'stopSyncRecording',
            data: {
              recordingId: recordingState.recordId,
              timestamp: Date.now()
            }
          });
        }

        try {
          await this.exportRecording(recording);
        } catch (error) {
          logger.info('RecordingService', 'Failed to export recording on tab close:', (error as Error).message);
        }
      }
    }

    // Release any stuck stop lock for this tab
    this.stoppingTabs.delete(tabId);

    const recordingState = this.recordings.get(tabId);
    this.recordings.delete(tabId);
    if (recordingState) {
      this.recordingData.delete(recordingState.recordId);
    }
    this.stateMachine.cleanupTab(tabId);
  }

}
