/**
 * Enhanced recorder with rrweb integration
 * Maintains compatibility with existing widget and message format
 */

(function() {
  'use strict';
  
  // Check if already initialized
  if (window.__openHeadersRecorderRrweb) {
    console.log('[Recorder-RRWeb] Already initialized');
    return;
  }
  window.__openHeadersRecorderRrweb = true;
  
  let isRecording = false;
  let stopRrweb = null;
  let hasInitialStorage = false;
  
  // Console monitoring
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug
  };
  
  function interceptConsole() {
    Object.keys(originalConsole).forEach(level => {
      console[level] = function(...args) {
        if (isRecording) {
          sendEvent('console', {
            level,
            args: args.map(arg => {
              try {
                return typeof arg === 'object' ? JSON.parse(JSON.stringify(arg)) : arg;
              } catch {
                return String(arg);
              }
            }),
            stack: new Error().stack
          });
        }
        originalConsole[level].apply(console, args);
      };
    });
  }
  
  // Network monitoring (fetch and XHR)
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  
  function interceptNetwork() {
    // Fetch interception
    window.fetch = async function(...args) {
      const [input, init] = args;
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      const requestId = `fetch_${Date.now()}_${Math.random()}`;
      
      let headers = {};
      if (input instanceof Request) {
        headers = Object.fromEntries(input.headers.entries());
      }
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          headers = { ...headers, ...Object.fromEntries(init.headers.entries()) };
        } else {
          headers = { ...headers, ...(init.headers) };
        }
      }
      
      if (isRecording) {
        sendEvent('network', {
          requestId,
          type: 'request',
          method,
          url,
          headers,
          body: init?.body,
          timing: { startTime: Date.now() }
        });
      }
      
      try {
        const response = await originalFetch.apply(window, args);
        const clonedResponse = response.clone();
        
        if (isRecording) {
          const responseBody = await clonedResponse.text();
          sendEvent('network', {
            requestId,
            type: 'response',
            url,
            status: response.status,
            statusText: response.statusText,
            responseHeaders: Object.fromEntries(response.headers.entries()),
            responseBody,
            timing: { endTime: Date.now() }
          });
        }
        
        return response;
      } catch (error) {
        if (isRecording) {
          sendEvent('network', {
            requestId,
            type: 'response',
            url,
            status: 0,
            statusText: 'Network Error',
            responseBody: error.message,
            timing: { endTime: Date.now() }
          });
        }
        throw error;
      }
    };
    
    // XHR interception
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      this._recordingData = {
        method,
        url,
        requestId: `xhr_${Date.now()}_${Math.random()}`,
        headers: {}
      };
      return originalXHROpen.apply(this, [method, url, ...rest]);
    };
    
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
      if (this._recordingData) {
        this._recordingData.headers[header] = value;
      }
      return originalXHRSetRequestHeader.apply(this, [header, value]);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
      if (isRecording && this._recordingData) {
        const { requestId, method, url, headers } = this._recordingData;
        
        sendEvent('network', {
          requestId,
          type: 'request',
          method,
          url,
          headers,
          body,
          timing: { startTime: Date.now() }
        });
        
        this.addEventListener('load', function() {
          const responseHeaders = {};
          const headerLines = this.getAllResponseHeaders().split('\n');
          for (const line of headerLines) {
            const [key, ...valueParts] = line.split(':');
            if (key && key.trim()) {
              responseHeaders[key.trim().toLowerCase()] = valueParts.join(':').trim();
            }
          }
          
          sendEvent('network', {
            requestId,
            type: 'response',
            url,
            status: this.status,
            statusText: this.statusText,
            responseHeaders,
            responseBody: this.responseText,
            timing: { endTime: Date.now() }
          });
        });
        
        this.addEventListener('error', function() {
          sendEvent('network', {
            requestId,
            type: 'response',
            url,
            status: 0,
            statusText: 'Network Error',
            timing: { endTime: Date.now() }
          });
        });
      }
      
      return originalXHRSend.apply(this, [body]);
    };
  }
  
  // Storage monitoring
  const originalLocalStorage = {
    setItem: localStorage.setItem,
    removeItem: localStorage.removeItem,
    clear: localStorage.clear
  };
  
  const originalSessionStorage = {
    setItem: sessionStorage.setItem,
    removeItem: sessionStorage.removeItem,
    clear: sessionStorage.clear
  };
  
  function interceptStorage() {
    // Local Storage
    localStorage.setItem = function(key, value) {
      const oldValue = localStorage.getItem(key);
      originalLocalStorage.setItem.apply(localStorage, [key, value]);
      
      if (isRecording) {
        sendEvent('storage', {
          type: 'local',
          action: 'set',
          key,
          oldValue,
          newValue: value
        });
      }
    };
    
    localStorage.removeItem = function(key) {
      const oldValue = localStorage.getItem(key);
      originalLocalStorage.removeItem.apply(localStorage, [key]);
      
      if (isRecording) {
        sendEvent('storage', {
          type: 'local',
          action: 'remove',
          key,
          oldValue
        });
      }
    };
    
    localStorage.clear = function() {
      originalLocalStorage.clear.apply(localStorage);
      
      if (isRecording) {
        sendEvent('storage', {
          type: 'local',
          action: 'clear'
        });
      }
    };
    
    // Session Storage
    sessionStorage.setItem = function(key, value) {
      const oldValue = sessionStorage.getItem(key);
      originalSessionStorage.setItem.apply(sessionStorage, [key, value]);
      
      if (isRecording) {
        sendEvent('storage', {
          type: 'session',
          action: 'set',
          key,
          oldValue,
          newValue: value
        });
      }
    };
    
    sessionStorage.removeItem = function(key) {
      const oldValue = sessionStorage.getItem(key);
      originalSessionStorage.removeItem.apply(sessionStorage, [key]);
      
      if (isRecording) {
        sendEvent('storage', {
          type: 'session',
          action: 'remove',
          key,
          oldValue
        });
      }
    };
    
    sessionStorage.clear = function() {
      originalSessionStorage.clear.apply(sessionStorage);
      
      if (isRecording) {
        sendEvent('storage', {
          type: 'session',
          action: 'clear'
        });
      }
    };
    
    // Cookie monitoring
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    if (cookieDescriptor && cookieDescriptor.set) {
      const originalCookieSetter = cookieDescriptor.set;
      
      Object.defineProperty(document, 'cookie', {
        get: cookieDescriptor.get,
        set: function(value) {
          if (isRecording) {
            sendEvent('storage', {
              type: 'cookie',
              action: 'set',
              newValue: value,
              domain: window.location.hostname,
              path: window.location.pathname
            });
          }
          return originalCookieSetter.call(document, value);
        },
        configurable: true
      });
    }
  }
  
  function sendEvent(type, data) {
    window.postMessage({
      source: 'open-headers-recorder',
      type: type,
      data: data,
      timestamp: Date.now()
    }, '*');
  }
  
  // Capture initial storage state
  function captureInitialStorageState() {
    const storageState = {
      localStorage: {},
      sessionStorage: {},
      cookies: document.cookie
    };
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          storageState.localStorage[key] = localStorage.getItem(key) || '';
        }
      }
    } catch (e) {
      console.warn('[Recorder] Failed to capture localStorage:', e);
    }
    
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          storageState.sessionStorage[key] = sessionStorage.getItem(key) || '';
        }
      }
    } catch (e) {
      console.warn('[Recorder] Failed to capture sessionStorage:', e);
    }
    
    sendEvent('storage-initial', storageState);
  }
  
  // Start rrweb recording
  function startRrwebRecording() {
    if (stopRrweb || !window.rrweb) {
      console.log('[Recorder] rrweb already recording or not available');
      return;
    }
    
    console.log('[Recorder] Starting rrweb recording...');
    
    try {
      stopRrweb = window.rrweb.record({
        emit: (event) => {
          sendEvent('rrweb', event);
        },
        sampling: {
          scroll: 150,
          media: 800
        },
        recordCanvas: true,
        collectFonts: true
      });
      
      console.log('[Recorder] rrweb recording started');
    } catch (error) {
      console.error('[Recorder] Failed to start rrweb recording:', error);
    }
  }
  
  // Stop rrweb recording
  function stopRrwebRecording() {
    if (stopRrweb) {
      stopRrweb();
      stopRrweb = null;
      console.log('[Recorder] rrweb recording stopped');
    }
  }
  
  // Initialize all interceptions
  interceptConsole();
  interceptNetwork();
  interceptStorage();
  
  // Listen for start/stop commands from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'open-headers-content') return;
    
    if (event.data.action === 'startRecording') {
      isRecording = true;
      captureInitialStorageState();
      startRrwebRecording();
      console.log('[Recorder] Recording started');
    } else if (event.data.action === 'stopRecording') {
      isRecording = false;
      stopRrwebRecording();
      console.log('[Recorder] Recording stopped');
    } else if (event.data.action === 'ping') {
      // Respond to ping
      window.postMessage({
        source: 'open-headers-recorder',
        type: 'pong'
      }, '*');
    } else if (event.data.action === 'reinitRecorder') {
      // Re-initialization requested (for re-injection scenarios)
      console.log('[Recorder] Re-initializing recorder');
      // Stop any existing recording
      if (isRecording) {
        isRecording = false;
        stopRrwebRecording();
      }
      // Send ready message again
      window.postMessage({
        source: 'open-headers-recorder',
        type: 'ready'
      }, '*');
    }
  });
  
  console.log('[Recorder-RRWeb] Initialized and ready');
  
  // Notify content script that we're ready
  window.postMessage({
    source: 'open-headers-recorder',
    type: 'ready'
  }, '*');
})();