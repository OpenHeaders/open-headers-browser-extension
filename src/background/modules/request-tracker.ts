/**
 * Request Tracker - Tracks which tabs are making requests to domains with rules
 */

import { storage, tabs } from '../../utils/browser-api.js';
import { doesUrlMatchPattern, normalizeUrlForTracking, isTrackableUrl } from './url-utils';
import { getChunkedData } from '../../utils/storage-chunking.js';

import type { SavedDataMap, HeaderEntry } from '../../types/header';
import type { ActiveRule } from '../../types/browser';

// Constants
const MAX_TRACKED_URLS_PER_TAB = 50; // Limit tracked URLs to prevent memory leaks
const REVALIDATION_QUEUE = new Set<number>(); // Track pending revalidations
let isRevalidating = false; // Prevent concurrent revalidations

// Track which tabs are making requests to domains with rules
export const tabsWithActiveRules: Map<number, Set<string>> = new Map();

/**
 * Check if a URL matches any active rule
 */
export async function checkIfUrlMatchesAnyRule(url: string): Promise<boolean> {
    const normalizedUrl = normalizeUrlForTracking(url);

    return new Promise<boolean>((resolve) => {
        getChunkedData('savedData', (savedData: SavedDataMap | null) => {
            savedData = savedData || {};

            // Check if this URL matches any enabled rule
            for (const id in savedData) {
                const entry: HeaderEntry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) continue;

                // Check each domain pattern
                const domains: string[] = entry.domains || [];
                for (const domain of domains) {
                    if (doesUrlMatchPattern(normalizedUrl, domain)) {
                        resolve(true);
                        return;
                    }
                }
            }

            resolve(false);
        });
    });
}

/**
 * Get all active rules for a specific tab (direct and indirect matches)
 */
export async function getActiveRulesForTab(tabId: number | undefined, tabUrl: string): Promise<ActiveRule[]> {
    if (!tabUrl || !isTrackableUrl(tabUrl)) {
        return [];
    }

    const urlObj = new URL(tabUrl);
    const _tabDomain = urlObj.hostname;

    // Get tracked domains for this tab (indirect matches)
    const trackedDomains: string[] = [];
    if (tabId && tabsWithActiveRules.has(tabId)) {
        const trackedUrls = tabsWithActiveRules.get(tabId)!;
        trackedUrls.forEach(url => {
            try {
                const trackedUrlObj = new URL(url);
                trackedDomains.push(trackedUrlObj.hostname);
            } catch (e) {
                // Invalid URL, skip
            }
        });
    }

    return new Promise<ActiveRule[]>((resolve) => {
        getChunkedData('savedData', (savedData: SavedDataMap | null) => {
            savedData = savedData || {};
            const activeRules: ActiveRule[] = [];

            for (const id in savedData) {
                const entry: HeaderEntry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) continue;

                const domains: string[] = entry.domains || [];
                let matchType: 'direct' | 'indirect' | null = null;

                // Check if rule applies to all domains
                if (domains.length === 0) {
                    matchType = 'direct'; // Rules without domains apply everywhere
                } else {
                    // Check for direct match (main page domain)
                    for (const domain of domains) {
                        if (doesUrlMatchPattern(tabUrl, domain)) {
                            matchType = 'direct';
                            break;
                        }
                    }

                    // If no direct match, check for indirect match (resource domains)
                    if (!matchType && trackedDomains.length > 0) {
                        for (const domain of domains) {
                            for (const trackedDomain of trackedDomains) {
                                // Create a temporary URL for pattern matching
                                const tempUrl = `https://${trackedDomain}/`;
                                if (doesUrlMatchPattern(tempUrl, domain)) {
                                    matchType = 'indirect';
                                    break;
                                }
                            }
                            if (matchType) break;
                        }
                    }
                }

                if (matchType) {
                    activeRules.push({
                        ...entry,
                        id: id,  // Ensure ID is set properly
                        key: id, // Add key for React table
                        matchType
                    });
                }
            }

            resolve(activeRules);
        });
    });
}

/**
 * Check if any rules apply to the current tab
 */
export async function checkRulesForTab(tabUrl: string): Promise<boolean> {
    // Get current tab
    const currentTab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
        tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
            resolve(tabsList[0]);
        });
    });

    if (!currentTab) return false;

    // Use the centralized function
    const activeRules = await getActiveRulesForTab(currentTab.id, tabUrl);
    return activeRules.length > 0;
}

/**
 * Re-evaluate tracked requests when rules change
 */
