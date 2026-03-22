/**
 * New Recording Service that integrates with existing infrastructure
 */

import { RecordingStateMachine, RecordingStates } from '../shared/state-machine';
import { RecordingState } from '../shared/recording-state';
import { NewMessageTypes } from '../shared/message-adapter';
import { MESSAGE_TYPES } from '../shared/constants';
import { tabs, downloads } from '../../../utils/browser-api';
import { isWebSocketConnected, sendViaWebSocket, sendRecordingViaWebSocket } from '../../../background/websocket.js';
import { DisplayDetector } from '../../../utils/display-detector';
import type { RecordingEvent } from '../../../types/recording';

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

interface RecordData {
  events?: Array<{ timestamp?: number; [key: string]: unknown }>;
  console?: Array<{ timestamp?: number; [key: string]: unknown }>;
  network?: Array<{ timestamp?: number; [key: string]: unknown }>;
  url?: string;
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

export class RecordingService {
  private stateMachine: RecordingStateMachine;
  private recordings: Map<number, RecordingState>;
  private recordingData: Map<string, RecordingEvent[]>;
  private widgetPreferences?: Map<number, boolean>;

  constructor() {
    this.stateMachine = new RecordingStateMachine();
    this.recordings = new Map();
    this.recordingData = new Map();
  }

  async startRecording(tabId: number, options: RecordingOptions = {}): Promise<RecordingResult> {
    console.log('[RecordingService] Starting recording for tab:', tabId);

    if (!this.stateMachine.canTransition(tabId, 'START_RECORDING')) {
      throw new Error('Cannot start recording in current state');
    }

    this.stateMachine.transition(tabId, 'START_RECORDING');

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

      this.stateMachine.transition(tabId, isPreNavigation ? 'START_PRE_NAV' : 'RECORDING_READY');

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
          console.log('[RecordingService] Detected display for recording:', displayInfo);
        } catch (error) {
          console.log('[RecordingService] Could not detect display:', error);
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
          console.log('[RecordingService] Sent sync recording request with display info:', displayInfo);
          recordingState.hasVideoSync = true;
        }
      }

