/**
 * Cross-browser compatibility layer
 * Provides unified API for working with browser extensions APIs
 */

// Detect browser environment
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Browser detection flags
export const isFirefox = typeof browser !== 'undefined';
export const isChrome = !isFirefox && navigator.userAgent.indexOf('Chrome') !== -1;
export const isEdge = !isFirefox && navigator.userAgent.indexOf('Edg') !== -1;
export const isSafari = !isFirefox && navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1;

// Use proper storage APIs
export const storage = {
  sync: {
    get: (keys, callback) => {
      if (isFirefox) {
        return browserAPI.storage.sync.get(keys).then(callback);
      } else {
        return browserAPI.storage.sync.get(keys, callback);
      }
    },
    set: (items, callback) => {
      if (isFirefox) {
        return browserAPI.storage.sync.set(items).then(callback || (() => {}));
      } else {
        return browserAPI.storage.sync.set(items, callback);
      }
    },
    remove: (keys, callback) => {
      if (isFirefox) {
        return browserAPI.storage.sync.remove(keys).then(callback || (() => {}));
      } else {
        return browserAPI.storage.sync.remove(keys, callback);
      }
    },
    clear: (callback) => {
      if (isFirefox) {
        return browserAPI.storage.sync.clear().then(callback || (() => {}));
      } else {
        return browserAPI.storage.sync.clear(callback);
      }
    }
  },
  local: {
    get: (keys, callback) => {
      if (isFirefox) {
        return browserAPI.storage.local.get(keys).then(callback);
      } else {
        return browserAPI.storage.local.get(keys, callback);
      }
    },
    set: (items, callback) => {
      if (isFirefox) {
        return browserAPI.storage.local.set(items).then(callback || (() => {}));
      } else {
        return browserAPI.storage.local.set(items, callback);
      }
    },
    remove: (keys, callback) => {
      if (isFirefox) {
        return browserAPI.storage.local.remove(keys).then(callback || (() => {}));
      } else {
        return browserAPI.storage.local.remove(keys, callback);
      }
    },
    clear: (callback) => {
      if (isFirefox) {
        return browserAPI.storage.local.clear().then(callback || (() => {}));
      } else {
        return browserAPI.storage.local.clear(callback);
      }
    }
  },
  onChanged: {
    addListener: (listener) => {
      return browserAPI.storage.onChanged.addListener(listener);
    },
    removeListener: (listener) => {
      return browserAPI.storage.onChanged.removeListener(listener);
    }
  }
};

// Cross-browser runtime API
export const runtime = {
  getURL: (path) => browserAPI.runtime.getURL(path),
  sendMessage: (message, callback) => {
    if (isFirefox) {
      return browserAPI.runtime.sendMessage(message).then(callback || (() => {})).catch(error => {
        if (callback) {
          callback({ error });
        }
      });
    } else {
      return browserAPI.runtime.sendMessage(message, callback);
    }
  },
  onMessage: {
    addListener: (listener) => browserAPI.runtime.onMessage.addListener(listener),
    removeListener: (listener) => browserAPI.runtime.onMessage.removeListener(listener)
  },
  lastError: browserAPI.runtime.lastError,
  getManifest: () => browserAPI.runtime.getManifest(),
  onInstalled: {
    addListener: (listener) => browserAPI.runtime.onInstalled.addListener(listener),
    removeListener: (listener) => browserAPI.runtime.onInstalled.removeListener(listener)
  },
  onStartup: {
    addListener: (listener) => browserAPI.runtime.onStartup.addListener(listener),
    removeListener: (listener) => browserAPI.runtime.onStartup.removeListener(listener)
  }
};

// Cross-browser tabs API
export const tabs = {
  create: (options, callback) => {
    if (isFirefox) {
      return browserAPI.tabs.create(options).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.create(options, callback);
    }
  },
  query: (options, callback) => {
    if (isFirefox) {
      return browserAPI.tabs.query(options).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.query(options, callback);
    }
  },
  update: (tabId, options, callback) => {
    if (isFirefox) {
      return browserAPI.tabs.update(tabId, options).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.update(tabId, options, callback);
    }
  }
};

// Cross-browser alarms API
export const alarms = browserAPI.alarms ? {
  create: (name, alarmInfo) => browserAPI.alarms.create(name, alarmInfo),
  onAlarm: {
    addListener: (listener) => browserAPI.alarms.onAlarm.addListener(listener),
    removeListener: (listener) => browserAPI.alarms.onAlarm.removeListener(listener)
  }
} : null;

// Cross-browser declarativeNetRequest API
export const declarativeNetRequest = browserAPI.declarativeNetRequest ? {
  updateDynamicRules: (options) => {
    if (isFirefox) {
      return browserAPI.declarativeNetRequest.updateDynamicRules(options);
    } else {
      return new Promise((resolve, reject) => {
        try {
          browserAPI.declarativeNetRequest.updateDynamicRules(options, () => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
            } else {
              resolve();
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    }
  }
} : null;