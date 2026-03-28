/**
 * Cross-browser compatibility layer
 * Provides unified API for working with browser extensions APIs
 */

// Detect browser environment
declare const browser: typeof chrome | undefined;
import { logger } from './logger';

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Browser detection flags — use userAgent, not `typeof browser`, because
// Chrome MV3 now defines a `browser` alias for `chrome`.
export const isFirefox: boolean = /Firefox/.test(navigator.userAgent);
export const isEdge: boolean = !isFirefox && navigator.userAgent.indexOf('Edg') !== -1;
export const isChrome: boolean = !isFirefox && !isEdge && navigator.userAgent.indexOf('Chrome') !== -1;
export const isSafari: boolean = !isFirefox && navigator.userAgent.indexOf('Safari') !== -1 && navigator.userAgent.indexOf('Chrome') === -1;

// Storage callback types
type StorageGetCallback = (items: Record<string, unknown>) => void;
type StorageSetCallback = () => void;

// Use proper storage APIs
export const storage = {
  sync: {
    get: (keys: string | string[] | null, callback: StorageGetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.sync.get(keys as string[]) as unknown as Promise<Record<string, unknown>>).then(callback);
      } else {
        return browserAPI.storage.sync.get(keys as string[], callback);
      }
    },
    set: (items: Record<string, unknown>, callback?: StorageSetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.sync.set(items) as unknown as Promise<void>).then(callback || (() => {}));
      } else {
        return browserAPI.storage.sync.set(items, callback!);
      }
    },
    remove: (keys: string | string[], callback?: StorageSetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.sync.remove(keys as string[]) as unknown as Promise<void>).then(callback || (() => {}));
      } else {
        return browserAPI.storage.sync.remove(keys as string[], callback!);
      }
    },
    clear: (callback?: StorageSetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.sync.clear() as unknown as Promise<void>).then(callback || (() => {}));
      } else {
        return browserAPI.storage.sync.clear(callback!);
      }
    }
  },
  local: {
    get: (keys: string | string[] | null, callback: StorageGetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.local.get(keys as string[]) as unknown as Promise<Record<string, unknown>>).then(callback);
      } else {
        return browserAPI.storage.local.get(keys as string[], callback);
      }
    },
    set: (items: Record<string, unknown>, callback?: StorageSetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.local.set(items) as unknown as Promise<void>).then(callback || (() => {}));
      } else {
        return browserAPI.storage.local.set(items, callback!);
      }
    },
    remove: (keys: string | string[], callback?: StorageSetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.local.remove(keys as string[]) as unknown as Promise<void>).then(callback || (() => {}));
      } else {
        return browserAPI.storage.local.remove(keys as string[], callback!);
      }
    },
    clear: (callback?: StorageSetCallback): void | Promise<void> => {
      if (isFirefox) {
        return (browserAPI.storage.local.clear() as unknown as Promise<void>).then(callback || (() => {}));
      } else {
        return browserAPI.storage.local.clear(callback!);
      }
    }
  },
  onChanged: {
    addListener: (listener: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void): void => {
      return browserAPI.storage.onChanged.addListener(listener);
    },
    removeListener: (listener: (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void): void => {
      return browserAPI.storage.onChanged.removeListener(listener);
    }
  }
};

