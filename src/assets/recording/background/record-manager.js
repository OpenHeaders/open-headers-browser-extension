import { MESSAGE_TYPES } from '../shared/constants.js';
import { runtime, tabs as browserTabs } from '../../../utils/browser-api.js';

class RecordManager {
  constructor() {
    this.recordingTabs = new Map(); // tabId -> recording state
    this.networkRequests = new Map(); // tabId -> array of network requests
    this.pendingRequests = new Map(); // requestId -> request data
    this.setupMessageHandlers();
    this.setupNetworkInterception();
  }
  
  setupMessageHandlers() {
    // Message handling is now done in background.js to avoid conflicts
    
    // Clean up when tab closes
    if (browserTabs.onRemoved) {
      browserTabs.onRemoved.addListener((tabId) => {
        this.recordingTabs.delete(tabId);
        this.networkRequests.delete(tabId);
      });
    }
    
    // Listen for messages from content script
    runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'GET_EXTENSION_NETWORK_DATA' && sender.tab) {
        const tabId = sender.tab.id;
        const networkData = this.networkRequests.get(tabId) || [];
        sendResponse({ networkData: networkData });
        return true; // Keep channel open for async response
      }
      
      if (message.type === 'GET_ALL_COOKIES' && sender.tab) {
        this.getAllCookies(sender.tab.url).then(cookies => {
          sendResponse({ cookies: cookies });
        }).catch(error => {
          sendResponse({ cookies: [] });
        });
        return true; // Keep channel open for async response
      }
    });
  }
  
  setupNetworkInterception() {
    const chrome = globalThis.chrome || globalThis.browser;
    
    if (!chrome?.webRequest) {
      return;
    }
    
    // Options to get headers - MV3 requires 'extraHeaders' to see all headers
    const requestOptions = ['requestHeaders', 'extraHeaders'];
    const responseOptions = ['responseHeaders', 'extraHeaders'];
    
    // Monitor request headers - use onBeforeSendHeaders to see final headers
    chrome.webRequest.onBeforeSendHeaders?.addListener(
      (details) => {
        // Only track requests from tabs we're recording
        if (!this.recordingTabs.has(details.tabId)) return;
        
        const request = {
          id: details.requestId,
          tabId: details.tabId,
          url: details.url,
          method: details.method,
          type: details.type,
          timestamp: details.timeStamp,
          requestHeaders: {},
          responseHeaders: {}
        };
        
        // Capture ALL request headers
        if (details.requestHeaders) {
          details.requestHeaders.forEach(header => {
            // Store with lowercase keys for consistency
            request.requestHeaders[header.name.toLowerCase()] = header.value;
          });
        }
        
        this.pendingRequests.set(details.requestId, request);
      },
      { urls: ["<all_urls>"] },
      requestOptions
    );
    
    // If onBeforeSendHeaders is not available, fall back to onSendHeaders
    if (!chrome.webRequest.onBeforeSendHeaders && chrome.webRequest.onSendHeaders) {
      chrome.webRequest.onSendHeaders.addListener(
        (details) => {
          if (!this.recordingTabs.has(details.tabId)) return;
          
          const request = {
            id: details.requestId,
            tabId: details.tabId,
            url: details.url,
            method: details.method,
            type: details.type,
            timestamp: details.timeStamp,
            requestHeaders: {},
            responseHeaders: {}
          };
          
          if (details.requestHeaders) {
            details.requestHeaders.forEach(header => {
              request.requestHeaders[header.name.toLowerCase()] = header.value;
            });
          }
          
          this.pendingRequests.set(details.requestId, request);
        },
        { urls: ["<all_urls>"] },
        requestOptions
      );
    }
    
    // Also track requests without headers if the above events aren't available
    if (!chrome.webRequest.onBeforeSendHeaders && !chrome.webRequest.onSendHeaders) {
      chrome.webRequest.onBeforeRequest.addListener(
        (details) => {
          if (!this.recordingTabs.has(details.tabId)) return;
          
          const request = {
            id: details.requestId,
            tabId: details.tabId,
            url: details.url,
            method: details.method,
            type: details.type,
            timestamp: details.timeStamp,
            requestHeaders: {},
            responseHeaders: {}
          };
          
          this.pendingRequests.set(details.requestId, request);
        },
        { urls: ["<all_urls>"] }
      );
    }
    
    // Capture response headers
    chrome.webRequest.onHeadersReceived?.addListener(
      (details) => {
        const request = this.pendingRequests.get(details.requestId);
        if (!request) return;
        
        // Update with response data
        request.status = details.statusCode;
        request.statusLine = details.statusLine;
        
        // Capture ALL response headers
        if (details.responseHeaders) {
          details.responseHeaders.forEach(header => {
            request.responseHeaders[header.name.toLowerCase()] = header.value;
          });
        }
      },
      { urls: ["<all_urls>"] },
      responseOptions
    );
    
    // Handle completed requests
    chrome.webRequest.onCompleted.addListener(
      (details) => {
        const request = this.pendingRequests.get(details.requestId);
        if (!request) return;
        
        // Calculate duration
        request.endTime = details.timeStamp;
        request.duration = request.endTime - request.timestamp;
        
        // Get the recording state to have the record start time
        const recordingState = this.recordingTabs.get(request.tabId);
        const recordStartTime = recordingState ? recordingState.startTime : 0;
        
        // Add to the recording record's network data
        if (!this.networkRequests.has(request.tabId)) {
          this.networkRequests.set(request.tabId, []);
        }
        
        const tabNetworkData = this.networkRequests.get(request.tabId);
        
        // Get the network entry we're about to add
        const networkEntry = {
          id: request.id,
          url: request.url,
          method: request.method,
          status: request.status || details.statusCode || 0,
          type: request.type,
          timestamp: request.timestamp - recordStartTime, // Make relative to record start
          endTime: request.endTime - recordStartTime,
          duration: request.duration,
          requestHeaders: request.requestHeaders || {},
          responseHeaders: request.responseHeaders || {},
          size: parseInt(request.responseHeaders?.['content-length'] || '0'),
          mimeType: request.responseHeaders?.['content-type'],
          fromExtension: true // Mark that this data came from extension
        };
        
        // Apply our injected headers to the captured data
        this.applyInjectedHeaders(networkEntry);
        
        tabNetworkData.push(networkEntry);
        
        // Clean up
        this.pendingRequests.delete(details.requestId);
      },
      { urls: ["<all_urls>"] }
    );
    
    // Handle errors
    chrome.webRequest.onErrorOccurred?.addListener(
      (details) => {
        const request = this.pendingRequests.get(details.requestId);
        if (!request) return;
        
        // Add error info
        request.endTime = details.timeStamp;
        request.duration = request.endTime - request.timestamp;
        request.error = details.error;
        
        // Get the recording state to have the record start time
        const recordingState = this.recordingTabs.get(request.tabId);
        const recordStartTime = recordingState ? recordingState.startTime : 0;
        
        // Add to network data
        if (!this.networkRequests.has(request.tabId)) {
          this.networkRequests.set(request.tabId, []);
        }
        
        const tabNetworkData = this.networkRequests.get(request.tabId);
        
        // Create network entry
        const networkEntry = {
          id: request.id,
          url: request.url,
          method: request.method,
          status: 0,
          error: request.error,
          type: request.type,
          timestamp: request.timestamp - recordStartTime,
          endTime: request.endTime - recordStartTime,
          duration: request.duration,
          requestHeaders: request.requestHeaders || {},
          responseHeaders: {},
          fromExtension: true
        };
        
        // Apply injected headers even for failed requests
        this.applyInjectedHeaders(networkEntry);
        
        tabNetworkData.push(networkEntry);
        
        // Clean up
        this.pendingRequests.delete(details.requestId);
      },
      { urls: ["<all_urls>"] }
    );
  }
  
  async startRecording(tabId) {
    try {
      // Check if already recording
      if (this.recordingTabs.has(tabId)) {
        return { success: false, error: 'Already recording' };
      }
      
      // Generate record ID
      const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Clear any existing network data for this tab
      this.networkRequests.delete(tabId);
      this.networkRequests.set(tabId, []);
      
      // Store recording state
      this.recordingTabs.set(tabId, {
        recordId,
        startTime: Date.now(),
        state: 'recording'
      });
      
      // First inject the content script (in ISOLATED world for message handling)
      try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        await browserAPI.scripting.executeScript({
          target: { tabId },
          files: ['js/content/record-recorder/index.js'],
          world: 'ISOLATED' // This is the default, but being explicit
        });
        
        
        // Give it a moment to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e) {
        // Script might already be injected, that's ok
      }
      
      // Now send start message to content script
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      await browserAPI.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.START_RECORDING,
        recordId
      });
      
      
      return {
        success: true,
        recordId,
        startTime: Date.now()
      };
    } catch (error) {
      throw error;
    }
  }
  
  async stopRecording(tabId) {
    try {
      // Check if recording
      const recordingState = this.recordingTabs.get(tabId);
      if (!recordingState) {
        return { success: false, error: 'Not recording' };
      }
      
      // Send stop message to content script
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      await browserAPI.tabs.sendMessage(tabId, {
        type: MESSAGE_TYPES.STOP_RECORDING
      });
      
      // Clean up state
      this.recordingTabs.delete(tabId);
      
      
      return {
        success: true,
        duration: Date.now() - recordingState.startTime
      };
    } catch (error) {
      // Clean up state even on error
      this.recordingTabs.delete(tabId);
      throw error;
    }
  }
  
  async cancelRecording(tabId) {
    try {
      // Check if recording
      const recordingState = this.recordingTabs.get(tabId);
      if (!recordingState) {
        return { success: false, error: 'Not recording' };
      }
      
      // Send cancel message to content script to hide widget
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      try {
        await browserAPI.tabs.sendMessage(tabId, {
          type: MESSAGE_TYPES.CANCEL_RECORDING
        });
      } catch (e) {
        // Content script might not be listening, that's okay
      }
      
      // Clean up all state without saving
      this.recordingTabs.delete(tabId);
      this.networkRequests.delete(tabId);
      
      // Clean up any pending requests for this tab
      for (const [requestId, request] of this.pendingRequests) {
        if (request.tabId === tabId) {
          this.pendingRequests.delete(requestId);
        }
      }
      
      
      return {
        success: true,
        cancelled: true
      };
    } catch (error) {
      // Clean up state even on error
      this.recordingTabs.delete(tabId);
      this.networkRequests.delete(tabId);
      throw error;
    }
  }
  
  getRecordingState(tabId) {
    const state = this.recordingTabs.get(tabId);
    
    if (!state) {
      return {
        isRecording: false,
        isPaused: false,
        state: 'idle'
      };
    }
    
    return {
      isRecording: true,
      isPaused: false,
      state: state.state,
      recordId: state.recordId,
      startTime: state.startTime
    };
  }
  
  async downloadRecord(url, filename) {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      await browserAPI.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
      
      // Clean up blob URL after a delay
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60000); // 1 minute
    } catch (error) {
    }
  }
  
  async applyInjectedHeaders(networkEntry) {
    try {
      // Get the current saved headers configuration
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      const result = await browserAPI.storage.sync.get(['savedData']);
      const savedData = result.savedData || {};
      
      // Also get dynamic sources for resolving placeholders
      const localResult = await browserAPI.storage.local.get(['dynamicSources']);
      const dynamicSources = localResult.dynamicSources || [];
      
      // Check each enabled header rule
      for (const [id, entry] of Object.entries(savedData)) {
        // Skip disabled headers
        if (entry.isEnabled === false) continue;
        
        // Check if this URL matches any of the header's domain patterns
        const domains = entry.domains || [];
        let matches = false;
        
        for (const domain of domains) {
          if (this.doesUrlMatchPattern(networkEntry.url, domain)) {
            matches = true;
            break;
          }
        }
        
        if (matches) {
          // Get the header value (resolve dynamic values if needed)
          let headerValue = entry.headerValue;
          
          // If it's a dynamic header, try to resolve it
          if (entry.isDynamic && entry.sourceId) {
            const source = dynamicSources.find(s => 
              s.sourceId === entry.sourceId || s.locationId === entry.sourceId
            );
            
            if (source && source.sourceContent) {
              headerValue = source.sourceContent;
            } else {
              // Use placeholder if source not found
              headerValue = `{{${entry.sourceId}}}`;
            }
          }
          
          // Apply the header to request or response
          const headerName = entry.headerName.toLowerCase();
          
          if (entry.isResponse) {
            // Add to response headers
            networkEntry.responseHeaders[headerName] = headerValue;
          } else {
            // Add to request headers
            networkEntry.requestHeaders[headerName] = headerValue;
          }
          
        }
      }
    } catch (error) {
    }
  }
  
  async getAllCookies(tabUrl) {
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      
      if (!browserAPI.cookies || !browserAPI.cookies.getAll) {
        return [];
      }
      
      const url = new URL(tabUrl);
      
      // Get all cookies for this URL
      const cookies = await new Promise((resolve) => {
        browserAPI.cookies.getAll({ url: tabUrl }, (cookies) => {
          resolve(cookies || []);
        });
      });
      
      // Also get cookies for the domain (without specific path)
      const domainCookies = await new Promise((resolve) => {
        browserAPI.cookies.getAll({ domain: url.hostname }, (cookies) => {
          resolve(cookies || []);
        });
      });
      
      // Merge and deduplicate
      const cookieMap = new Map();
      
      [...cookies, ...domainCookies].forEach(cookie => {
        const key = `${cookie.name}-${cookie.domain}-${cookie.path}`;
        cookieMap.set(key, cookie);
      });
      
      return Array.from(cookieMap.values());
    } catch (error) {
      return [];
    }
  }

  doesUrlMatchPattern(url, pattern) {
    try {
      let urlFilter = pattern.trim().toLowerCase();
      
      // Convert pattern to a regex
      if (urlFilter === '*') {
        return true; // Matches everything
      }
      
      // If pattern doesn't have protocol, add wildcard
      if (!urlFilter.includes('://')) {
        urlFilter = '*://' + urlFilter;
      }
      
      // Ensure pattern has a path
      if (!urlFilter.includes('/', urlFilter.indexOf('://') + 3)) {
        urlFilter = urlFilter + '/*';
      }
      
      // Convert to regex pattern
      let regexPattern = urlFilter
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
        .replace(/\*/g, '.*'); // Replace * with .*
      
      // Create regex
      const regex = new RegExp('^' + regexPattern + '$', 'i');
      
      // Test the URL
      return regex.test(url);
    } catch (e) {
      return false;
    }
  }
}

// Export singleton instance
export default new RecordManager();