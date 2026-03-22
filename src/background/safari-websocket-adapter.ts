/**
 * Browser-specific WebSocket handling
 */
import { isSafari, isFirefox } from '../utils/browser-api.js';

/**
 * Modifies WebSocket connection behavior for different browsers
 */
export function adaptWebSocketUrl(url: string): string {
    // Safari needs native app communication in some cases
    if (isSafari) {
        // Check if we should use a different connection mechanism
        // For now, we'll use the same URL
        return url;
    }

    // Firefox uses wss:// by default, even for localhost
    // We need to explicitly use ws:// for localhost connections
    if (isFirefox) {
        // For Firefox, always ensure we're using ws:// for localhost connections
        // This addresses the issue where Firefox tries to use wss:// for security
        if (url.includes('127.0.0.1') || url.includes('localhost')) {
            // Force non-secure WebSocket for localhost
            return url.replace(/^wss:\/\//, 'ws://').replace(/^https:\/\//, 'http://');
        }
    }

    return url;
}

/**
 * Special pre-check for Safari WebSocket connections
 */
export async function safariPreCheck(_url?: string): Promise<boolean> {
    if (!isSafari) return true;

    // Safari might need special permission handling
    return new Promise<boolean>(resolve => {
        // For now, just allow connection
        resolve(true);
    });
}