export async function revalidateTrackedRequests(): Promise<void> {
    // Add to queue if already revalidating
    if (isRevalidating) {
        REVALIDATION_QUEUE.add(Date.now());
        console.log('Info: Revalidation already in progress, queued for later');
        return;
    }

    isRevalidating = true;
    console.log('Info: Starting revalidation of tracked requests');

    try {
        await new Promise<void>((resolve) => {
            getChunkedData('savedData', async (savedData: SavedDataMap | null) => {
                savedData = savedData || {};
                const enabledRules: [string, HeaderEntry][] = Object.entries(savedData).filter(
                    ([_, entry]) => entry.isEnabled !== false
                );

                // If no enabled rules, clear all tracking
                if (enabledRules.length === 0) {
                    tabsWithActiveRules.clear();
                    console.log('Info: No enabled rules, cleared all request tracking');
                    resolve();
                    return;
                }

                // For each tracked tab, re-evaluate if its requests still match any enabled rules
                for (const [tabId, trackedUrls] of tabsWithActiveRules.entries()) {
                    const validUrls = new Set<string>();

                    // Limit the number of URLs we check to prevent performance issues
                    const urlsToCheck = Array.from(trackedUrls).slice(-MAX_TRACKED_URLS_PER_TAB);

                    // Check each tracked URL against current enabled rules
                    for (const url of urlsToCheck) {
                        let stillMatches = false;

                        for (const [_id, entry] of enabledRules) {
                            const domains: string[] = entry.domains || [];
                            for (const domain of domains) {
                                if (doesUrlMatchPattern(url, domain)) {
                                    stillMatches = true;
                                    break;
                                }
                            }
                            if (stillMatches) break;
                        }

                        if (stillMatches) {
                            validUrls.add(url);
                        }
                    }

                    // Update or remove the tab's tracking based on results
                    if (validUrls.size > 0) {
                        tabsWithActiveRules.set(tabId, validUrls);
                        console.log(`Info: Tab ${tabId} still has ${validUrls.size} valid tracked requests`);
                    } else {
                        tabsWithActiveRules.delete(tabId);
                        console.log(`Info: Tab ${tabId} no longer has valid tracked requests`);
                    }
                }

                resolve();
            });
        });
    } finally {
        isRevalidating = false;

        // Process any queued revalidations
        if (REVALIDATION_QUEUE.size > 0) {
            REVALIDATION_QUEUE.clear();
            console.log('Info: Processing queued revalidation');
            setTimeout(() => revalidateTrackedRequests(), 100);
        }
    }
}

/**
 * Restore tracking state after service worker restart
 */
export async function restoreTrackingState(updateBadgeCallback: () => void): Promise<void> {
    console.log('Info: Attempting to restore tracking state after restart');

    // Get all tabs
    tabs.query({}, async (allTabs: chrome.tabs.Tab[]) => {
        for (const tab of allTabs) {
            if (tab.url && tab.id && isTrackableUrl(tab.url)) {
                // Check if this tab's URL matches any rules
                const matchesRule = await checkIfUrlMatchesAnyRule(tab.url);
                if (matchesRule) {
                    // Add to tracking
                    if (!tabsWithActiveRules.has(tab.id)) {
                        tabsWithActiveRules.set(tab.id, new Set());
                    }
                    tabsWithActiveRules.get(tab.id)!.add(normalizeUrlForTracking(tab.url));
                    console.log(`Info: Restored tracking for tab ${tab.id} - ${tab.url}`);
                }
            }
        }

        // Update badge for current tab
        if (updateBadgeCallback) {
            updateBadgeCallback();
        }
    });
}

/**
 * Add a tracked URL for a tab
 */
export function addTrackedUrl(tabId: number, url: string): void {
    if (!tabsWithActiveRules.has(tabId)) {
        tabsWithActiveRules.set(tabId, new Set());
    }

    const trackedUrls = tabsWithActiveRules.get(tabId)!;

    // Limit the number of tracked URLs per tab to prevent memory leaks
    if (trackedUrls.size >= MAX_TRACKED_URLS_PER_TAB) {
        // Remove oldest entries (convert to array, remove first items, convert back)
        const urlArray = Array.from(trackedUrls);
        const newUrls = new Set(urlArray.slice(-MAX_TRACKED_URLS_PER_TAB + 1));
        tabsWithActiveRules.set(tabId, newUrls);
        trackedUrls.clear();
        newUrls.forEach(u => trackedUrls.add(u));
    }

    trackedUrls.add(url);
}

/**
 * Clear tracking for a tab
 */
export function clearTabTracking(tabId: number): void {
    tabsWithActiveRules.delete(tabId);
}

/**
 * Clear all tracking
 */
export function clearAllTracking(): void {
    tabsWithActiveRules.clear();
}