type MessageCallback = (response: unknown) => void;
type MessageListener = (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean | void;

// Cross-browser runtime API with improved error handling
export const runtime = {
  getURL: (path: string): string => browserAPI.runtime.getURL(path),
  sendMessage: (message: unknown, callback?: MessageCallback): void => {
    if (isFirefox) {
      // Firefox uses promises
      const promise = browserAPI.runtime.sendMessage(message);

      if (callback) {
        promise
            .then((response: unknown) => callback(response))
            .catch((error: Error) => {
              logger.info('BrowserAPI', 'Firefox message error:', error.message);
              // Call callback with no response to maintain compatibility
              callback(undefined);
            });
      }
    } else {
      // Chrome/Edge use callbacks
      try {
        browserAPI.runtime.sendMessage(message, (response: unknown) => {
          // Chrome sets lastError if there was a problem
          if (callback) {
            callback(response);
          }
        });
      } catch (error) {
        logger.info('BrowserAPI', 'Chrome message error:', (error as Error).message);
        if (callback) {
          // Call callback with no response
          setTimeout(() => callback(undefined), 0);
        }
      }
    }
  },
  onMessage: {
    addListener: (listener: MessageListener): void => browserAPI.runtime.onMessage.addListener(listener),
    removeListener: (listener: MessageListener): void => browserAPI.runtime.onMessage.removeListener(listener)
  },
  get lastError() { return browserAPI.runtime.lastError; },
  getManifest: (): chrome.runtime.Manifest => browserAPI.runtime.getManifest(),
  onInstalled: {
    addListener: (listener: (details: chrome.runtime.InstalledDetails) => void): void => browserAPI.runtime.onInstalled.addListener(listener),
    removeListener: (listener: (details: chrome.runtime.InstalledDetails) => void): void => browserAPI.runtime.onInstalled.removeListener(listener)
  },
  onStartup: {
    addListener: (listener: () => void): void => browserAPI.runtime.onStartup.addListener(listener),
    removeListener: (listener: () => void): void => browserAPI.runtime.onStartup.removeListener(listener)
  },
  onConnect: browserAPI.runtime.onConnect ? {
    addListener: (listener: (port: chrome.runtime.Port) => void): void => browserAPI.runtime.onConnect.addListener(listener),
    removeListener: (listener: (port: chrome.runtime.Port) => void): void => browserAPI.runtime.onConnect.removeListener(listener)
  } : null,
  onSuspend: browserAPI.runtime.onSuspend ? {
    addListener: (listener: () => void): void => browserAPI.runtime.onSuspend.addListener(listener),
    removeListener: (listener: () => void): void => browserAPI.runtime.onSuspend.removeListener(listener)
  } : null,
  connect: (connectInfo?: chrome.runtime.ConnectInfo): chrome.runtime.Port => browserAPI.runtime.connect(connectInfo)
};

type TabCallback = (tab: chrome.tabs.Tab) => void;
type TabsQueryCallback = (tabs: chrome.tabs.Tab[]) => void;

// Cross-browser tabs API
export const tabs = {
  create: (options: chrome.tabs.CreateProperties, callback?: TabCallback): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.tabs.create(options) as unknown as Promise<chrome.tabs.Tab>).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.create(options, callback!);
    }
  },
  query: (options: chrome.tabs.QueryInfo, callback?: TabsQueryCallback): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.tabs.query(options) as unknown as Promise<chrome.tabs.Tab[]>).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.query(options, callback!);
    }
  },
  get: (tabId: number, callback?: TabCallback): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.tabs.get(tabId) as unknown as Promise<chrome.tabs.Tab>).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.get(tabId, callback!);
    }
  },
  update: (tabId: number, options: chrome.tabs.UpdateProperties, callback?: (tab?: chrome.tabs.Tab) => void): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.tabs.update(tabId, options) as unknown as Promise<chrome.tabs.Tab>).then(callback || (() => {}));
    } else {
      return browserAPI.tabs.update(tabId, options, callback!);
    }
  },
  sendMessage: (tabId: number, message: unknown, callback?: MessageCallback): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.tabs.sendMessage(tabId, message) as unknown as Promise<unknown>).then(callback || (() => {}));
    } else {
      return (browserAPI.tabs.sendMessage as (tabId: number, message: unknown, callback: (response: unknown) => void) => void)(tabId, message, callback!);
    }
  },
  onActivated: browserAPI.tabs.onActivated,
  onUpdated: browserAPI.tabs.onUpdated,
  onRemoved: browserAPI.tabs.onRemoved,
  onReplaced: browserAPI.tabs.onReplaced,
  onCreated: browserAPI.tabs.onCreated
};

// Cross-browser alarms API
export const alarms = browserAPI.alarms ? {
  create: (name: string, alarmInfo: chrome.alarms.AlarmCreateInfo): void => { browserAPI.alarms.create(name, alarmInfo); },
  onAlarm: {
    addListener: (listener: (alarm: chrome.alarms.Alarm) => void): void => browserAPI.alarms.onAlarm.addListener(listener),
    removeListener: (listener: (alarm: chrome.alarms.Alarm) => void): void => browserAPI.alarms.onAlarm.removeListener(listener)
  }
} : null;

