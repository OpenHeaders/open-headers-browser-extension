/**
 * Enhanced content script that bridges the existing widget with new recording logic
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { adaptInjectedEvent, NewMessageTypes } from '../shared/message-adapter.js';

// Browser API reference
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

class RecordRecorder {
  constructor() {
    this.isRecording = false;
    this.recordId = null;
    this.widgetInjected = false;
    this.recorderReady = false;
    this.useWidget = false;
    this.isPreNav = false;
    this.startTime = null;
    this.recorderStarted = false;
    
    // Initialize
    this.setupMessageListeners();
    this.notifyBackgroundReady();
  }
  
  setupMessageListeners() {
    // Listen for messages from background
    browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[RecordRecorder] Received message:', message.type || message.action);
      
      // Handle both old and new message formats
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
    
    // Listen for messages from injected recorder
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      // Handle widget stop button click
      if (event.data?.type === 'OPEN_HEADERS_RECORDING_WIDGET_STOP') {
        console.log('[RecordRecorder] Widget stop button clicked');
        // Send stop recording message to background
        browserAPI.runtime.sendMessage({
          type: 'STOP_RECORDING_FROM_WIDGET'
        }).catch(error => {
          // Only log if it's not a context error
          if (!error.message?.includes('context invalidated') && 
              !error.message?.includes('message port closed')) {
            console.error('[RecordRecorder] Failed to send stop message:', error);
          }
        });
        return;
      }
      
      // Handle recorder messages
      if (event.data?.source !== 'open-headers-recorder') return;
      
      const { type, data, timestamp } = event.data;
      
      if (type === 'ready') {
        this.recorderReady = true;
        console.log('[RecordRecorder] Recorder ready');
        
        // If we're already recording, start the recorder
        if (this.isRecording) {
          this.startRecorder();
        }
      } else if (type === 'pong') {
        // Recorder is responsive
        this.recorderReady = true;
      } else if (this.isRecording && browserAPI.runtime?.id) {
        // Forward recording data to background
        const adaptedMessage = adaptInjectedEvent({
          type,
          data,
          timestamp
        });
        
        browserAPI.runtime.sendMessage(adaptedMessage).catch(error => {
          // Silently ignore context invalidated errors (tab closed, navigation, etc)
          if (!error.message?.includes('context invalidated') && 
              !error.message?.includes('message port closed') &&
              !error.message?.includes('extension context invalidated')) {
            console.error('[RecordRecorder] Failed to forward event:', error);
          }
        });
      }
    });
    
    // Clean up on page unload
    window.addEventListener('pagehide', () => {
      this.cleanup();
    });
  }
  
  async notifyBackgroundReady() {
    try {
      // Check if we're already recording
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
      console.log('[RecordRecorder] Could not notify background:', error);
    }
  }
  
  async handleStartRecording(data) {
    console.log('[RecordRecorder] Starting recording:', data);
    
    this.isRecording = true;
    this.recordId = data.recordId;
    this.useWidget = data.useWidget !== false;
    this.isPreNav = data.isPreNav || false;
    this.startTime = data.startTime || Date.now();
    
    // Inject scripts if not already done
    await this.injectScripts();
    
    // Inject widget if requested
    if (this.useWidget) {
      await this.injectWidget();
    }
    
    // Start recording
    this.startRecorder();
  }
  
  handleStopRecording() {
    console.log('[RecordRecorder] Stopping recording');
    
    this.isRecording = false;
    this.recordId = null;
    
    // Stop recorder
    this.stopRecorder();
    
    // Remove widget
    if (this.widgetInjected) {
      this.removeWidget();
    }
  }
  
  handleUpdateWidget(data) {
    // Update widget through existing mechanism
    window.postMessage({
      source: 'open-headers-content',
      action: 'updateWidget',
      data: data
    }, '*');
  }
  
  handleStateChange(data) {
    console.log('[RecordRecorder] State changed:', data);
    
    // Update recording state
    this.isRecording = data.isRecording || false;
    this.isPreNav = data.isPreNav || false;
    
    // Update startTime if provided
    if (data.startTime) {
      this.startTime = data.startTime;
      // If widget exists, update it with the new start time
      if (this.widgetInjected) {
        this.handleUpdateWidget({
          startTime: data.startTime
        });
      }
    }
    
    if (data.state === 'recording' && this.isPreNav) {
      // Transitioned from pre-nav to recording
      this.isPreNav = false;
      this.handleUpdateWidget({
        status: 'recording',
        startTime: data.startTime || this.startTime || Date.now()
      });
    } else if (data.state === 'idle' || data.state === 'stopping') {
      this.handleStopRecording();
    }
  }
  
  async injectScripts() {
    // Check if scripts already injected
    const existingRrweb = document.querySelector('script[data-recorder="rrweb"]');
    const existingRecorder = document.querySelector('script[data-recorder="main"]');
    
    if (existingRrweb && existingRecorder) {
      console.log('[RecordRecorder] Scripts already injected, triggering re-initialization');
      // Scripts exist, but we need to re-initialize the recorder
      // Send a re-init message to the existing recorder
      window.postMessage({
        source: 'open-headers-content',
        action: 'reinitRecorder'
      }, '*');
      
      // Wait for re-initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Reset the ready flag so we wait for the new ready signal
      this.recorderReady = false;
      return;
    }
    
    const target = document.head || document.documentElement;
    if (!target) {
      console.error('[RecordRecorder] Cannot inject scripts - no injection target');
      return;
    }
    
    try {
      // Inject rrweb first
      const rrwebScript = document.createElement('script');
      rrwebScript.src = browserAPI.runtime.getURL('js/lib/rrweb.js');
      rrwebScript.dataset.recorder = 'rrweb';
      target.appendChild(rrwebScript);
      
      // Wait for rrweb to load
      await new Promise((resolve) => {
        rrwebScript.onload = resolve;
        rrwebScript.onerror = () => {
          console.error('[RecordRecorder] Failed to load rrweb');
          resolve();
        };
      });
      
      // Inject recorder
      const recorderScript = document.createElement('script');
      recorderScript.src = browserAPI.runtime.getURL('js/recording/inject/recorder.js');
      recorderScript.dataset.recorder = 'main';
      target.appendChild(recorderScript);
      
      console.log('[RecordRecorder] Scripts injected successfully');
      
      // Give scripts time to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('[RecordRecorder] Failed to inject scripts:', error);
    }
  }
  
  async injectWidget() {
    if (this.widgetInjected) return;
    
    // Inject the existing widget
    const widgetScript = document.createElement('script');
    widgetScript.src = browserAPI.runtime.getURL('js/recording/inject/recording-widget.js');
    widgetScript.dataset.recorder = 'widget';
    
    if (document.head) {
      document.head.appendChild(widgetScript);
    } else if (document.documentElement) {
      document.documentElement.appendChild(widgetScript);
    }
    
    this.widgetInjected = true;
    
    // Initialize widget with current state
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
    // Avoid double-starting
    if (this.recorderStarted) {
      console.log('[RecordRecorder] Recorder already started');
      return;
    }
    
    // Check if recorder is ready
    if (!this.recorderReady) {
      console.log('[RecordRecorder] Recorder not ready yet, will retry...');
      setTimeout(() => {
        if (this.isRecording && !this.recorderStarted) {
          this.startRecorder();
        }
      }, 100);
      return;
    }
    
    // Mark as started
    this.recorderStarted = true;
    
    // Send start command to recorder
    window.postMessage({
      source: 'open-headers-content',
      action: 'startRecording',
      data: {
        recordId: this.recordId
      }
    }, '*');
  }
  
  stopRecorder() {
    // Reset started flag
    this.recorderStarted = false;
    
    // Send stop command to recorder
    window.postMessage({
      source: 'open-headers-content',
      action: 'stopRecording'
    }, '*');
  }
  
  cleanup() {
    console.log('[RecordRecorder] Cleaning up...');
    
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

// Initialize and handle re-injection properly
if (!window.__recordRecorderInitialized) {
  window.__recordRecorderInitialized = true;
  window.__recordRecorderInstance = new RecordRecorder();
} else {
  // Re-injection detected - cleanup old instance and create new one
  console.log('[RecordRecorder] Re-injection detected, resetting instance');
  if (window.__recordRecorderInstance) {
    window.__recordRecorderInstance.cleanup();
  }
  window.__recordRecorderInstance = new RecordRecorder();
}