/**
 * New Recording Service that integrates with existing infrastructure
 */

import { RecordingStateMachine, RecordingStates } from '../shared/state-machine.js';
import { RecordingState } from '../shared/recording-state.js';
import { NewMessageTypes } from '../shared/message-adapter.js';
import { MESSAGE_TYPES } from '../shared/constants.js';
import { tabs, downloads } from '../../../utils/browser-api.js';
import { isWebSocketConnected, sendViaWebSocket, sendRecordingViaWebSocket } from '../../../background/websocket.js';
import { DisplayDetector } from '../../../utils/display-detector.js';

// Browser API reference  
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

export class RecordingService {
  constructor() {
    this.stateMachine = new RecordingStateMachine();
    this.recordings = new Map(); // tabId -> RecordingState
    this.recordingData = new Map(); // recordId -> events array
  }
  
  async startRecording(tabId, options = {}) {
    console.log('[RecordingService] Starting recording for tab:', tabId);
    
    // Check if we can transition to STARTING state
    if (!this.stateMachine.canTransition(tabId, 'START_RECORDING')) {
      throw new Error('Cannot start recording in current state');
    }
    
    // Transition to STARTING
    this.stateMachine.transition(tabId, 'START_RECORDING');
    
    try {
      const tab = await new Promise((resolve, reject) => {
        tabs.get(tabId, (tab) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
      const isPreNavigation = this.isNewTabUrl(tab.url);
      
      // Create recording state (using existing RecordingState class)
      const recordingState = new RecordingState(
        `recording_${Date.now()}`,
        Date.now()
      );
      
      recordingState.tabId = tabId;
      recordingState.currentUrl = tab.url || 'about:blank';
      recordingState.useWidget = options.useWidget !== false;
      recordingState.detectFlowType(tab.url);
      
      this.recordings.set(tabId, recordingState);
      this.recordingData.set(recordingState.recordId, []);
      this.stateMachine.setRecording(tabId, recordingState);
      
      // Update badge
      await this.updateBadge(tabId, true);
      
      // Add recording-start event
      // For pre-navigation, this will be time-adjusted later
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
      
      // Add initial navigation event if not pre-navigation
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
      
      // Transition to appropriate state
      this.stateMachine.transition(tabId, isPreNavigation ? 'START_PRE_NAV' : 'RECORDING_READY');
      
      // Sync with desktop app for video recording if connected
      if (isWebSocketConnected() && !isPreNavigation) {
        // Use DisplayDetector to get accurate display information
        let displayInfo = null;
        try {
          // Get the browser window this tab belongs to
          const window = await new Promise((resolve, reject) => {
            browserAPI.windows.get(tab.windowId, { populate: false }, (window) => {
              if (browserAPI.runtime.lastError) {
                reject(new Error(browserAPI.runtime.lastError.message));
              } else {
                resolve(window);
              }
            });
          });
          
          // Use DisplayDetector to identify which display contains this window
          const detector = new DisplayDetector();
          displayInfo = await detector.getDisplayForWindow(window);
          
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
          displayInfo: displayInfo  // Send complete display detection info
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
      
      // Handle content script injection
      if (!isPreNavigation) {
        // Inject content script for regular recording
        try {
          await browserAPI.scripting.executeScript({
            target: { tabId },
            files: ['js/content/record-recorder/index.js'],
            world: 'ISOLATED'
          });
          
          // Wait a bit for the script to initialize
          await new Promise(resolve => setTimeout(resolve, 100));
          
          console.log('[RecordingService] Content script injected, it will check recording state');
        } catch (error) {
          console.log('[RecordingService] Failed to inject content script:', error.message);
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
      this.stateMachine.transition(tabId, 'ERROR', { error: error.message });
      throw error;
    }
  }
  
  async stopRecording(tabId, options = {}) {
    console.log('[RecordingService] Stopping recording for tab:', tabId, 'options:', options);
    
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) {
      console.log('[RecordingService] No recording state found for tab:', tabId);
      return null;
    }
    
    // Check if we can transition to STOPPING
    if (!this.stateMachine.canTransition(tabId, 'STOP_RECORDING')) {
      console.warn('Cannot stop recording in current state');
      return null;
    }
    
    this.stateMachine.transition(tabId, 'STOP_RECORDING');
    
    // Only send stop message to content script if this wasn't initiated from the widget
    // This prevents circular messaging that causes context invalidation errors
    if (!options.fromWidget) {
      try {
        await new Promise((resolve) => {
          tabs.sendMessage(tabId, {
            type: MESSAGE_TYPES.STOP_RECORDING,
            action: 'stopRecording'
          }, () => {
            // Check for runtime errors
            if (browserAPI.runtime.lastError) {
              // Silently ignore if tab was closed
              if (!browserAPI.runtime.lastError.message?.includes('tab was closed') &&
                  !browserAPI.runtime.lastError.message?.includes('context invalidated')) {
                console.log('[RecordingService] Could not send stop message:', browserAPI.runtime.lastError.message);
              }
            }
            resolve();
          });
        });
      } catch (error) {
        // Silently handle tab closure errors
        if (!error.message?.includes('tab') && !error.message?.includes('context')) {
          console.log('[RecordingService] Could not send stop message:', error);
        }
      }
    } else {
      console.log('[RecordingService] Skipping stop message to content script (initiated from widget)');
    }
    
    // Add recording-stop event
    try {
      const tab = await new Promise((resolve, reject) => {
        tabs.get(tabId, (tab) => {
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
        url: tab.url || recordingState.currentUrl,
        data: {
          finalUrl: tab.url,
          finalTitle: tab.title,
          // Use actualStartTime if available for accurate duration
          duration: Date.now() - (recordingState.actualStartTime || recordingState.startTime),
          totalEvents: this.recordingData.get(recordingState.recordId)?.length || 0
        }
      });
    } catch (error) {
      console.log('[RecordingService] Could not add stop event:', error);
    }
    
    // Finalize recording
    recordingState.isRecording = false;
    const events = this.recordingData.get(recordingState.recordId) || [];
    
    // Get tab info for metadata
    let tabInfo = { url: recordingState.currentUrl, title: 'Recording' };
    try {
      const tab = await new Promise((resolve, reject) => {
        tabs.get(tabId, (tab) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
      tabInfo = { url: tab.url || recordingState.currentUrl, title: tab.title || 'Recording' };
    } catch (error) {
      console.log('[RecordingService] Could not get tab info:', error);
    }
    
    // Build final recording object
    const recording = {
      id: recordingState.recordId,
      tabId: tabId,
      startTime: recordingState.startTime,
      endTime: Date.now(),
      status: 'stopped',
      url: tabInfo.url,
      title: tabInfo.title,
      events: events,
      // Include time adjustment info for proper playback
      preNavTimeAdjustment: recordingState.preNavTimeAdjustment,
      hasVideoSync: recordingState.hasVideoSync || false
    };
    
    // Stop video sync if it was active
    if (recordingState.hasVideoSync && isWebSocketConnected()) {
      sendViaWebSocket({
        type: 'stopSyncRecording',
        data: {
          recordingId: recordingState.recordId,
          timestamp: Date.now()
        }
      });
      console.log('[RecordingService] Sent stop sync recording to desktop app');
    }
    
    // Export recording - it will check WebSocket connection internally
    try {
      await this.exportRecording(recording);
    } catch (error) {
      console.error('[RecordingService] Failed to export recording:', error);
    }
    
    // Clean up
    this.recordings.delete(tabId);
    this.recordingData.delete(recordingState.recordId);
    
    await this.updateBadge(tabId, false);
    
    // Transition to IDLE
    this.stateMachine.transition(tabId, 'RECORDING_STOPPED');
    
    return recording;
  }
  
  addEvent(tabId, event) {
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) {
      console.warn('[RecordingService] No recording found for tab:', tabId);
      return;
    }
    
    // Adjust timestamp for pre-navigation recordings
    let adjustedEvent = { ...event };
    if (recordingState.preNavTimeAdjustment !== undefined) {
      // Apply time adjustment for pre-nav recordings
      adjustedEvent.timestamp = event.timestamp - recordingState.preNavTimeAdjustment;
    }
    
    const events = this.recordingData.get(recordingState.recordId) || [];
    events.push(adjustedEvent);
    this.recordingData.set(recordingState.recordId, events);
    
    console.log(`[RecordingService] Event added: ${adjustedEvent.type}, Total: ${events.length}`);
  }
  
  async exportRecording(recording) {
    console.log('[RecordingService] Exporting recording:', recording.id);
    console.log('[RecordingService] WebSocket connected:', isWebSocketConnected());
    
    // Get viewport dimensions from the first rrweb event (if available)
    let viewport = { width: 1920, height: 1080 }; // Default values
    const rrwebEvents = recording.events.filter(e => e.type === 'rrweb');
    if (rrwebEvents.length > 0 && rrwebEvents[0].data) {
      const firstEvent = rrwebEvents[0].data;
      if (firstEvent.type === 2 && firstEvent.data?.node?.childNodes) {
        // Try to extract viewport from meta snapshot
        const meta = firstEvent.data;
        if (meta.width && meta.height) {
          viewport = { width: meta.width, height: meta.height };
        }
      }
    }
    
    // Check if desktop app is connected
    if (isWebSocketConnected()) {
      // Send to desktop app
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
      
      console.log('[RecordingService] Sending recording to desktop app...');
      const sent = sendRecordingViaWebSocket(recordingData);
      
      console.log('[RecordingService] Send result:', sent);
      
      if (sent) {
        console.log('[RecordingService] Successfully sent recording to desktop app');
        return; // Don't download locally if sent to app
      } else {
        console.log('[RecordingService] Failed to send to desktop app, downloading locally');
      }
    } else {
      console.log('[RecordingService] WebSocket not connected, downloading locally');
    }
    
    // Download locally if not connected to desktop app
    const json = JSON.stringify(recording, null, 2);
    const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(json)));
    const filename = `recording_${recording.id}_${new Date(recording.startTime).toISOString().replace(/[:.]/g, '-')}.json`;
    
    await new Promise((resolve, reject) => {
      downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, (downloadId) => {
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
  
  async updateBadge(tabId, isRecording) {
    console.log('[RecordingService] Updating badge for tab:', tabId, 'isRecording:', isRecording);
    try {
      // First check if the tab still exists
      await new Promise((resolve, reject) => {
        tabs.get(tabId, (tab) => {
          if (browserAPI.runtime.lastError) {
            reject(new Error(browserAPI.runtime.lastError.message));
          } else {
            resolve(tab);
          }
        });
      });
      
      // Tab exists, update badge
      if (isRecording) {
        await browserAPI.action.setBadgeText({ tabId, text: '•' });
        await browserAPI.action.setBadgeBackgroundColor({ 
          tabId, 
          color: '#EF4444' 
        });
      } else {
        await browserAPI.action.setBadgeText({ tabId, text: '' });
      }
    } catch (error) {
      // Silently ignore badge update errors - tab might have been closed
      // Only log for debugging in development
      if (!error.message?.includes('No tab with id') && 
          !error.message?.includes('tab') &&
          !error.message?.includes('Cannot access')) {
        console.log('[RecordingService] Badge update skipped:', error.message);
      }
    }
  }
  
  isRecording(tabId) {
    return this.stateMachine.isRecording(tabId);
  }
  
  getRecordingState(tabId) {
    const tabState = this.stateMachine.getTabState(tabId);
    const recordingState = this.recordings.get(tabId);
    
    return {
      state: tabState.state,
      metadata: {
        // Use actualStartTime if available (for pre-nav recordings that transitioned)
        // This ensures the widget shows correct time after navigation
        startTime: recordingState?.actualStartTime || recordingState?.startTime,
        recordingId: recordingState?.recordId,
        isPreNavigation: tabState.state === RecordingStates.PRE_NAVIGATION
      },
      shouldInjectScripts: tabState.state === RecordingStates.RECORDING || 
                          tabState.state === RecordingStates.PRE_NAVIGATION
    };
  }
  
  async handleContentScriptReady(tabId, payload) {
    const tabState = this.stateMachine.getTabState(tabId);
    const recordingState = this.recordings.get(tabId);
    
    // Only start recording if we're in RECORDING state (not PRE_NAVIGATION)
    if (tabState.state === RecordingStates.RECORDING && recordingState) {
      console.log('[RecordingService] Content script ready, should start recording');
      return {
        shouldStartRecording: true,
        state: {
          state: tabState.state,
          metadata: {
            // Use actualStartTime if available (for pre-nav recordings that transitioned)
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
  
  isNewTabUrl(url) {
    return !url || url === '' || url === 'about:blank' || 
           url === 'chrome://newtab/' || url === 'edge://newtab/' || 
           url === 'about:newtab' || url.startsWith('chrome://') ||
           url.startsWith('edge://');
  }
  
  // Handle navigation for pre-navigation flow and ongoing recordings
  async handleNavigation(tabId, url, details = {}) {
    console.log('[RecordingService] handleNavigation called for tab:', tabId, 'url:', url, 'details:', details);
    
    const tabState = this.stateMachine.getTabState(tabId);
    const recordingState = this.recordings.get(tabId);
    
    console.log('[RecordingService] Tab state:', tabState.state, 'Recording exists:', !!recordingState);
    
    // Prevent duplicate navigation events
    if (recordingState && recordingState.lastNavigationUrl === url && 
        Date.now() - (recordingState.lastNavigationTime || 0) < 100) {
      console.log('[RecordingService] Skipping duplicate navigation event');
      return;
    }
    
    // Handle pre-navigation flow
    if (tabState.state === RecordingStates.PRE_NAVIGATION && 
        recordingState && !this.isNewTabUrl(url)) {
      
      // Set time adjustment for pre-navigation recordings
      // This makes the first real page navigation start at timestamp 0
      if (recordingState.preNavTimeAdjustment === undefined) {
        recordingState.preNavTimeAdjustment = Date.now() - recordingState.startTime;
        console.log('[RecordingService] Setting pre-nav time adjustment:', recordingState.preNavTimeAdjustment);
      }
      
      // Update recording state
      recordingState.addNavigation(url);
      recordingState.currentUrl = url;
      
      // Transition to RECORDING
      this.stateMachine.transition(tabId, 'NAVIGATION_COMMITTED');
      
      // Send state sync to desktop app
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
      
      // Add navigation event with adjusted timestamp
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
      
      // Track this navigation to prevent duplicates
      recordingState.lastNavigationUrl = url;
      recordingState.lastNavigationTime = Date.now();
      
      // Update the actual start time for the widget
      recordingState.actualStartTime = Date.now();
      
      // Start video sync now that we're on a real page
      if (isWebSocketConnected()) {
        const tab = await new Promise((resolve, reject) => {
          tabs.get(tabId, (tab) => {
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
          console.log('[RecordingService] Sent sync recording request to desktop app (from pre-nav)');
          recordingState.hasVideoSync = true;
        }
      }
      
      // Inject content script now that we're on a real page
      console.log('[RecordingService] Pre-navigation completed, injecting content script for:', url);
      
      try {
        await browserAPI.scripting.executeScript({
          target: { tabId },
          files: ['js/content/record-recorder/index.js'],
          world: 'ISOLATED'
        });
        
        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log('[RecordingService] Content script injected, waiting for it to be ready');
      } catch (error) {
        console.log('[RecordingService] Failed to inject content script:', error.message);
      }
    }
    
    // Handle navigation during active recording (cross-page navigation)
    else if (tabState.state === RecordingStates.RECORDING && 
             recordingState && !this.isNewTabUrl(url)) {
      
      console.log('[RecordingService] Navigation during active recording, re-injecting content script');
      
      // Update recording state
      recordingState.addNavigation(url);
      recordingState.currentUrl = url;
      
      // Add navigation event (this should NOT be time-adjusted as it's not the first page)
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
      
      // Track this navigation to prevent duplicates
      recordingState.lastNavigationUrl = url;
      recordingState.lastNavigationTime = Date.now();
      
      // Re-inject content script for the new page
      try {
        await browserAPI.scripting.executeScript({
          target: { tabId },
          files: ['js/content/record-recorder/index.js'],
          world: 'ISOLATED'
        });
        
        console.log('[RecordingService] Content script re-injected for navigation to:', url);
        
        // Important: When re-injecting for cross-page navigation, we need to ensure
        // the widget gets the correct start time (not adjusted for subsequent pages)
        // The handleContentScriptReady will handle this correctly
      } catch (error) {
        console.log('[RecordingService] Failed to inject content script:', error.message);
      }
    }
  }
  
  // Clean up when tab is closed
  async cleanupTab(tabId) {
    if (this.isRecording(tabId)) {
      console.log('[RecordingService] Tab closed while recording, stopping recording for tab:', tabId);
      
      const recordingState = this.recordings.get(tabId);
      if (recordingState) {
        // Add a special event indicating tab was closed
        this.addEvent(tabId, {
          timestamp: Date.now(),
          type: 'recording-stop',
          url: recordingState.currentUrl || 'unknown',
          data: {
            reason: 'tab_closed',
            finalUrl: recordingState.currentUrl,
            // Use actualStartTime if available for accurate duration
            duration: Date.now() - (recordingState.actualStartTime || recordingState.startTime),
            totalEvents: this.recordingData.get(recordingState.recordId)?.length || 0
          }
        });
        
        // Export the recording before cleanup
        const events = this.recordingData.get(recordingState.recordId) || [];
        const recording = {
          id: recordingState.recordId,
          tabId: tabId,
          startTime: recordingState.startTime,
          endTime: Date.now(),
          status: 'stopped_tab_closed',
          url: recordingState.currentUrl,
          title: 'Recording (Tab Closed)',
          events: events,
          // Include time adjustment info for proper playback
          preNavTimeAdjustment: recordingState.preNavTimeAdjustment,
          hasVideoSync: recordingState.hasVideoSync || false
        };
        
        // Stop video sync if it was active
        if (recordingState.hasVideoSync && isWebSocketConnected()) {
          sendViaWebSocket({
            type: 'stopSyncRecording',
            data: {
              recordingId: recordingState.recordId,
              timestamp: Date.now()
            }
          });
          console.log('[RecordingService] Sent stop sync recording to desktop app (tab closed)');
        }
        
        // Export the recording (will send to app if connected, otherwise download locally)
        try {
          await this.exportRecording(recording);
        } catch (error) {
          console.log('[RecordingService] Failed to export recording on tab close:', error.message);
        }
      }
    }
    
    // Clean up state
    this.recordings.delete(tabId);
    this.recordingData.delete(this.recordings.get(tabId)?.recordId);
    this.stateMachine.cleanupTab(tabId);
  }
  
  // Additional methods for backward compatibility
  
  setWidgetPreference(tabId, useWidget) {
    // Store widget preference for future recording
    if (!this.widgetPreferences) {
      this.widgetPreferences = new Map();
    }
    this.widgetPreferences.set(tabId, useWidget);
  }
  
  async cancelRecording(tabId, options = {}) {
    // Same as stop but without download
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return { success: false, error: 'Not recording' };
    
    // Stop without exporting
    this.stateMachine.transition(tabId, 'STOP_RECORDING');
    
    // Clean up
    this.recordings.delete(tabId);
    this.recordingData.delete(recordingState.recordId);
    
    await this.updateBadge(tabId, false);
    this.stateMachine.transition(tabId, 'RECORDING_STOPPED');
    
    return { success: true };
  }
  
  async downloadRecord(url, filename) {
    // Download a recording file from URL
    await new Promise((resolve) => {
      downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }, () => resolve());
    });
  }
  
  getNetworkData(tabId) {
    // Get network data for a tab
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return [];
    
    const events = this.recordingData.get(recordingState.recordId) || [];
    return events
      .filter(e => e.type === 'network')
      .map(e => e.data);
  }
  
  accumulateRecordData(tabId, recordData) {
    // Accumulate data from a page before navigation
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return;
    
    if (recordData.events) {
      recordData.events.forEach(event => {
        this.addEvent(tabId, {
          timestamp: event.timestamp || Date.now(),
          type: 'rrweb',
          url: recordData.url || '',
          data: event
        });
      });
    }
    
    if (recordData.console) {
      recordData.console.forEach(log => {
        this.addEvent(tabId, {
          timestamp: log.timestamp || Date.now(),
          type: 'console',
          url: recordData.url || '',
          data: log
        });
      });
    }
    
    if (recordData.network) {
      recordData.network.forEach(req => {
        this.addEvent(tabId, {
          timestamp: req.timestamp || Date.now(),
          type: 'network',
          url: recordData.url || '',
          data: req
        });
      });
    }
  }
  
  getAccumulatedRecordData(tabId) {
    // Get all accumulated data for a tab
    const recordingState = this.recordings.get(tabId);
    if (!recordingState) return null;
    
    const events = this.recordingData.get(recordingState.recordId) || [];
    
    // Convert to old format for compatibility
    return {
      recordId: recordingState.recordId,
      events: events.filter(e => e.type === 'rrweb').map(e => e.data),
      console: events.filter(e => e.type === 'console').map(e => e.data),
      network: events.filter(e => e.type === 'network').map(e => e.data),
      storage: events.filter(e => e.type === 'storage').map(e => e.data),
      url: recordingState.currentUrl
    };
  }
  
  markPageVisited(tabId) {
    // Mark that first page has been visited (for pre-nav flow)
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