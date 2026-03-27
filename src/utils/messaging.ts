/**
 * Shared messaging utilities for safe cross-context communication.
 *
 * Consolidates the sendMessageSafely pattern that was duplicated across
 * popup/App.tsx, popup/components/Footer.tsx, popup/components/ConnectionInfo.tsx,
 * context/HeaderContext.tsx, background/header-manager.ts, and background/websocket.ts.
 */

import { runtime } from './browser-api';
import { getBrowserAPI } from '../types/browser';
import { logger } from './logger';

/** Standard response shape for extension messages */
export interface MessageResponse {
    error?: string;
    enabled?: boolean;
    hotkey?: string;
    [key: string]: unknown;
}

/**
 * Send a message via runtime.sendMessage with automatic lastError handling.
 * Returns a Promise that always resolves (never rejects) — errors are in the response.
 */
export function sendMessage(message: { type: string; [key: string]: unknown }): Promise<MessageResponse> {
    return new Promise((resolve) => {
        runtime.sendMessage(message, (response: unknown) => {
            const browserAPI = getBrowserAPI();
            if (browserAPI.runtime.lastError) {
                logger.info('Messaging', `Message '${message.type}' failed:`, browserAPI.runtime.lastError.message);
                resolve({ error: browserAPI.runtime.lastError.message });
            } else {
                resolve((response as MessageResponse) || {});
            }
        });
    });
}

/**
 * Send a message with a callback instead of a Promise.
 * Used in background scripts where the callback pattern is preferred.
 */
export function sendMessageWithCallback(
    message: Record<string, unknown>,
    callback?: (response: unknown, error: chrome.runtime.LastError | null) => void
): void {
    runtime.sendMessage(message, (response: unknown) => {
        const browserAPI = getBrowserAPI();
        if (browserAPI.runtime.lastError) {
            if (callback) callback(null, browserAPI.runtime.lastError);
        } else {
            if (callback) callback(response, null);
        }
    });
}
