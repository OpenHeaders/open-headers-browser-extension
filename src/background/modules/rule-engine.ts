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
import { getCurrentSources } from './sources-store';
import { generateSourcesHash, generateSavedDataHash } from './utils';
import { logger } from '../../utils/logger';

import type { Source } from '../../types/websocket';
import type { SavedDataMap } from '../../types/header';

interface ScheduleOptions {
    immediate?: boolean;
    sources?: Source[];
}

const DEBOUNCE_MS = 150;
const FORCED_REASONS = new Set(['pause', 'import', 'init', 'rules', 'savedData', 'rulesUpdated']);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let forcedPending = false;
let lastSourcesHash = '';
let lastSavedDataHash = '';
let lastRulesUpdateTime = 0;

/**
 * Schedule a rule update. Rapid calls within DEBOUNCE_MS are coalesced
 * into a single updateNetworkRules() call.
 *
 * If any call during the debounce window has a forced reason, the
 * coalesced update will always proceed (skip the hash check).
 */
export function scheduleUpdate(reason: string, options: ScheduleOptions = {}): void {
    if (options.immediate) {
        forcedPending = false;
        flushUpdate(reason, options.sources, FORCED_REASONS.has(reason));
        return;
    }

    if (FORCED_REASONS.has(reason)) {
        forcedPending = true;
    }

    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const forced = forcedPending;
        forcedPending = false;
        flushUpdate(reason, options.sources, forced);
    }, DEBOUNCE_MS);
}

function flushUpdate(reason: string, explicitSources?: Source[], forced?: boolean): void {
    const sources = explicitSources || getCurrentSources();
    const currentHash = generateSourcesHash(sources);

    // Skip if nothing changed — unless forced (a forced reason was seen during the debounce window)
    if (currentHash === lastSourcesHash && !forced) {
        logger.debug('RuleEngine', `Rule update skipped (${reason}) — hash unchanged`);
        return;
    }

    logger.info('RuleEngine', `Updating network rules (${reason})`);
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
