/**
 * SourcesStore — single owner of dynamic source state.
 *
 * Authority hierarchy:
 *   1. WebSocket (desktop app) — authoritative; overwrites everything
 *   2. storage.local           — persistence layer for offline / restart
 *   3. In-memory cache         — fast reads between storage round-trips
 *
 * On init the store hydrates from storage.local so the extension can
 * serve cached sources even before the WebSocket connects.
 * When a WebSocket message arrives it writes through: memory → storage.
 */

import { storage } from '../../utils/browser-api.js';
import { logger } from '../../utils/logger';

import type { Source } from '../../types/websocket';

// ── In-memory cache ──────────────────────────────────────────────────

let sources: Source[] = [];

// ── Public API ───────────────────────────────────────────────────────

/** Return the current sources (in-memory cache). */
export function getCurrentSources(): Source[] {
    return sources;
}

/**
 * Authoritative write — called when the desktop app pushes sources
 * via WebSocket. Overwrites both memory and storage.
 */
export function setSourcesFromApp(incoming: Source[]): void {
    sources = incoming;
    persistToStorage();
}

/**
 * Hydrate in-memory cache from storage.local.
 * Called once at startup so the extension can work offline.
 * Returns a Promise that resolves with the restored sources (or []).
 */
export function hydrateFromStorage(): Promise<Source[]> {
    return new Promise((resolve) => {
        storage.local.get(['dynamicSources'], (result: Record<string, unknown>) => {
            if (result.dynamicSources && Array.isArray(result.dynamicSources) && (result.dynamicSources as Source[]).length > 0) {
                sources = result.dynamicSources as Source[];
                logger.info('SourcesStore', 'Hydrated', sources.length, 'sources from storage');
            }
            resolve(sources);
        });
    });
}

// ── Internal ─────────────────────────────────────────────────────────

function persistToStorage(): void {
    storage.local.set({ dynamicSources: sources }, () => {
        logger.debug('SourcesStore', 'Persisted', sources.length, 'sources to storage');
    });
}
