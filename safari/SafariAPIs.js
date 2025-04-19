/**
 * Safari-specific APIs to bridge WebExtension API with Safari
 * This file gets loaded in Safari and creates compatibility layers
 */

// Safari doesn't have native sync storage, create a wrapper around local storage
window.safariStorage = {
    local: {
        get: (keys, callback) => {
            // Implement using Safari's extension storage
            browser.storage.local.get(keys).then(callback);
        },
        set: (items, callback) => {
            browser.storage.local.set(items).then(() => {
                if (callback) callback();
            }).catch(error => {
                console.error('Safari storage error:', error);
                if (callback) callback();
            });
        }
    },
    // Use local storage for sync in Safari
    sync: {
        get: (keys, callback) => {
            window.safariStorage.local.get(keys, callback);
        },
        set: (items, callback) => {
            window.safariStorage.local.set(items, callback);
        }
    },
    onChanged: {
        addListener: (listener) => {
            // Safari storage events
            browser.storage.onChanged.addListener((changes, areaName) => {
                listener(changes, areaName === 'local' ? 'sync' : areaName);
            });
        }
    }
};

// Safari doesn't support declarativeNetRequest in the same way
// Create a compatibility layer using webRequest
window.safariWebRequest = {
    updateDynamicRules: async (options) => {
        try {
            // If removing rules, clear them first
            if (options.removeRuleIds && options.removeRuleIds.length) {
                // In Safari we need to remove all rules and re-add the ones we want to keep
                // This is a simplification - a real implementation would be more complex
                await browser.declarativeNetRequest.updateSessionRules({
                    removeRuleIds: options.removeRuleIds
                });
            }

            // If adding rules, add them now
            if (options.addRules && options.addRules.length) {
                await browser.declarativeNetRequest.updateSessionRules({
                    addRules: options.addRules
                });
            }

            return Promise.resolve();
        } catch (error) {
            console.error('Safari web request error:', error);
            return Promise.reject(error);
        }
    }
};

// Safari's alarms API implementation
window.safariAlarms = {
    _timers: {},

    create: (name, alarmInfo) => {
        // Clear any existing timer
        if (window.safariAlarms._timers[name]) {
            clearInterval(window.safariAlarms._timers[name]);
        }

        // Convert alarm info to milliseconds
        let interval = 60000; // Default 1 minute
        if (alarmInfo) {
            if (alarmInfo.delayInMinutes) {
                interval = alarmInfo.delayInMinutes * 60000;
            } else if (alarmInfo.periodInMinutes) {
                interval = alarmInfo.periodInMinutes * 60000;
            }
        }

        // Create timer
        window.safariAlarms._timers[name] = setInterval(() => {
            // Trigger alarm event
            if (window.safariAlarms._listeners.length > 0) {
                window.safariAlarms._listeners.forEach(listener => {
                    listener({ name });
                });
            }
        }, interval);
    },

    _listeners: [],

    onAlarm: {
        addListener: (listener) => {
            window.safariAlarms._listeners.push(listener);
        }
    }
};

console.log('Safari API adapters initialized');