/**
 * Centralized logger with configurable log levels.
 *
 * Log levels (each includes all levels above it):
 * - error: Operation failures and exceptions
 * - warn:  Anomalies, retries, and fallbacks
 * - info:  Operational events and state changes
 * - debug: Detailed internals for troubleshooting (keep-alive pings, skip messages, etc.)
 *
 * Stored in chrome.storage.sync as `logLevel`. Default: 'info'.
 */

import { getBrowserAPI } from '../types/browser';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

let currentLevel: LogLevel = 'info';
let initialized = false;

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

export const logger = {
    error(...args: unknown[]): void {
        if (shouldLog('error')) console.error(...args);
    },

    warn(...args: unknown[]): void {
        if (shouldLog('warn')) console.warn(...args);
    },

    info(...args: unknown[]): void {
        if (shouldLog('info')) console.log(...args);
    },

    debug(...args: unknown[]): void {
        if (shouldLog('debug')) console.log('[DEBUG]', ...args);
    },

    getLevel(): LogLevel {
        return currentLevel;
    },

    setLevel(level: LogLevel): void {
        currentLevel = level;
        try {
            const browserAPI = getBrowserAPI();
            browserAPI.storage.sync.set({ logLevel: level });
        } catch {
            // Storage not available (e.g., in tests)
        }
    },

    /** Load saved log level from storage. Call once at startup. */
    async initialize(): Promise<void> {
        if (initialized) return;
        initialized = true;
        try {
            const browserAPI = getBrowserAPI();
            browserAPI.storage.sync.get(['logLevel'], (result: Record<string, unknown>) => {
                if (result.logLevel && typeof result.logLevel === 'string') {
                    const level = result.logLevel as LogLevel;
                    if (level in LOG_LEVELS) {
                        currentLevel = level;
                    }
                }
            });
        } catch {
            // Storage not available
        }
    },
};
