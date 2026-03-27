/**
 * Content script that bridges the recording widget with the background service.
 *
 * Architecture:
 * - ONE global window message listener, registered exactly once per DOM context.
 * - ONE WorkflowRecorder instance at a time, swapped on re-injection.
 * - All stop requests go to background (single authority) — content script
 *   never initiates state transitions, only relays user actions.
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { adaptInjectedEvent, NewMessageTypes } from '../shared/message-adapter.js';

// Browser API reference
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

class WorkflowRecorder {
  constructor() {
    this.isRecording = false;
    this.recordId = null;
    this.widgetInjected = false;
    this.recorderReady = false;
    this.useWidget = false;
    this.isPreNav = false;
    this.startTime = null;
    this.recorderStarted = false;

    this.setupExtensionMessageListener();
    this.notifyBackgroundReady();
  }

  /**
   * Listen for messages from the background script (via chrome.runtime.onMessage).
   * This is per extension context and is automatically cleaned up on re-injection.
   */
  setupExtensionMessageListener() {
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Received message:', message.type || message.action);

      const messageType = message.type || message.action;

      switch (messageType) {
        case 'startRecording':
        case MESSAGE_TYPES.START_RECORDING:
          this.handleStartRecording(message.data || message);
          sendResponse({ success: true });
          break;

        case 'stopRecording':
        case MESSAGE_TYPES.STOP_RECORDING:
          this.handleStopRecording();
          sendResponse({ success: true });
          break;

        case 'updateWidget':
        case MESSAGE_TYPES.UPDATE_RECORDING_WIDGET:
          this.handleUpdateWidget(message.data || message);
          sendResponse({ success: true });
          break;

        case 'RECORDING_STATE_CHANGED':
        case 'recordingStateChanged':
          this.handleStateChange(message.data || message.payload);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false });
      }

      return true;
    });
  }

  async notifyBackgroundReady() {
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: NewMessageTypes.CONTENT_SCRIPT_READY,
        action: 'contentScriptReady',
        payload: {
          url: window.location.href
        }
      });

      if (response?.shouldStartRecording) {
        this.handleStartRecording({
          recordId: response.state?.metadata?.recordingId,
          useWidget: true,
          isPreNav: response.state?.metadata?.isPreNavigation,
          startTime: response.state?.metadata?.startTime
        });
      }
    } catch (error) {
      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Could not notify background:', error);
    }
  }

  // ── Window message handler (called by global listener) ─────────────

  handleWindowMessage(event) {
    if (event.source !== window) return;

    // Widget stop button → relay to background (single authority for stop)
    if (event.data?.type === 'OPEN_HEADERS_RECORDING_WIDGET_STOP') {
      if (!this.isRecording) return;

      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Widget stop button clicked');
      browserAPI.runtime.sendMessage({
        type: 'STOP_RECORDING_FROM_WIDGET'
      }).catch(error => {
        if (!error.message?.includes('context invalidated') &&
            !error.message?.includes('message port closed')) {
          console.error(new Date().toISOString(), 'ERROR', '[WorkflowRecorder]', 'Failed to send stop message:', error);
        }
      });
      return;
    }

    // Recorder messages (from injected rrweb recorder)
    if (event.data?.source !== 'open-headers-recorder') return;

    const { type, data, timestamp } = event.data;

    if (type === 'ready') {
      this.recorderReady = true;
      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Recorder ready');

      if (this.isRecording) {
        this.startRecorder();
      }
    } else if (type === 'pong') {
      this.recorderReady = true;
    } else if (this.isRecording && browserAPI.runtime?.id) {
      const adaptedMessage = adaptInjectedEvent({ type, data, timestamp });

      browserAPI.runtime.sendMessage(adaptedMessage).catch(error => {
        if (!error.message?.includes('context invalidated') &&
            !error.message?.includes('message port closed') &&
            !error.message?.includes('extension context invalidated')) {
          console.error(new Date().toISOString(), 'ERROR', '[WorkflowRecorder]', 'Failed to forward event:', error);
        }
      });
    }
  }

  // ── Recording lifecycle ────────────────────────────────────────────

  async handleStartRecording(data) {
    console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Starting recording:', data);

    this.isRecording = true;
    this.recordId = data.recordId;
    this.useWidget = data.useWidget !== false;
    this.isPreNav = data.isPreNav || false;
    this.startTime = data.startTime || Date.now();

    await this.injectScripts();

    if (this.useWidget) {
      await this.injectWidget();
    }

    this.startRecorder();
  }

  handleStopRecording() {
    if (!this.isRecording && !this.widgetInjected) return;
    console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Stopping recording');

    this.isRecording = false;
    this.recordId = null;

    this.stopRecorder();

    if (this.widgetInjected) {
      this.removeWidget();
    }
  }

  handleUpdateWidget(data) {
    window.postMessage({
      source: 'open-headers-content',
      action: 'updateWidget',
      data: data
    }, '*');
  }

  handleStateChange(data) {
    console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'State changed:', data);

    if (data.startTime) {
      this.startTime = data.startTime;
      if (this.widgetInjected) {
        this.handleUpdateWidget({ startTime: data.startTime });
      }
    }

    if (data.state === 'recording' && this.isPreNav) {
      // Transitioned from pre-nav to recording
      this.isPreNav = false;
      this.isRecording = true;
      this.handleUpdateWidget({
        status: 'recording',
        startTime: data.startTime || this.startTime || Date.now()
      });
    } else if (data.state === 'idle' || data.state === 'stopping') {
      this.handleStopRecording();
    } else {
      // Sync recording flag with background state
      this.isRecording = data.isRecording || false;
      this.isPreNav = data.isPreNav || false;
    }
  }

  // ── Script injection ───────────────────────────────────────────────

  async injectScripts() {
    const existingRrweb = document.querySelector('script[data-recorder="rrweb"]');
    const existingRecorder = document.querySelector('script[data-recorder="main"]');

    if (existingRrweb && existingRecorder) {
      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Scripts already injected, triggering re-initialization');
      window.postMessage({
        source: 'open-headers-content',
        action: 'reinitRecorder'
      }, '*');

      await new Promise(resolve => setTimeout(resolve, 100));
      this.recorderReady = false;
      return;
    }

    const target = document.head || document.documentElement;
    if (!target) {
      console.error(new Date().toISOString(), 'ERROR', '[WorkflowRecorder]', 'Cannot inject scripts - no injection target');
      return;
    }

    try {
      const rrwebScript = document.createElement('script');
      rrwebScript.src = browserAPI.runtime.getURL('js/lib/rrweb.js');
      rrwebScript.dataset.recorder = 'rrweb';
      target.appendChild(rrwebScript);

      await new Promise((resolve) => {
        rrwebScript.onload = resolve;
        rrwebScript.onerror = () => {
          console.error(new Date().toISOString(), 'ERROR', '[WorkflowRecorder]', 'Failed to load rrweb');
          resolve();
        };
      });

      const recorderScript = document.createElement('script');
      recorderScript.src = browserAPI.runtime.getURL('js/recording/inject/recorder.js');
      recorderScript.dataset.recorder = 'main';
      target.appendChild(recorderScript);

      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Scripts injected successfully');

      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(new Date().toISOString(), 'ERROR', '[WorkflowRecorder]', 'Failed to inject scripts:', error);
    }
  }

  async injectWidget() {
    if (this.widgetInjected) return;

    const widgetScript = document.createElement('script');
    widgetScript.src = browserAPI.runtime.getURL('js/recording/inject/recording-widget.js');
    widgetScript.dataset.recorder = 'widget';

    if (document.head) {
      document.head.appendChild(widgetScript);
    } else if (document.documentElement) {
      document.documentElement.appendChild(widgetScript);
    }

    this.widgetInjected = true;

    setTimeout(() => {
      window.postMessage({
        source: 'open-headers-content',
        action: 'initWidget',
        data: {
          recordId: this.recordId,
          isPreNav: this.isPreNav,
          startTime: this.startTime
        }
      }, '*');
    }, 100);
  }

  removeWidget() {
    window.postMessage({
      source: 'open-headers-content',
      action: 'removeWidget'
    }, '*');
    this.widgetInjected = false;
  }

  startRecorder() {
    if (this.recorderStarted) {
      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Recorder already started');
      return;
    }

    if (!this.recorderReady) {
      console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Recorder not ready yet, will retry...');
      setTimeout(() => {
        if (this.isRecording && !this.recorderStarted) {
          this.startRecorder();
        }
      }, 100);
      return;
    }

    this.recorderStarted = true;

    window.postMessage({
      source: 'open-headers-content',
      action: 'startRecording',
      data: {
        recordId: this.recordId
      }
    }, '*');
  }

  stopRecorder() {
    this.recorderStarted = false;

    window.postMessage({
      source: 'open-headers-content',
      action: 'stopRecording'
    }, '*');
  }

  cleanup() {
    console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Cleaning up...');

    try {
      if (this.isRecording) {
        this.stopRecorder();
      }

      if (this.widgetInjected) {
        this.removeWidget();
      }
    } catch (error) {
      // Silently ignore cleanup errors (page might be unloading)
    }

    this.isRecording = false;
    this.recordId = null;
    this.recorderStarted = false;
  }
}

// ── Global listener registration (exactly once per DOM context) ──────
//
// The window message listener is registered ONCE and delegates to the
// current instance via a mutable reference. On re-injection, we swap
// the instance but do NOT add another listener — this is what prevents
// the duplicate STOP_RECORDING_FROM_WIDGET bug.

if (!window.__openHeadersGlobalListenerRegistered) {
  window.__openHeadersGlobalListenerRegistered = true;

  window.addEventListener('message', (event) => {
    const instance = window.__workflowRecorderInstance;
    if (instance) {
      instance.handleWindowMessage(event);
    }
  });

  window.addEventListener('pagehide', () => {
    const instance = window.__workflowRecorderInstance;
    if (instance) {
      instance.cleanup();
    }
  });
}

// ── Instance management ──────────────────────────────────────────────

if (window.__workflowRecorderInstance) {
  console.log(new Date().toISOString(), 'INFO ', '[WorkflowRecorder]', 'Re-injection detected, swapping instance');
  window.__workflowRecorderInstance.cleanup();
}

window.__workflowRecorderInstance = new WorkflowRecorder();
