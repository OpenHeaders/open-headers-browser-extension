/**
 * RuleEngine — single owner of declarativeNetRequest rule updates.
 *
 * All modules call ruleEngine.scheduleUpdate() instead of updateNetworkRules()
 * directly. The engine coalesces rapid calls, deduplicates by hash, and ensures
 * exactly one updateNetworkRules() call per logical change.
 *
 * Ownership:
 * - Sources changed (WebSocket)  → scheduleUpdate('sources')
 * - Rules changed (WebSocket)    → scheduleUpdate('rules')
 * - Saved data changed (storage) → scheduleUpdate('savedData')
 * - Pause toggled (storage)      → scheduleUpdate('pause', { immediate: true })
 * - Import (message handler)     → scheduleUpdate('import', { immediate: true })
 * - Init (background startup)    → scheduleUpdate('init', { immediate: true })
 */

import { updateNetworkRules } from '../header-manager';
import { getCurrentSources } from '../websocket';
import { generateSourcesHash, generateSavedDataHash } from './utils';
import { logger } from '../../utils/logger';

import type { Source } from '../../types/websocket';
import type { SavedDataMap } from '../../types/header';

interface ScheduleOptions {
    immediate?: boolean;
    sources?: Source[];
}

const DEBOUNCE_MS = 150;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastSourcesHash = '';
let lastSavedDataHash = '';
let lastRulesUpdateTime = 0;

/**
 * Schedule a rule update. Rapid calls within DEBOUNCE_MS are coalesced
 * into a single updateNetworkRules() call.
 */
export function scheduleUpdate(reason: string, options: ScheduleOptions = {}): void {
    if (options.immediate) {
        flushUpdate(reason, options.sources);
        return;
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        flushUpdate(reason, options.sources);
    }, DEBOUNCE_MS);
}

function flushUpdate(reason: string, explicitSources?: Source[]): void {
    const sources = explicitSources || getCurrentSources();
    const currentHash = generateSourcesHash(sources);

    // Skip if nothing changed (unless it's a forced reason like pause/import/init)
    const forcedReasons = ['pause', 'import', 'init', 'rules'];
    if (currentHash === lastSourcesHash && !forcedReasons.includes(reason)) {
        logger.debug(`Rule update skipped (${reason}) — hash unchanged`);
        return;
    }

    logger.info(`Updating network rules (${reason})`);
    updateNetworkRules(sources);
    lastSourcesHash = currentHash;
    lastRulesUpdateTime = Date.now();
}

// ── Hash tracking (used by background.ts for change detection) ──────

export function getLastSourcesHash(): string {
    return lastSourcesHash;
}

export function setLastSourcesHash(hash: string): void {
    lastSourcesHash = hash;
}

export function getLastSavedDataHash(): string {
    return lastSavedDataHash;
}

export function setLastSavedDataHash(hash: string): void {
    lastSavedDataHash = hash;
}

export function updateSavedDataHash(savedData: SavedDataMap): void {
    lastSavedDataHash = generateSavedDataHash(savedData);
}

export function getLastRulesUpdateTime(): number {
    return lastRulesUpdateTime;
}

export function setLastRulesUpdateTime(time: number): void {
    lastRulesUpdateTime = time;
}
