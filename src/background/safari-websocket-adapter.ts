/**
 * Browser-specific WebSocket handling
 */
import { isSafari } from '../utils/browser-api.js';

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
