/**
 * Cross-browser compatibility layer for browser extensions
 * Supports Chrome, Firefox, Edge, and Safari
 */

// Detect browser type
export const browserType = (() => {
    if (typeof browser !== 'undefined' && browser.runtime) {
        return 'firefox';
    } else if (typeof chrome !== 'undefined') {
        if (navigator.userAgent.includes('Edg/')) {
            return 'edge';
        } else if (navigator.userAgent.includes('Safari/') && !navigator.userAgent.includes('Chrome/')) {
            return 'safari';
        } else {
            return 'chrome'; // Chrome or Chrome-based (Brave, etc.)
        }
    }
    return 'unknown';
})();

// Base API object depending on browser
const api = (() => {
    if (typeof browser !== 'undefined' && browser.runtime) {
        return browser; // Firefox
    } else if (typeof chrome !== 'undefined') {
        return chrome; // Chrome, Edge, Safari, etc.
    }
    // Fallback - shouldn't reach here in practice
    console.error('No browser API detected');
    return {};
})();

/**
 * Convert callback-based API to Promise-based API for Firefox compatibility
 * @param {Function} apiFunction - The API function to call
 * @param {...any} args - Arguments to pass to the function
 * @returns {Promise} - Promise that resolves with the result
 */
function promisify(apiFunction, ...args) {
    return new Promise((resolve, reject) => {
        apiFunction(...args, (result) => {
            if (api.runtime.lastError) {
                reject(api.runtime.lastError);
            } else {
                resolve(result);
            }
        });
    });
}

/**
 * Storage API wrapper with cross-browser support
 */
export const storage = {
    local: {
        get: (keys, callback) => {
            // Safari may need special handling for extension storage
            if (browserType === 'safari' && window.safariStorage) {
                // Use Safari's storage mechanism if available
                return window.safariStorage.local.get(keys, callback);
            }

            // For Firefox, return a promise if no callback is provided
            if (browserType === 'firefox' && !callback) {
                return promisify(api.storage.local.get, keys);
            }

            // Default implementation for Chrome/Edge
            return api.storage.local.get(keys, callback);
        },
        set: (items, callback) => {
            // Safari special handling
            if (browserType === 'safari' && window.safariStorage) {
                return window.safariStorage.local.set(items, callback);
            }

            // Firefox promise support
            if (browserType === 'firefox' && !callback) {
                return promisify(api.storage.local.set, items);
            }

            // Default implementation
            return api.storage.local.set(items, callback);
        }
    },
    sync: {
        get: (keys, callback) => {
            // Safari doesn't support sync storage, so fall back to local
            if (browserType === 'safari') {
                return storage.local.get(keys, callback);
            }

            // Firefox promise support
            if (browserType === 'firefox' && !callback) {
                return promisify(api.storage.sync.get, keys);
            }

            // Default implementation
            return api.storage.sync.get(keys, callback);
        },
        set: (items, callback) => {
            // Safari fallback to local storage
            if (browserType === 'safari') {
                return storage.local.set(items, callback);
            }

            // Firefox promise support
            if (browserType === 'firefox' && !callback) {
                return promisify(api.storage.sync.set, items);
            }

            // Default implementation
            return api.storage.sync.set(items, callback);
        }
    },
    onChanged: {
        addListener: (listener) => {
            // Safari special handling
            if (browserType === 'safari' && window.safariStorage) {
                return window.safariStorage.onChanged.addListener(listener);
            }

            // Default implementation
            return api.storage.onChanged.addListener(listener);
        }
    }
};

/**
 * Runtime API wrapper
 */
export const runtime = {
    sendMessage: (message, responseCallback) => {
        // Safari may need message format conversion
        if (browserType === 'safari') {
            // Convert message format if needed
            const safariMessage = typeof message === 'object' ? message : { data: message };
            if (responseCallback) {
                return api.runtime.sendMessage(safariMessage, responseCallback);
            } else {
                return new Promise((resolve) => {
                    api.runtime.sendMessage(safariMessage, resolve);
                });
            }
        }

        // Firefox promise support
        if (browserType === 'firefox' && !responseCallback) {
            return api.runtime.sendMessage(message);
        }

        // Default implementation
        return api.runtime.sendMessage(message, responseCallback);
    },
    onMessage: {
        addListener: (listener) => {
            // Wrap listener for Safari message format differences
            if (browserType === 'safari') {
                const wrappedListener = (message, sender, sendResponse) => {
                    // Safari might wrap messages differently
                    return listener(message, sender, sendResponse);
                };
                return api.runtime.onMessage.addListener(wrappedListener);
            }

            // Default implementation
            return api.runtime.onMessage.addListener(listener);
        }
    },
    onStartup: {
        addListener: (listener) => {
            return api.runtime.onStartup.addListener(listener);
        }
    },
    onInstalled: {
        addListener: (listener) => {
            return api.runtime.onInstalled.addListener(listener);
        }
    },
    getURL: (path) => {
        return api.runtime.getURL(path);
    },
    get lastError() {
        return api.runtime.lastError;
    },
};

/**
 * Wrapped declarativeNetRequest API with Safari fallbacks
 */
export const declarativeNetRequest = {
    updateDynamicRules: (options) => {
        // Safari might use a different API for modifying network requests
        if (browserType === 'safari' && window.safariWebRequest) {
            return window.safariWebRequest.updateDynamicRules(options);
        }

        // Firefox promise support
        if (browserType === 'firefox') {
            return api.declarativeNetRequest.updateDynamicRules(options);
        }

        // Default implementation
        return api.declarativeNetRequest.updateDynamicRules(options);
    }
};

/**
 * Wrapped alarms API
 */
export const alarms = {
    create: (name, alarmInfo) => {
        // Safari may need a custom implementation for alarms
        if (browserType === 'safari' && window.safariAlarms) {
            return window.safariAlarms.create(name, alarmInfo);
        }

        return api.alarms.create(name, alarmInfo);
    },
    onAlarm: {
        addListener: (listener) => {
            // Safari special handling
            if (browserType === 'safari' && window.safariAlarms) {
                return window.safariAlarms.onAlarm.addListener(listener);
            }

            return api.alarms.onAlarm.addListener(listener);
        }
    }
};

// Export the detected browser type for conditional code
export const isSafari = browserType === 'safari';
export const isFirefox = browserType === 'firefox';
export const isChrome = browserType === 'chrome';
export const isEdge = browserType === 'edge';

// Export the full API for advanced cases
export default api;