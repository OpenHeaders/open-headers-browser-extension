(function() {
  'use strict';
  
  let recorder = null;
  let isRecording = false;
  let recordData = {
    events: [],
    console: [],
    network: [],
    storage: {
      localStorage: {},
      sessionStorage: {},
      cookies: []
    },
    metadata: null
  };
  
  // Original function references
  const originalConsole = {};
  const originalFetch = window.fetch;
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const originalClear = Storage.prototype.clear;
  
  function startRecording(recordId) {
    if (isRecording) {
      return;
    }
    
    
    // Wait for DOM to be ready before starting
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => startRecording(recordId));
      return;
    }
    
    isRecording = true;
    
    // Reset record data
    recordData = {
      events: [],
      console: [],
      network: [],
      storage: {
        localStorage: {},
        sessionStorage: {},
        cookies: []
      },
      metadata: {
        recordId: recordId,
        url: window.location.href,
        title: document.title,
        startTime: Date.now(),
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      }
    };
    
    // Start rrweb with minimal configuration
    let hasInitialSnapshot = false;
    
    recorder = rrweb.record({
      emit(event) {
        if (isRecording) {
          
          // Check for initial full snapshot (type 2)
          if (event.type === 2) {
            hasInitialSnapshot = true;
          }
          
          recordData.events.push(event);
          
          // Notify content script periodically about recording stats
          if (recordData.events.length % 100 === 0) {
            window.postMessage({
              type: 'RECORDING_STATS',
              stats: {
                eventCount: recordData.events.length,
                duration: Date.now() - recordData.metadata.startTime,
                hasInitialSnapshot: hasInitialSnapshot
              }
            }, '*');
          }
        }
      },
      // Minimal sampling to reduce event volume
      sampling: {
        mousemove: true,
        mouseInteraction: true,
        scroll: 150,
        media: 800,
        input: 'last'
      },
      blockClass: 'oh-block',
      checkoutEveryNms: 5 * 60 * 1000, // 5 minutes
      recordCanvas: false,
      inlineStylesheet: true,
      maskAllInputs: false,
      slimDOMOptions: {
        script: false,
        comment: false,
        headFavicon: false,
        headWhitespace: false,
        headMetaDescKeywords: false,
        headMetaSocial: false,
        headMetaRobots: false,
        headMetaHttpEquiv: false,
        headMetaAuthorship: false,
        headMetaVerification: false
      }
    });
    
    // Verify initial snapshot was captured after a short delay
    setTimeout(() => {
      if (!hasInitialSnapshot) {
        // Force a checkpoint to capture current state
        if (recorder && typeof recorder.takeFullSnapshot === 'function') {
          recorder.takeFullSnapshot();
        }
      }
    }, 1000);
    
    // Start intercepting console
    interceptConsole();
    
    // Start intercepting network
    interceptNetwork();
    
    // Capture initial storage state
    captureStorage();
    
    // Start intercepting storage changes
    interceptStorage();
  }
  
  function stopRecording() {
    if (!isRecording) {
      return;
    }
    
    isRecording = false;
    
    // Stop rrweb - wrap in try-catch to handle any errors
    if (recorder) {
      try {
        recorder();
      } catch (e) {
      }
      recorder = null;
    }
    
    // Restore intercepted functions
    restoreConsole();
    restoreNetwork();
    restoreStorage();
    restoreStorage();
    
    // Capture final storage state
    captureStorage();
    
    // Add end time to metadata
    recordData.metadata.endTime = Date.now();
    recordData.metadata.duration = recordData.metadata.endTime - recordData.metadata.startTime;
    
    // Send complete record data to content script
    window.postMessage({
      type: 'RECORDING_COMPLETE',
      record: recordData
    }, '*');
  }
  
  function cancelRecording() {
    if (!isRecording) {
      return;
    }
    
    isRecording = false;
    
    // Stop rrweb
    if (recorder) {
      try {
        recorder();
      } catch (e) {
      }
      recorder = null;
    }
    
    // Restore intercepted functions
    restoreConsole();
    restoreNetwork();
    restoreStorage();
    
    // Clear all recorded data
    recordData = {
      events: [],
      console: [],
      network: [],
      storage: {
        localStorage: {},
        sessionStorage: {},
        cookies: []
      },
      metadata: null
    };
    
  }
  
  function interceptConsole() {
    ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
      originalConsole[method] = console[method];
      console[method] = function(...args) {
        if (isRecording) {
          recordData.console.push({
            level: method,
            args: serializeArgs(args),
            timestamp: Date.now() - recordData.metadata.startTime
          });
        }
        return originalConsole[method].apply(console, args);
      };
    });
  }
  
  function restoreConsole() {
    Object.keys(originalConsole).forEach(method => {
      console[method] = originalConsole[method];
    });
  }
  
  function interceptNetwork() {
    const recordingStartTime = recordData.metadata.startTime;
    
    // Helper to extract headers from Headers object or plain object
    function extractHeaders(headers) {
      const result = {};
      if (headers instanceof Headers) {
        headers.forEach((value, key) => {
          result[key.toLowerCase()] = value;
        });
      } else if (headers && typeof headers === 'object') {
        Object.keys(headers).forEach(key => {
          result[key.toLowerCase()] = headers[key];
        });
      }
      return result;
    }
    
    // Helper to generate unique ID
    function generateId() {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Helper to get call stack for initiator
    function getCallStack() {
      try {
        const stack = new Error().stack;
        const lines = stack.split('\n');
        // Skip first 3 lines (Error, getCallStack, interceptor)
        for (let i = 3; i < Math.min(lines.length, 10); i++) {
          const line = lines[i];
          if (line.includes('http://') || line.includes('https://')) {
            // Extract file and line number
            const match = line.match(/(?:at\s+)?(?:.*?\s+)?(?:\()?(.+?):(\d+):(\d+)/);
            if (match) {
              const [, file, line, column] = match;
              const fileName = file.split('/').pop();
              return `${fileName}:${line}`;
            }
          }
        }
      } catch (e) {
        // Ignore errors in stack trace parsing
      }
      return 'script';
    }
    
    // Store network requests
    const networkRequests = [];
    
    // Intercept fetch
    window.fetch = async function(...args) {
      const [resource, init = {}] = args;
      const url = typeof resource === 'string' ? resource : resource.url;
      const method = (init.method || 'GET').toUpperCase();
      const startTime = Date.now() - recordingStartTime;
      
      const networkEntry = {
        id: generateId(),
        url: url,
        method: method,
        timestamp: startTime,
        type: 'fetch',
        initiator: getCallStack(),
        requestHeaders: {},
        responseHeaders: {},
        requestBody: null,
        responseBody: null
      };
      
      // Capture request headers
      if (init.headers) {
        networkEntry.requestHeaders = extractHeaders(init.headers);
      }
      
      // Add default headers that browser typically sends with fetch
      const defaultHeaders = {
        'user-agent': navigator.userAgent,
        'accept': '*/*',
        'accept-language': navigator.language || 'en-US',
        'cache-control': init.cache || 'default',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': init.mode || 'cors',
        'sec-fetch-site': 'cross-site'
      };
      
      // Only add defaults if not already present
      Object.entries(defaultHeaders).forEach(([key, value]) => {
        if (!networkEntry.requestHeaders[key] && value !== 'default') {
          networkEntry.requestHeaders[key] = value;
        }
      });
      
      // Capture request body
      if (init?.body) {
        try {
          if (typeof init.body === 'string') {
            networkEntry.requestBody = init.body;
          } else if (init.body instanceof FormData) {
            const formData = {};
            for (const [key, value] of init.body.entries()) {
              formData[key] = value instanceof File ? `[File: ${value.name}]` : value;
            }
            networkEntry.requestBody = formData;
          } else if (init.body instanceof Blob) {
            networkEntry.requestBody = `[Blob: ${init.body.size} bytes]`;
          }
        } catch (e) {
        }
      }
      
      try {
        const response = await originalFetch.apply(this, args);
        
        // Capture response details
        networkEntry.status = response.status;
        networkEntry.statusText = response.statusText;
        networkEntry.endTime = Date.now() - recordingStartTime;
        networkEntry.duration = networkEntry.endTime - networkEntry.timestamp;
        
        // Capture all response headers
        response.headers.forEach((value, key) => {
          networkEntry.responseHeaders[key.toLowerCase()] = value;
        });
        
        // Try to capture response body (for small responses)
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          const size = parseInt(contentLength);
          networkEntry.size = size;
          
          // Only capture small text responses
          const contentType = response.headers.get('content-type') || '';
          if (size < 100000 && (contentType.includes('json') || contentType.includes('text'))) {
            try {
              const clone = response.clone();
              const text = await clone.text();
              networkEntry.responseBody = text;
            } catch (e) {
              // Ignore clone errors
            }
          }
        }
        
        if (isRecording) {
          networkRequests.push(networkEntry);
          recordData.network = networkRequests;
        }
        
        return response;
      } catch (error) {
        networkEntry.error = error.message;
        networkEntry.endTime = Date.now() - recordingStartTime;
        networkEntry.duration = networkEntry.endTime - networkEntry.timestamp;
        networkEntry.status = 0;
        
        if (isRecording) {
          networkRequests.push(networkEntry);
          recordData.network = networkRequests;
        }
        
        throw error;
      }
    };
    
    // Intercept XMLHttpRequest
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      this._ohRecordingData = {
        method: method.toUpperCase(),
        url: url,
        timestamp: Date.now() - recordingStartTime,
        type: 'xhr',
        initiator: getCallStack(),
        requestHeaders: {},
        responseHeaders: {}
      };
      
      return originalXHROpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
      if (this._ohRecordingData) {
        this._ohRecordingData.requestHeaders[header.toLowerCase()] = value;
      }
      return originalXHRSetRequestHeader.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      const recordingData = xhr._ohRecordingData;
      
      if (recordingData) {
        recordingData.id = generateId();
        
        // Add default headers that browser typically sends with XHR
        const defaultHeaders = {
          'user-agent': navigator.userAgent,
          'accept': '*/*',
          'accept-language': navigator.language || 'en-US',
          'cache-control': 'no-cache',
          'pragma': 'no-cache'
        };
        
        // Only add defaults if not already present
        Object.entries(defaultHeaders).forEach(([key, value]) => {
          if (!recordingData.requestHeaders[key]) {
            recordingData.requestHeaders[key] = value;
          }
        });
        
        // Capture request body
        if (body) {
          try {
            if (typeof body === 'string') {
              recordingData.requestBody = body;
            } else if (body instanceof FormData) {
              recordingData.requestBody = 'FormData';
            } else if (body instanceof Blob) {
              recordingData.requestBody = `Blob(${body.size} bytes)`;
            }
          } catch (e) {
            // Ignore body capture errors
          }
        }
        
        // Listen for response
        xhr.addEventListener('load', function() {
          recordingData.status = xhr.status;
          recordingData.statusText = xhr.statusText;
          recordingData.endTime = Date.now() - recordingStartTime;
          recordingData.duration = recordingData.endTime - recordingData.timestamp;
          
          // Capture all response headers
          const allResponseHeaders = xhr.getAllResponseHeaders();
          if (allResponseHeaders) {
            // Parse the header string
            const headers = allResponseHeaders.trim().split(/[\r\n]+/);
            headers.forEach(line => {
              const parts = line.split(': ');
              const header = parts.shift();
              const value = parts.join(': ');
              if (header && value) {
                recordingData.responseHeaders[header.toLowerCase()] = value;
              }
            });
          }
          
          // Capture response body for small responses
          const contentLength = recordingData.responseHeaders['content-length'];
          if (contentLength) {
            recordingData.size = parseInt(contentLength);
          }
          
          // Only capture small text responses
          if (xhr.responseType === '' || xhr.responseType === 'text') {
            const contentType = recordingData.responseHeaders['content-type'] || '';
            if (xhr.responseText && xhr.responseText.length < 100000 && 
                (contentType.includes('json') || contentType.includes('text') || contentType.includes('html'))) {
              recordingData.responseBody = xhr.responseText;
            }
          }
          
          // Capture additional info
          recordingData.mimeType = recordingData.responseHeaders['content-type'];
          
          if (isRecording) {
            networkRequests.push(recordingData);
            recordData.network = networkRequests;
          }
        });
        
        xhr.addEventListener('error', function() {
          recordingData.error = 'Network Error';
          recordingData.status = 0;
          recordingData.endTime = Date.now() - recordingStartTime;
          recordingData.duration = recordingData.endTime - recordingData.timestamp;
          
          if (isRecording) {
            networkRequests.push(recordingData);
            recordData.network = networkRequests;
          }
        });
        
        xhr.addEventListener('abort', function() {
          recordingData.error = 'Request Aborted';
          recordingData.status = 0;
          recordingData.endTime = Date.now() - recordingStartTime;
          recordingData.duration = recordingData.endTime - recordingData.timestamp;
          
          if (isRecording) {
            networkRequests.push(recordingData);
            recordData.network = networkRequests;
          }
        });
      }
      
      return originalXHRSend.apply(this, arguments);
    };
  }
  
  
  function restoreNetwork() {
    window.fetch = originalFetch;
    
    // Restore XMLHttpRequest methods
    if (XMLHttpRequest.prototype.open !== originalXHROpen) {
      XMLHttpRequest.prototype.open = originalXHROpen;
    }
    if (XMLHttpRequest.prototype.send !== originalXHRSend) {
      XMLHttpRequest.prototype.send = originalXHRSend;
    }
    if (XMLHttpRequest.prototype.setRequestHeader !== originalXHRSetRequestHeader) {
      XMLHttpRequest.prototype.setRequestHeader = originalXHRSetRequestHeader;
    }
  }
  
  function captureStorage() {
    try {
      // Capture localStorage
      const localStorageData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        try {
          localStorageData[key] = localStorage.getItem(key);
        } catch (e) {
          localStorageData[key] = '[Error reading value]';
        }
      }
      recordData.storage.localStorage = localStorageData;
      
      // Capture sessionStorage
      const sessionStorageData = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        try {
          sessionStorageData[key] = sessionStorage.getItem(key);
        } catch (e) {
          sessionStorageData[key] = '[Error reading value]';
        }
      }
      recordData.storage.sessionStorage = sessionStorageData;
      
      // Capture cookies
      try {
        const cookieString = document.cookie;
        
        if (cookieString && cookieString.trim()) {
          recordData.storage.cookies = cookieString.split(';').map(cookie => {
            const trimmedCookie = cookie.trim();
            if (!trimmedCookie) return null;
            
            const eqIndex = trimmedCookie.indexOf('=');
            if (eqIndex === -1) {
              // Cookie without value
              return {
                name: trimmedCookie,
                value: '',
                domain: window.location.hostname,
                path: '/',
                accessible: true
              };
            }
            
            const name = trimmedCookie.substring(0, eqIndex).trim();
            const value = trimmedCookie.substring(eqIndex + 1);
            
            return {
              name: name,
              value: value,
              domain: window.location.hostname,
              path: '/',
              // Note: We can't access httpOnly, secure, or sameSite from JavaScript
              accessible: true
            };
          }).filter(cookie => cookie && cookie.name); // Filter out null/empty cookies
        } else {
          recordData.storage.cookies = [];
        }
      } catch (e) {
        recordData.storage.cookies = [];
      }
      
    } catch (e) {
    }
  }
  
  function interceptStorage() {
    // Intercept localStorage.setItem
    Storage.prototype.setItem = function(key, value) {
      if (isRecording) {
        // Update our storage snapshot
        if (this === localStorage) {
          recordData.storage.localStorage[key] = value;
        } else if (this === sessionStorage) {
          recordData.storage.sessionStorage[key] = value;
        }
      }
      return originalSetItem.apply(this, arguments);
    };
    
    // Intercept localStorage.removeItem
    Storage.prototype.removeItem = function(key) {
      if (isRecording) {
        // Remove from our storage snapshot
        if (this === localStorage) {
          delete recordData.storage.localStorage[key];
        } else if (this === sessionStorage) {
          delete recordData.storage.sessionStorage[key];
        }
      }
      return originalRemoveItem.apply(this, arguments);
    };
    
    // Intercept localStorage.clear
    Storage.prototype.clear = function() {
      if (isRecording) {
        // Clear our storage snapshot
        if (this === localStorage) {
          recordData.storage.localStorage = {};
        } else if (this === sessionStorage) {
          recordData.storage.sessionStorage = {};
        }
      }
      return originalClear.apply(this, arguments);
    };
    
    // Note: We can't intercept cookie changes directly, but we'll capture them at start/end
  }
  
  function restoreStorage() {
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem;
    Storage.prototype.clear = originalClear;
  }
  
  function serializeArgs(args) {
    return args.map(arg => {
      try {
        if (arg === null || arg === undefined) return arg;
        if (arg instanceof Error) {
          return { __type: 'Error', message: arg.message, stack: arg.stack };
        }
        if (arg instanceof HTMLElement) {
          return { __type: 'HTMLElement', tagName: arg.tagName, id: arg.id, className: arg.className };
        }
        if (typeof arg === 'function') {
          return { __type: 'Function', name: arg.name || 'anonymous' };
        }
        if (typeof arg === 'object') {
          return JSON.parse(JSON.stringify(arg));
        }
        return arg;
      } catch (e) {
        return String(arg);
      }
    });
  }
  
  // Listen for messages from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    switch (event.data.type) {
      case 'START_RECORDING':
        startRecording(event.data.recordId);
        break;
        
      case 'STOP_RECORDING':
        stopRecording();
        break;
        
      case 'CANCEL_RECORDING':
        cancelRecording();
        break;
    }
  });
  
  // Check if rrweb is loaded
  if (typeof rrweb === 'undefined') {
  } else {
    
    // Wait for DOM to be ready before signaling
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        window.postMessage({ type: 'RECORDER_READY' }, '*');
      });
    } else {
      // DOM already loaded
      window.postMessage({ type: 'RECORDER_READY' }, '*');
    }
  }
})();