// Cross-browser declarativeNetRequest API
export const declarativeNetRequest = browserAPI.declarativeNetRequest ? {
  updateDynamicRules: (options: chrome.declarativeNetRequest.UpdateRuleOptions): Promise<void> => {
    if (isFirefox) {
      return browserAPI.declarativeNetRequest.updateDynamicRules(options);
    } else {
      return new Promise<void>((resolve, reject) => {
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
  },
  getDynamicRules: (): Promise<chrome.declarativeNetRequest.Rule[]> => {
    if (isFirefox) {
      return browserAPI.declarativeNetRequest.getDynamicRules();
    } else {
      return new Promise<chrome.declarativeNetRequest.Rule[]>((resolve, reject) => {
        try {
          browserAPI.declarativeNetRequest.getDynamicRules((rules) => {
            if (browserAPI.runtime.lastError) {
              reject(browserAPI.runtime.lastError);
            } else {
              resolve(rules);
            }
          });
        } catch (e) {
          reject(e);
        }
      });
    }
  }
} : null;

type DownloadCallback = (downloadId: number) => void;

// Cross-browser downloads API
export const downloads = browserAPI.downloads ? {
  download: (options: chrome.downloads.DownloadOptions, callback?: DownloadCallback): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.downloads.download(options) as unknown as Promise<number>).then(callback || (() => {}));
    } else {
      return browserAPI.downloads.download(options, callback!);
    }
  }
} : null;

// Cross-browser cookies API
export const cookies = browserAPI.cookies ? {
  getAll: (details: chrome.cookies.GetAllDetails, callback?: (cookies: chrome.cookies.Cookie[]) => void): void | Promise<void> => {
    if (isFirefox) {
      return (browserAPI.cookies.getAll(details) as unknown as Promise<chrome.cookies.Cookie[]>).then(callback || (() => {}));
    } else {
      return browserAPI.cookies.getAll(details, callback!);
    }
  }
} : null;

// Cross-browser windows API
export const windows = browserAPI.windows ? {
  WINDOW_ID_NONE: browserAPI.windows.WINDOW_ID_NONE,
  onFocusChanged: browserAPI.windows.onFocusChanged ? {
    addListener: (listener: (windowId: number) => void): void => browserAPI.windows.onFocusChanged.addListener(listener),
    removeListener: (listener: (windowId: number) => void): void => browserAPI.windows.onFocusChanged.removeListener(listener)
  } : null
} : null;

type WebNavigationListener = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => void;
// Cross-browser webNavigation API
export const webNavigation = browserAPI.webNavigation ? {
  onCommitted: browserAPI.webNavigation.onCommitted ? {
    addListener: (listener: WebNavigationListener): void => browserAPI.webNavigation.onCommitted.addListener(listener),
    removeListener: (listener: WebNavigationListener): void => browserAPI.webNavigation.onCommitted.removeListener(listener)
  } : null,
  onHistoryStateUpdated: browserAPI.webNavigation.onHistoryStateUpdated ? {
    addListener: (listener: WebNavigationListener): void => browserAPI.webNavigation.onHistoryStateUpdated.addListener(listener),
    removeListener: (listener: WebNavigationListener): void => browserAPI.webNavigation.onHistoryStateUpdated.removeListener(listener)
  } : null,
  onTabReplaced: browserAPI.webNavigation.onTabReplaced ? {
    addListener: (listener: (details: { replacedTabId: number; tabId: number; timeStamp: number }) => void): void => (browserAPI.webNavigation.onTabReplaced as unknown as chrome.events.Event<(details: { replacedTabId: number; tabId: number; timeStamp: number }) => void>).addListener(listener),
    removeListener: (listener: (details: { replacedTabId: number; tabId: number; timeStamp: number }) => void): void => (browserAPI.webNavigation.onTabReplaced as unknown as chrome.events.Event<(details: { replacedTabId: number; tabId: number; timeStamp: number }) => void>).removeListener(listener)
  } : null
} : null;
