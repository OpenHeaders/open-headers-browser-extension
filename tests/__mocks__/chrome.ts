import { vi } from 'vitest';

const storageMock = {
    local: {
        get: vi.fn((_keys, callback) => callback?.({})),
        set: vi.fn((_items, callback) => callback?.()),
        remove: vi.fn((_keys, callback) => callback?.()),
        clear: vi.fn((callback) => callback?.()),
    },
    sync: {
        get: vi.fn((_keys, callback) => callback?.({})),
        set: vi.fn((_items, callback) => callback?.()),
        remove: vi.fn((_keys, callback) => callback?.()),
        clear: vi.fn((callback) => callback?.()),
    },
    onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
};

const runtimeMock = {
    sendMessage: vi.fn((_message, callback) => callback?.({})),
    onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
    onInstalled: {
        addListener: vi.fn(),
    },
    onStartup: {
        addListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    getManifest: vi.fn(() => ({ version: '4.0.0' })),
    lastError: null as chrome.runtime.LastError | null,
};

const tabsMock = {
    query: vi.fn((_queryInfo, callback) => callback?.([])),
    get: vi.fn((_tabId, callback) => callback?.({})),
    create: vi.fn((_createProperties, callback) => callback?.({})),
    update: vi.fn((_tabId, _updateProperties, callback) => callback?.({})),
    sendMessage: vi.fn((_tabId, _message, callback) => callback?.({})),
    onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
    onActivated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
    onRemoved: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
};

const alarmsMock = {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
    },
};

const declarativeNetRequestMock = {
    updateDynamicRules: vi.fn(() => Promise.resolve()),
    getDynamicRules: vi.fn(() => Promise.resolve([])),
};

const webRequestMock = {
    onBeforeRequest: { addListener: vi.fn() },
    onCompleted: { addListener: vi.fn() },
    onErrorOccurred: { addListener: vi.fn() },
    onResponseStarted: { addListener: vi.fn() },
    onBeforeRedirect: { addListener: vi.fn() },
};

const webNavigationMock = {
    onCommitted: { addListener: vi.fn() },
    onTabReplaced: { addListener: vi.fn() },
    onDOMContentLoaded: { addListener: vi.fn() },
};

const actionMock = {
    setBadgeText: vi.fn(() => Promise.resolve()),
    setBadgeBackgroundColor: vi.fn(() => Promise.resolve()),
    setTitle: vi.fn(() => Promise.resolve()),
};

const downloadsMock = {
    download: vi.fn((_options, callback) => callback?.(1)),
};

const cookiesMock = {
    getAll: vi.fn((_details, callback) => callback?.([])),
};

const windowsMock = {
    getCurrent: vi.fn((callback) => callback?.({ id: 1 })),
};

export const chrome = {
    storage: storageMock,
    runtime: runtimeMock,
    tabs: tabsMock,
    alarms: alarmsMock,
    declarativeNetRequest: declarativeNetRequestMock,
    webRequest: webRequestMock,
    webNavigation: webNavigationMock,
    action: actionMock,
    downloads: downloadsMock,
    cookies: cookiesMock,
    windows: windowsMock,
    scripting: {
        executeScript: vi.fn(() => Promise.resolve([])),
    },
    system: {
        display: {
            getInfo: vi.fn((callback) => callback?.([])),
        },
    },
};
