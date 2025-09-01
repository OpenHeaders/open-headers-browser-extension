/**
 * Request Tracker - Tracks which tabs are making requests to domains with rules
 */

import { storage, tabs } from '../../utils/browser-api.js';
import { doesUrlMatchPattern, normalizeUrlForTracking, isTrackableUrl } from './url-utils.js';
import { getChunkedData } from '../../utils/storage-chunking.js';

// Constants
const MAX_TRACKED_URLS_PER_TAB = 50; // Limit tracked URLs to prevent memory leaks
const REVALIDATION_QUEUE = new Set(); // Track pending revalidations
let isRevalidating = false; // Prevent concurrent revalidations

// Track which tabs are making requests to domains with rules
export const tabsWithActiveRules = new Map(); // Map of tabId -> Set of matched domains

/**
 * Check if a URL matches any active rule
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Whether the URL matches any active rule
 */
export async function checkIfUrlMatchesAnyRule(url) {
    const normalizedUrl = normalizeUrlForTracking(url);

    return new Promise((resolve) => {
        getChunkedData('savedData', (savedData) => {
            savedData = savedData || {};

            // Check if this URL matches any enabled rule
            for (const id in savedData) {
                const entry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) continue;

                // Check each domain pattern
                const domains = entry.domains || [];
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
 * @param {number} tabId - The tab ID
 * @param {string} tabUrl - The URL of the tab
 * @returns {Promise<Array>} - Array of rules with match type
 */
export async function getActiveRulesForTab(tabId, tabUrl) {
    if (!tabUrl || !isTrackableUrl(tabUrl)) {
        return [];
    }

    const urlObj = new URL(tabUrl);
    const tabDomain = urlObj.hostname;
    
    // Get tracked domains for this tab (indirect matches)
    const trackedDomains = [];
    if (tabId && tabsWithActiveRules.has(tabId)) {
        const trackedUrls = tabsWithActiveRules.get(tabId);
        trackedUrls.forEach(url => {
            try {
                const trackedUrlObj = new URL(url);
                trackedDomains.push(trackedUrlObj.hostname);
            } catch (e) {
                // Invalid URL, skip
            }
        });
    }

    return new Promise((resolve) => {
        getChunkedData('savedData', (savedData) => {
            savedData = savedData || {};
            const activeRules = [];

            for (const id in savedData) {
                const entry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) continue;

                const domains = entry.domains || [];
                let matchType = null;

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
 * @param {string} tabUrl - The URL of the current tab
 * @returns {Promise<boolean>} - Whether any active rules apply
 */
export async function checkRulesForTab(tabUrl) {
    // Get current tab
    const currentTab = await new Promise((resolve) => {
        tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
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
export async function revalidateTrackedRequests() {
    // Add to queue if already revalidating
    if (isRevalidating) {
        REVALIDATION_QUEUE.add(Date.now());
        console.log('Info: Revalidation already in progress, queued for later');
        return;
    }

    isRevalidating = true;
    console.log('Info: Starting revalidation of tracked requests');

    try {
        await new Promise((resolve) => {
            getChunkedData('savedData', async (savedData) => {
                savedData = savedData || {};
                const enabledRules = Object.entries(savedData).filter(([_, entry]) => entry.isEnabled !== false);

                // If no enabled rules, clear all tracking
                if (enabledRules.length === 0) {
                    tabsWithActiveRules.clear();
                    console.log('Info: No enabled rules, cleared all request tracking');
                    resolve();
                    return;
                }

                // For each tracked tab, re-evaluate if its requests still match any enabled rules
                for (const [tabId, trackedUrls] of tabsWithActiveRules.entries()) {
                    const validUrls = new Set();

                    // Limit the number of URLs we check to prevent performance issues
                    const urlsToCheck = Array.from(trackedUrls).slice(-MAX_TRACKED_URLS_PER_TAB);

                    // Check each tracked URL against current enabled rules
                    for (const url of urlsToCheck) {
                        let stillMatches = false;

                        for (const [id, entry] of enabledRules) {
                            const domains = entry.domains || [];
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
export async function restoreTrackingState(updateBadgeCallback) {
    console.log('Info: Attempting to restore tracking state after restart');

    // Get all tabs
    tabs.query({}, async (allTabs) => {
        for (const tab of allTabs) {
            if (tab.url && tab.id && isTrackableUrl(tab.url)) {
                // Check if this tab's URL matches any rules
                const matchesRule = await checkIfUrlMatchesAnyRule(tab.url);
                if (matchesRule) {
                    // Add to tracking
                    if (!tabsWithActiveRules.has(tab.id)) {
                        tabsWithActiveRules.set(tab.id, new Set());
                    }
                    tabsWithActiveRules.get(tab.id).add(normalizeUrlForTracking(tab.url));
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
export function addTrackedUrl(tabId, url) {
    if (!tabsWithActiveRules.has(tabId)) {
        tabsWithActiveRules.set(tabId, new Set());
    }

    const trackedUrls = tabsWithActiveRules.get(tabId);

    // Limit the number of tracked URLs per tab to prevent memory leaks
    if (trackedUrls.size >= MAX_TRACKED_URLS_PER_TAB) {
        // Remove oldest entries (convert to array, remove first items, convert back)
        const urlArray = Array.from(trackedUrls);
        const newUrls = new Set(urlArray.slice(-MAX_TRACKED_URLS_PER_TAB + 1));
        tabsWithActiveRules.set(tabId, newUrls);
        trackedUrls.clear();
        newUrls.forEach(url => trackedUrls.add(url));
    }

    trackedUrls.add(url);
}

/**
 * Clear tracking for a tab
 */
export function clearTabTracking(tabId) {
    tabsWithActiveRules.delete(tabId);
}

/**
 * Clear all tracking
 */
export function clearAllTracking() {
    tabsWithActiveRules.clear();
}