      if (!isPreNavigation) {
        try {
          await browserAPI.scripting.executeScript({
            target: { tabId },
            files: ['js/content/record-recorder/index.js'],
          });

          await new Promise(resolve => setTimeout(resolve, 100));
          console.log('[RecordingService] Content script injected, it will check recording state');
        } catch (error) {
          console.log('[RecordingService] Failed to inject content script:', (error as Error).message);
        }
      } else {
        console.log('[RecordingService] Pre-navigation recording started - waiting for navigation');
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
      this.stateMachine.transition(tabId, 'ERROR', { error: (error as Error).message });
      throw error;
    }
  }

  async stopRecording(tabId: number, options: StopOptions = {}): Promise<RecordingData | null> {
    console.log('[RecordingService] Stopping recording for tab:', tabId, 'options:', options);

    const recordingState = this.recordings.get(tabId);
    if (!recordingState) {
      console.log('[RecordingService] No recording state found for tab:', tabId);
      return null;
    }

    if (!this.stateMachine.canTransition(tabId, 'STOP_RECORDING')) {
      console.warn('Cannot stop recording in current state');
      return null;
    }

    this.stateMachine.transition(tabId, 'STOP_RECORDING');

    if (!options.fromWidget) {
      try {
        await new Promise<void>((resolve) => {
          tabs.sendMessage(tabId, {
            type: MESSAGE_TYPES.STOP_RECORDING,
            action: 'stopRecording'
          }, () => {
            if (browserAPI.runtime.lastError) {
              if (!browserAPI.runtime.lastError.message?.includes('tab was closed') &&
                  !browserAPI.runtime.lastError.message?.includes('context invalidated')) {
                console.log('[RecordingService] Could not send stop message:', browserAPI.runtime.lastError.message);
              }
            }
            resolve();
          });
        });
      } catch (error) {
        const err = error as Error;
        if (!err.message?.includes('tab') && !err.message?.includes('context')) {
          console.log('[RecordingService] Could not send stop message:', error);
        }
      }
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
      console.log('[RecordingService] Could not add stop event:', error);
    }

    recordingState.isRecording = false;
    const events = this.recordingData.get(recordingState.recordId) || [];

    let tabInfo = { url: recordingState.currentUrl || '', title: 'Recording' };
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
      tabInfo = { url: tab.url || recordingState.currentUrl || '', title: tab.title || 'Recording' };
    } catch (error) {
      console.log('[RecordingService] Could not get tab info:', error);
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
      console.error('[RecordingService] Failed to export recording:', error);
    }

    this.recordings.delete(tabId);
    this.recordingData.delete(recordingState.recordId);

    await this.updateBadge(tabId, false);
    this.stateMachine.transition(tabId, 'RECORDING_STOPPED');

    return recording;
  }

  addEvent(tabId: number, event: RecordingEvent): void {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) {
      console.warn('[RecordingService] No recording found for tab:', tabId);
      return;
    }

    const adjustedEvent = { ...event };
    if (recordingState.preNavTimeAdjustment !== undefined) {
      adjustedEvent.timestamp = event.timestamp - recordingState.preNavTimeAdjustment;
    }

    const events = this.recordingData.get(recordingState.recordId) || [];
    events.push(adjustedEvent);
    this.recordingData.set(recordingState.recordId, events);

    console.log(`[RecordingService] Event added: ${adjustedEvent.type}, Total: ${events.length}`);
  }

  async exportRecording(recording: RecordingData): Promise<void> {
    console.log('[RecordingService] Exporting recording:', recording.id);

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
        console.log('[RecordingService] Successfully sent recording to desktop app');
        return;
      }
    }

    const json = JSON.stringify(recording, null, 2);
    const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));
    const filename = `recording_${recording.id}_${new Date(recording.startTime).toISOString().replace(/[:.]/g, '-')}.json`;

    await new Promise<void>((resolve, reject) => {
      downloads!.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, (downloadId: number) => {
        if (browserAPI.runtime.lastError) {
          console.error('[RecordingService] Download failed:', browserAPI.runtime.lastError);
          reject(new Error(browserAPI.runtime.lastError.message));
        } else {
          console.log('[RecordingService] Download started with ID:', downloadId);
          resolve();
        }
      });
    });
  }

  async updateBadge(tabId: number, isRecording: boolean): Promise<void> {
    try {
      await new Promise<chrome.tabs.Tab>((resolve, reject) => {
        tabs.get(tabId, (tab: chrome.tabs.Tab) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });

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
        console.log('[RecordingService] Badge update skipped:', err.message);
      }
    }
  }

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
      this.stateMachine.transition(tabId, 'NAVIGATION_COMMITTED');

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
        const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
          tabs.get(tabId, (tab: chrome.tabs.Tab) => {
            if (browserAPI.runtime.lastError) {
              reject(new Error(browserAPI.runtime.lastError.message));
            } else {
              resolve(tab);
            }
          });
        });

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
          files: ['js/content/record-recorder/index.js'],
        });
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.log('[RecordingService] Failed to inject content script:', (error as Error).message);
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
          files: ['js/content/record-recorder/index.js'],
        });
      } catch (error) {
        console.log('[RecordingService] Failed to inject content script:', (error as Error).message);
      }
    }
  }

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
          console.log('[RecordingService] Failed to export recording on tab close:', (error as Error).message);
        }
      }
    }

    const recordingState = this.recordings.get(tabId);
    this.recordings.delete(tabId);
    if (recordingState) {
      this.recordingData.delete(recordingState.recordId);
    }
    this.stateMachine.cleanupTab(tabId);
  }

  setWidgetPreference(tabId: number, useWidget: boolean): void {
    if (!this.widgetPreferences) {
      this.widgetPreferences = new Map();
    }
    this.widgetPreferences.set(tabId, useWidget);
  }

  async cancelRecording(tabId: number, _options: StopOptions = {}): Promise<{ success: boolean; error?: string }> {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return { success: false, error: 'Not recording' };

    this.stateMachine.transition(tabId, 'STOP_RECORDING');

    this.recordings.delete(tabId);
    this.recordingData.delete(recordingState.recordId);

    await this.updateBadge(tabId, false);
    this.stateMachine.transition(tabId, 'RECORDING_STOPPED');

    return { success: true };
  }

  async downloadRecord(url: string, filename: string): Promise<void> {
    await new Promise<void>((resolve) => {
      downloads!.download({
        url: url,
        filename: filename,
        saveAs: true
      }, () => resolve());
    });
  }

  getNetworkData(tabId: number): Array<Record<string, unknown>> {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return [];

    const events = this.recordingData.get(recordingState.recordId) || [];
    return events
      .filter(e => e.type === 'network')
      .map(e => e.data || {});
  }

  accumulateRecordData(tabId: number, recordData: RecordData): void {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return;

    if (recordData.events) {
      recordData.events.forEach(event => {
        this.addEvent(tabId, {
          timestamp: event.timestamp || Date.now(),
          type: 'rrweb',
          url: recordData.url || '',
          data: event as Record<string, unknown>
        });
      });
    }

    if (recordData.console) {
      recordData.console.forEach(log => {
        this.addEvent(tabId, {
          timestamp: log.timestamp || Date.now(),
          type: 'console',
          url: recordData.url || '',
          data: log as Record<string, unknown>
        });
      });
    }

    if (recordData.network) {
      recordData.network.forEach(req => {
        this.addEvent(tabId, {
          timestamp: req.timestamp || Date.now(),
          type: 'network',
          url: recordData.url || '',
          data: req as Record<string, unknown>
        });
      });
    }
  }

  getAccumulatedRecordData(tabId: number): {
    recordId: string;
    events: Array<Record<string, unknown>>;
    console: Array<Record<string, unknown>>;
    network: Array<Record<string, unknown>>;
    storage: Array<Record<string, unknown>>;
    url: string | null;
  } | null {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return null;

    const events = this.recordingData.get(recordingState.recordId) || [];

    return {
      recordId: recordingState.recordId,
      events: events.filter(e => e.type === 'rrweb').map(e => e.data || {}),
      console: events.filter(e => e.type === 'console').map(e => e.data || {}),
      network: events.filter(e => e.type === 'network').map(e => e.data || {}),
      storage: events.filter(e => e.type === 'storage').map(e => e.data || {}),
      url: recordingState.currentUrl
    };
  }

  markPageVisited(tabId: number): boolean {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return false;

    const wasPreNav = recordingState.isPreNav;
    if (wasPreNav) {
      recordingState.isPreNav = false;
      recordingState.hasNavigated = true;
    }

    return wasPreNav;
  }
}
