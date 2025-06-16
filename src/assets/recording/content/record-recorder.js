import { MESSAGE_TYPES } from '../shared/constants.js';

// Use the browser API wrapper to ensure cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

class RecordRecorder {
  constructor() {
    this.isRecording = false;
    this.recordId = null;
    this.recordingStartTime = null;
    this.scriptsInjected = false;
    this.pendingRecording = null;
    
    // Inject scripts early if page is ready
    this.injectScriptsIfReady();
    this.setupMessageHandlers();
  }
  
  setupMessageHandlers() {
    // Listen for messages from background script or popup
    browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
      
      switch (request.type) {
        case MESSAGE_TYPES.START_RECORDING:
          this.startRecording(request.recordId || `record-${Date.now()}`);
          sendResponse({ success: true });
          break;
          
        case MESSAGE_TYPES.STOP_RECORDING:
          this.stopRecording();
          sendResponse({ success: true });
          break;
          
        case MESSAGE_TYPES.CANCEL_RECORDING:
          this.cancelRecording();
          sendResponse({ success: true });
          break;
          
        case MESSAGE_TYPES.GET_RECORDING_STATE:
          sendResponse({
            isRecording: this.isRecording,
            recordId: this.recordId
          });
          break;
      }
      return true;
    });
    
    // Listen for messages from page script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      switch (event.data.type) {
        case 'RECORDER_READY':
          this.scriptsInjected = true;
          
          // If we have a pending recording, start it
          if (this.pendingRecording) {
            window.postMessage({
              type: 'START_RECORDING',
              recordId: this.pendingRecording
            }, '*');
            this.pendingRecording = null;
          }
          break;
          
        case 'RECORDING_STATS':
          // Could send stats to popup if needed
          break;
          
        case 'RECORDING_COMPLETE':
          this.handleRecordingComplete(event.data.record);
          break;
      }
    });
  }
  
  async startRecording(recordId) {
    this.recordId = recordId;
    this.isRecording = true;
    this.recordingStartTime = Date.now();
    
    // Store pending recording if scripts aren't ready
    this.pendingRecording = recordId;
    
    // Inject recording scripts if not already injected
    if (!this.scriptsInjected) {
      try {
        await this.injectScripts();
      } catch (error) {
      }
    } else {
      // Scripts already injected, start recording immediately
      window.postMessage({
        type: 'START_RECORDING',
        recordId: recordId
      }, '*');
      this.pendingRecording = null;
    }
  }
  
  stopRecording() {
    this.isRecording = false;
    
    // Send stop message to page script
    window.postMessage({
      type: 'STOP_RECORDING'
    }, '*');
  }
  
  cancelRecording() {
    this.isRecording = false;
    this.recordId = null;
    this.recordingStartTime = null;
    this.pendingRecording = null;
    
    // Send cancel message to page script to clean up without saving
    window.postMessage({
      type: 'CANCEL_RECORDING'
    }, '*');
    
  }
  
  async injectScriptsIfReady() {
    // Only inject if DOM is ready and scripts haven't been injected yet
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.injectScriptsIfReady());
      return;
    }
    
    if (!this.scriptsInjected && !await this.areScriptsInjected()) {
      await this.injectScripts();
    }
  }
  
  async areScriptsInjected() {
    // Check if recorder is already injected by looking for a marker element
    const marker = document.querySelector('meta[name="oh-recorder-injected"]');
    return !!marker;
  }
  
  async injectScripts() {
    try {
      // Add marker to indicate scripts are injected
      const marker = document.createElement('meta');
      marker.name = 'oh-recorder-injected';
      marker.content = 'true';
      document.head.appendChild(marker);
      
      // Inject rrweb first
      const rrwebScript = document.createElement('script');
      rrwebScript.src = browserAPI.runtime.getURL('js/lib/rrweb.js');
      
      await new Promise((resolve, reject) => {
        rrwebScript.onload = () => {
          this.scriptsInjected = true;
          resolve();
        };
        rrwebScript.onerror = (error) => {
          reject(error);
        };
        document.documentElement.appendChild(rrwebScript);
      });
      
      // Then inject our simple recorder
      const recorderScript = document.createElement('script');
      recorderScript.src = browserAPI.runtime.getURL('js/recording/inject/recorder.js');
      
      await new Promise((resolve, reject) => {
        recorderScript.onload = () => {
          // Send message to window that recorder is ready
          window.postMessage({ type: 'RECORDER_READY' }, '*');
          resolve();
        };
        recorderScript.onerror = (error) => {
          reject(error);
        };
        document.documentElement.appendChild(recorderScript);
      });
    } catch (error) {
      throw error;
    }
  }
  
  async handleRecordingComplete(record) {
    
    // Get network data captured by the extension
    try {
      const response = await browserAPI.runtime.sendMessage({
        type: 'GET_EXTENSION_NETWORK_DATA'
      });
      
      if (response && response.networkData) {
        // Merge the network data
        record.network = this.mergeNetworkData(record.network || [], response.networkData);
      }
    } catch (error) {
    }
    
    // Get all cookies using extension permissions
    try {
      const cookieResponse = await browserAPI.runtime.sendMessage({
        type: 'GET_ALL_COOKIES'
      });
      
      if (cookieResponse && cookieResponse.cookies) {
        
        // Merge with page-captured cookies
        const pageCookieNames = new Set(record.storage.cookies.map(c => c.name));
        const allCookies = [...record.storage.cookies];
        
        // Add cookies from extension that weren't captured by page
        cookieResponse.cookies.forEach(cookie => {
          if (!pageCookieNames.has(cookie.name)) {
            allCookies.push({
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              httpOnly: cookie.httpOnly,
              secure: cookie.secure,
              sameSite: cookie.sameSite,
              expirationDate: cookie.expirationDate,
              accessible: !cookie.httpOnly
            });
          }
        });
        
        record.storage.cookies = allCookies;
      }
    } catch (error) {
    }
    
    // Create the complete export
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      extension: 'Open Headers',
      record: record
    };
    
    // Convert to JSON
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Generate filename
    const date = new Date();
    const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `open-headers_record_${dateStr}.json`;
    
    // Download directly from content script
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    // Clean up
    this.recordId = null;
    
    // Notification is now shown in the popup instead of in-page widget
  }
  
  mergeNetworkData(pageNetwork, extensionNetwork) {
    // Create a map of page network requests by URL and timestamp for matching
    const pageNetworkMap = new Map();
    pageNetwork.forEach(req => {
      const key = `${req.url}-${Math.floor(req.timestamp / 100)}`; // Group by 100ms windows
      pageNetworkMap.set(key, req);
    });
    
    // Merge extension network data
    const merged = [];
    const processedKeys = new Set();
    
    extensionNetwork.forEach(extReq => {
      const key = `${extReq.url}-${Math.floor(extReq.timestamp / 100)}`;
      const pageReq = pageNetworkMap.get(key);
      
      if (pageReq) {
        // Merge the data - extension data has all headers, page data might have response body
        merged.push({
          ...pageReq,
          ...extReq,
          // Preserve these from page data
          timestamp: pageReq.timestamp,
          responseBody: pageReq.responseBody,
          requestBody: pageReq.requestBody,
          initiator: pageReq.initiator,
          // Use headers from extension (more complete)
          requestHeaders: extReq.requestHeaders,
          responseHeaders: extReq.responseHeaders
        });
        processedKeys.add(key);
      } else {
        // Extension-only request
        merged.push(extReq);
      }
    });
    
    // Add any page-only requests that weren't matched
    pageNetwork.forEach(req => {
      const key = `${req.url}-${Math.floor(req.timestamp / 100)}`;
      if (!processedKeys.has(key)) {
        merged.push(req);
      }
    });
    
    // Sort by timestamp
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }
}

// Initialize recorder
const recorder = new RecordRecorder();
