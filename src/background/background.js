/**
 * Main background service worker with placeholder header tracking
 */

import { connectWebSocket, getCurrentSources, isWebSocketConnected } from './websocket.js';
import { updateNetworkRules } from './header-manager.js';
import { alarms, runtime, storage, tabs, isFirefox, isChrome, isEdge, isSafari } from '../utils/browser-api.js';

// Constants
const MAX_TRACKED_URLS_PER_TAB = 50; // Limit tracked URLs to prevent memory leaks
const REVALIDATION_QUEUE = new Set(); // Track pending revalidations
let isRevalidating = false; // Prevent concurrent revalidations

// Store a hash or timestamp of the last update to avoid redundant processing
let lastSourcesHash = '';
let lastRulesUpdateTime = 0;

// Track last saved data hash to avoid redundant updates
let lastSavedDataHash = '';

// Track if we're currently opening a welcome page to prevent duplicates
let welcomePageOpenedBySocket = false;
let welcomePageBeingOpened = false;

// Track last badge state to avoid unnecessary updates
let lastBadgeState = null;

// Track headers using placeholders
let headersUsingPlaceholders = [];

// Track which tabs are making requests to domains with rules
let tabsWithActiveRules = new Map(); // Map of tabId -> Set of matched domains

// Function to generate a simple hash of sources to detect changes
function generateSourcesHash(sources) {
    if (!sources || !Array.isArray(sources)) return '';

    // Create a simplified representation of the sources to compare
    const simplifiedSources = sources.map(source => {
        return {
            id: source.sourceId || source.locationId,
            content: source.sourceContent || source.locationContent
        };
    });

    return JSON.stringify(simplifiedSources);
}

// Function to generate a hash of saved data to detect meaningful changes
function generateSavedDataHash(savedData) {
    if (!savedData) return '';

    // Create a simplified representation of the saved data to compare
    const simplifiedData = Object.entries(savedData).map(([id, entry]) => {
        return {
            id,
            name: entry.headerName,
            value: entry.headerValue,
            isDynamic: entry.isDynamic,
            sourceId: entry.sourceId,
            sourceMissing: entry.sourceMissing
        };
    });

    return JSON.stringify(simplifiedData);
}

/**
 * Normalize a URL for consistent tracking
 * Removes fragments, normalizes case, handles IDN domains
 */
function normalizeUrlForTracking(url) {
    try {
        const urlObj = new URL(url);

        // Remove fragment
        urlObj.hash = '';

        // Normalize hostname to lowercase
        urlObj.hostname = urlObj.hostname.toLowerCase();

        // Handle IDN domains - convert to ASCII (punycode)
        if (urlObj.hostname.includes('xn--') || /[^\x00-\x7F]/.test(urlObj.hostname)) {
            // Already punycoded or contains non-ASCII
            // Browser already handles this, but ensure consistency
        }

        // Remove default ports
        if ((urlObj.protocol === 'http:' && urlObj.port === '80') ||
            (urlObj.protocol === 'https:' && urlObj.port === '443')) {
            urlObj.port = '';
        }

        // Remove trailing slash from pathname if it's just /
        if (urlObj.pathname === '/') {
            urlObj.pathname = '';
        }

        return urlObj.toString();
    } catch (e) {
        // If URL parsing fails, return original
        return url.toLowerCase();
    }
}

/**
 * Check if a URL should be tracked at all
 */
function isTrackableUrl(url) {
    if (!url) return false;

    // List of URL schemes that should not be tracked
    const nonTrackableSchemes = [
        'about:',
        'chrome:',
        'chrome-extension:',
        'edge:',
        'extension:',
        'moz-extension:',
        'opera:',
        'vivaldi:',
        'brave:',
        'data:',
        'blob:',
        'javascript:',
        'view-source:',
        'ws:',
        'wss:',
        'ftp:',
        'sftp:',
        'chrome-devtools:',
        'devtools:'
    ];

    // Check if URL starts with any non-trackable scheme
    const lowerUrl = url.toLowerCase();
    for (const scheme of nonTrackableSchemes) {
        if (lowerUrl.startsWith(scheme)) {
            console.log(`Info: Ignoring non-trackable URL scheme: ${url}`);
            return false;
        }
    }

    // Special handling for file:// URLs - only track if extension has file access
    if (lowerUrl.startsWith('file://')) {
        // You might want to check if the extension has file access permission
        // For now, we'll allow tracking but pattern matching might need adjustment
        console.log(`Info: File URL detected, tracking may be limited: ${url}`);
    }

    return true;
}

/**
 * Re-evaluate tracked requests when rules change
 */
async function revalidateTrackedRequests() {
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
            storage.sync.get(['savedData'], async (result) => {
                const savedData = result.savedData || {};
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
async function restoreTrackingState() {
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
        updateBadgeForCurrentTab();
    });
}

/**
 * Set up request monitoring to track which domains tabs are making requests to
 */
function setupRequestMonitoring() {
    // Check if webRequest API is available
    const webRequestAPI = chrome.webRequest || browser.webRequest;

    if (!webRequestAPI) {
        console.log('Info: webRequest API not available');
        return;
    }

    console.log('Info: Setting up request monitoring for badge updates');

    // Track pending requests to handle failures
    const pendingRequests = new Map(); // requestId -> { tabId, url, headersApplied }

    // Monitor all outgoing requests
    webRequestAPI.onBeforeRequest.addListener(
        async (details) => {
            // Skip non-tab requests
            if (details.tabId === -1) return;

            // Skip non-trackable URLs
            if (!isTrackableUrl(details.url)) {
                return;
            }

            const normalizedUrl = normalizeUrlForTracking(details.url);

            // Check if this request URL matches any of our rules
            const matchesRule = await checkIfUrlMatchesAnyRule(normalizedUrl);

            // Track this request with whether headers were applied
            pendingRequests.set(details.requestId, {
                tabId: details.tabId,
                url: normalizedUrl,
                headersApplied: matchesRule,
                method: details.method // Track method for debugging
            });

            // Clean up old pending requests periodically
            if (pendingRequests.size > 1000) {
                const oldRequests = Array.from(pendingRequests.keys()).slice(0, 500);
                oldRequests.forEach(id => pendingRequests.delete(id));
            }

            // Skip if this is not a main frame or sub frame request
            // This helps avoid tracking every single subresource
            if (!['main_frame', 'sub_frame', 'xmlhttprequest', 'other'].includes(details.type)) {
                return;
            }

            if (matchesRule) {
                // Track this tab as having active rules
                if (!tabsWithActiveRules.has(details.tabId)) {
                    tabsWithActiveRules.set(details.tabId, new Set());
                }

                const trackedUrls = tabsWithActiveRules.get(details.tabId);

                // Limit the number of tracked URLs per tab to prevent memory leaks
                if (trackedUrls.size >= MAX_TRACKED_URLS_PER_TAB) {
                    // Remove oldest entries (convert to array, remove first items, convert back)
                    const urlArray = Array.from(trackedUrls);
                    const newUrls = new Set(urlArray.slice(-MAX_TRACKED_URLS_PER_TAB + 1));
                    tabsWithActiveRules.set(details.tabId, newUrls);
                    trackedUrls.clear();
                    newUrls.forEach(url => trackedUrls.add(url));
                }

                trackedUrls.add(normalizedUrl);

                console.log(`Info: Tab ${details.tabId} made ${details.method} ${details.type} request to ${normalizedUrl} which has active rules`);

                // Update badge if this is the active tab
                tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeForCurrentTab();
                    }
                });
            }
        },
        { urls: ["<all_urls>"] }
    );

    // Handle completed requests (successful)
    if (webRequestAPI.onCompleted) {
        webRequestAPI.onCompleted.addListener((details) => {
            // Remove from pending - request succeeded
            pendingRequests.delete(details.requestId);
        }, { urls: ["<all_urls>"] });
    }

    // Handle errors - but DON'T remove tracking for requests where headers were applied
    if (webRequestAPI.onErrorOccurred) {
        webRequestAPI.onErrorOccurred.addListener((details) => {
            const pending = pendingRequests.get(details.requestId);

            if (pending) {
                // Determine the type of error
                const error = details.error || '';

                // List of errors that indicate the request was never sent
                // These are network-level failures where headers wouldn't have been applied
                const networkFailureErrors = [
                    'net::ERR_CONNECTION_REFUSED',
                    'net::ERR_CONNECTION_RESET',
                    'net::ERR_CONNECTION_CLOSED',
                    'net::ERR_NAME_NOT_RESOLVED',
                    'net::ERR_INTERNET_DISCONNECTED',
                    'net::ERR_ADDRESS_UNREACHABLE',
                    'net::ERR_NETWORK_CHANGED',
                    'net::ERR_DNS_TIMED_OUT',
                    'net::ERR_TIMED_OUT',
                    'net::ERR_CONNECTION_TIMED_OUT',
                    'net::ERR_SOCKET_NOT_CONNECTED',
                    'net::ERR_NETWORK_ACCESS_DENIED',
                    'net::ERR_CERT_AUTHORITY_INVALID',
                    'net::ERR_CERT_COMMON_NAME_INVALID',
                    'net::ERR_CERT_DATE_INVALID',
                    'net::ERR_SSL_PROTOCOL_ERROR',
                    'net::ERR_BAD_SSL_CLIENT_AUTH_CERT',
                    'net::ERR_CERT_REVOKED',
                    'net::ERR_CERT_INVALID',
                    'net::ERR_CERT_WEAK_SIGNATURE_ALGORITHM',
                    'net::ERR_CERT_NON_UNIQUE_NAME',
                    'net::ERR_CERT_WEAK_KEY',
                    'net::ERR_CERT_NAME_CONSTRAINT_VIOLATION',
                    'net::ERR_CERT_VALIDITY_TOO_LONG',
                    'net::ERR_CERTIFICATE_TRANSPARENCY_REQUIRED',
                    'net::ERR_CERT_SYMANTEC_LEGACY',
                    'net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH',
                    'net::ERR_SSL_RENEGOTIATION_REQUESTED',
                    'net::ERR_CT_CONSISTENCY_PROOF_PARSING_FAILED',
                    'net::ERR_SSL_OBSOLETE_VERSION'
                ];

                // CORS errors and similar happen AFTER the request is sent
                // So headers were already applied successfully
                const clientSideErrors = [
                    'net::ERR_FAILED', // Often CORS
                    'net::ERR_ABORTED',
                    'net::ERR_BLOCKED_BY_CLIENT',
                    'net::ERR_BLOCKED_BY_RESPONSE',
                    'net::ERR_EMPTY_RESPONSE',
                    'net::ERR_INSECURE_RESPONSE', // Mixed content
                    'net::ERR_BLOCKED_BY_ADMINISTRATOR',
                    'net::ERR_BLOCKED_BY_XSS_AUDITOR',
                    'net::ERR_CONTENT_DECODING_FAILED',
                    'net::ERR_CONTENT_LENGTH_MISMATCH',
                    'net::ERR_INCOMPLETE_CHUNKED_ENCODING',
                    'net::ERR_INVALID_RESPONSE',
                    'net::ERR_RESPONSE_HEADERS_TOO_BIG',
                    'net::ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_LENGTH',
                    'net::ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION',
                    'net::ERR_HTTP2_PROTOCOL_ERROR',
                    'net::ERR_HTTP2_SERVER_REFUSED_STREAM',
                    'net::ERR_QUIC_PROTOCOL_ERROR',
                    'net::ERR_INVALID_CHUNKED_ENCODING',
                    'net::ERR_REQUEST_RANGE_NOT_SATISFIABLE',
                    'net::ERR_ENCODING_CONVERSION_FAILED',
                    'net::ERR_UNRECOGNIZED_FTP_DIRECTORY_LISTING_FORMAT',
                    'net::ERR_NO_SUPPORTED_PROXIES',
                    'net::ERR_HTTP2_INADEQUATE_TRANSPORT_SECURITY',
                    'net::ERR_HTTP2_FLOW_CONTROL_ERROR',
                    'net::ERR_HTTP2_FRAME_SIZE_ERROR',
                    'net::ERR_HTTP2_COMPRESSION_ERROR',
                    'net::ERR_HTTP2_CONNECT_ERROR',
                    'net::ERR_HTTP2_GOAWAY_FRAME',
                    'net::ERR_HTTP2_RST_STREAM_NO_ERROR_RECEIVED',
                    'net::ERR_HTTP2_PUSHED_STREAM_NOT_AVAILABLE',
                    'net::ERR_HTTP2_CLAIMED_PUSHED_STREAM_RESET_BY_SERVER',
                    'net::ERR_HTTP2_PUSHED_RESPONSE_DOES_NOT_MATCH',
                    'net::ERR_HTTP2_FALLBACK_BEYOND_PROTOCOL_ERROR',
                    'net::ERR_QUIC_GOAWAY_REQUEST_CAN_BE_RETRIED',
                    'net::ERR_TOO_MANY_REDIRECTS',
                    'net::ERR_UNSAFE_REDIRECT',
                    'net::ERR_UNSAFE_PORT',
                    'net::ERR_INVALID_HTTP_RESPONSE',
                    'net::ERR_METHOD_NOT_SUPPORTED',
                    'net::ERR_PAC_STATUS_NOT_OK',
                    'net::ERR_PAC_SCRIPT_FAILED'
                ];

                // Only remove tracking if:
                // 1. Headers were applied to this request AND
                // 2. It's a network failure (not a client-side error like CORS)
                if (pending.headersApplied && networkFailureErrors.includes(error)) {
                    console.log(`Info: Removing tracking for failed request (${error}): ${pending.url}`);

                    if (tabsWithActiveRules.has(pending.tabId)) {
                        const trackedUrls = tabsWithActiveRules.get(pending.tabId);
                        if (trackedUrls.has(pending.url)) {
                            trackedUrls.delete(pending.url);

                            // If no more tracked URLs, remove the tab
                            if (trackedUrls.size === 0) {
                                tabsWithActiveRules.delete(pending.tabId);
                            }

                            // Update badge if this is the active tab
                            tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                                if (tabsList[0] && tabsList[0].id === pending.tabId) {
                                    updateBadgeForCurrentTab();
                                }
                            });
                        }
                    }
                } else if (pending.headersApplied && clientSideErrors.includes(error)) {
                    // For client-side errors like CORS, keep the tracking
                    console.log(`Info: Keeping tracking for request with client-side error (${error}): ${pending.url} - headers were successfully applied`);
                } else if (pending.headersApplied && error && !networkFailureErrors.includes(error) && !clientSideErrors.includes(error)) {
                    // Unknown error - log it but keep tracking to be safe
                    console.log(`Info: Unknown error type (${error}) for request: ${pending.url} - keeping tracking since headers may have been applied`);
                }
            }

            pendingRequests.delete(details.requestId);
        }, { urls: ["<all_urls>"] });
    }

    // Also monitor response headers to detect CORS issues that don't trigger onErrorOccurred
    if (webRequestAPI.onResponseStarted) {
        webRequestAPI.onResponseStarted.addListener((details) => {
            const pending = pendingRequests.get(details.requestId);

            if (pending && pending.headersApplied) {
                // The request completed with headers applied, ensure it's tracked
                // This handles cases where CORS might block the response in the browser
                // but the request was successfully sent with our headers
                if (!tabsWithActiveRules.has(details.tabId)) {
                    tabsWithActiveRules.set(details.tabId, new Set());
                }

                const trackedUrls = tabsWithActiveRules.get(details.tabId);
                if (!trackedUrls.has(pending.url)) {
                    trackedUrls.add(pending.url);
                    console.log(`Info: Ensuring tracking for request that received response: ${pending.url}`);
                }
            }
        }, { urls: ["<all_urls>"] });
    }

    // Monitor redirects to update tracking
    if (webRequestAPI.onBeforeRedirect) {
        webRequestAPI.onBeforeRedirect.addListener(
            async (details) => {
                if (details.tabId === -1) return;

                // Skip non-trackable URLs
                if (!isTrackableUrl(details.redirectUrl)) {
                    return;
                }

                const normalizedRedirectUrl = normalizeUrlForTracking(details.redirectUrl);

                // Check if the redirect URL matches any rules
                const matchesRule = await checkIfUrlMatchesAnyRule(normalizedRedirectUrl);

                if (matchesRule) {
                    if (!tabsWithActiveRules.has(details.tabId)) {
                        tabsWithActiveRules.set(details.tabId, new Set());
                    }
                    tabsWithActiveRules.get(details.tabId).add(normalizedRedirectUrl);
                    console.log(`Info: Tab ${details.tabId} redirected to ${normalizedRedirectUrl} which has active rules`);

                    // Update badge if active tab
                    tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                        if (tabsList[0] && tabsList[0].id === details.tabId) {
                            updateBadgeForCurrentTab();
                        }
                    });
                }

                // Update pending request with new URL and header status
                if (pendingRequests.has(details.requestId)) {
                    pendingRequests.get(details.requestId).url = normalizedRedirectUrl;
                    pendingRequests.get(details.requestId).headersApplied = matchesRule;
                }
            },
            { urls: ["<all_urls>"] }
        );
    }

    // Clear tracking when tab navigates (main frame only)
    if (webRequestAPI.onBeforeNavigate) {
        webRequestAPI.onBeforeNavigate.addListener((details) => {
            if (details.frameId === 0) { // Main frame
                tabsWithActiveRules.delete(details.tabId);

                // Also clean up any pending requests for this tab
                for (const [requestId, pending] of pendingRequests) {
                    if (pending.tabId === details.tabId) {
                        pendingRequests.delete(requestId);
                    }
                }

                console.log(`Info: Cleared tracking for tab ${details.tabId} due to navigation`);

                // Update badge if this is the active tab
                tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeForCurrentTab();
                    }
                });
            }
        }, { urls: ["<all_urls>"] });
    }
}

/**
 * Check if a URL matches any active rule
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Whether the URL matches any active rule
 */
async function checkIfUrlMatchesAnyRule(url) {
    const normalizedUrl = normalizeUrlForTracking(url);

    return new Promise((resolve) => {
        storage.sync.get(['savedData'], (result) => {
            const savedData = result.savedData || {};

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
 * Check if any rules apply to the current tab
 * @param {string} tabUrl - The URL of the current tab
 * @returns {Promise<boolean>} - Whether any active rules apply
 */
async function checkRulesForTab(tabUrl) {
    if (!tabUrl || !isTrackableUrl(tabUrl)) {
        return false;
    }

    // First check for direct URL match (when you're ON a domain with rules)
    const directMatch = await new Promise((resolve) => {
        storage.sync.get(['savedData'], (result) => {
            const savedData = result.savedData || {};

            // Debug logging
            const enabledRules = Object.entries(savedData).filter(([_, entry]) => entry.isEnabled !== false);
            console.log(`Info: Checking ${enabledRules.length} enabled rules for URL: ${tabUrl}`);

            // Check if any enabled rules match the current tab URL
            for (const id in savedData) {
                const entry = savedData[id];

                // Skip disabled rules
                if (entry.isEnabled === false) {
                    continue;
                }

                // Check if any domain pattern matches the current tab
                const domains = entry.domains || [];
                for (const domain of domains) {
                    if (doesUrlMatchPattern(tabUrl, domain)) {
                        console.log(`Info: Direct rule match! Header: ${entry.headerName}, Type: ${entry.isResponse ? 'Response' : 'Request'}, Domain: ${domain}`);
                        resolve(true);
                        return;
                    }
                }
            }

            resolve(false);
        });
    });

    if (directMatch) return true;

    // Now check if the current tab has made any requests to domains with rules
    const currentTab = await new Promise((resolve) => {
        tabs.query({ active: true, currentWindow: true }, (tabs) => {
            resolve(tabs[0]);
        });
    });

    if (currentTab && currentTab.id && tabsWithActiveRules.has(currentTab.id)) {
        const matchedDomains = tabsWithActiveRules.get(currentTab.id);
        if (matchedDomains && matchedDomains.size > 0) {
            console.log(`Info: Current tab has made requests to ${matchedDomains.size} domains with rules`);
            return true;
        }
    }

    console.log('Info: No rules matched for current tab');
    return false;
}

/**
 * Enhanced URL pattern matching with better edge case handling
 * @param {string} url - The URL to check
 * @param {string} pattern - The domain pattern (can include wildcards)
 * @returns {boolean} - Whether the URL matches the pattern
 */
function doesUrlMatchPattern(url, pattern) {
    try {
        // Normalize both URL and pattern for comparison
        const normalizedUrl = normalizeUrlForTracking(url);
        let urlFilter = pattern.trim().toLowerCase();

        // Convert pattern to a regex
        if (urlFilter === '*') {
            return true; // Matches everything
        }

        // Handle IDN in patterns
        try {
            // If pattern contains non-ASCII, try to parse it as URL
            if (/[^\x00-\x7F]/.test(urlFilter)) {
                const patternUrl = new URL(urlFilter.includes('://') ? urlFilter : 'http://' + urlFilter);
                urlFilter = patternUrl.hostname.toLowerCase();
            }
        } catch (e) {
            // Pattern is not a valid URL, continue with original
        }

        // If pattern doesn't have protocol, add wildcard
        if (!urlFilter.includes('://')) {
            // Handle localhost and IP addresses specially
            if (urlFilter.startsWith('localhost') ||
                urlFilter.match(/^(\d{1,3}\.){3}\d{1,3}/) ||
                urlFilter.includes('[') && urlFilter.includes(']')) { // IPv6
                urlFilter = '*://' + urlFilter;
            } else {
                urlFilter = '*://' + urlFilter;
            }
        }

        // Ensure pattern has a path
        if (!urlFilter.includes('/', urlFilter.indexOf('://') + 3)) {
            urlFilter = urlFilter + '/*';
        }

        // Handle port numbers in pattern - normalize default ports
        urlFilter = urlFilter.replace(/:80\//, '/').replace(/:443\//, '/');

        // Convert to regex pattern
        let regexPattern = urlFilter
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
            .replace(/\*/g, '.*'); // Replace * with .*

        // Create regex (case insensitive)
        const regex = new RegExp('^' + regexPattern + '$', 'i');

        // Test the normalized URL
        const matches = regex.test(normalizedUrl);

        // Debug log for troubleshooting
        if (matches) {
            console.log(`Info: URL "${normalizedUrl}" matches pattern "${pattern}"`);
        }

        return matches;
    } catch (e) {
        console.log('Error matching URL pattern:', e);
        return false;
    }
}

/**
 * Updates the extension badge based on connection status, active rules, and placeholder usage
 * @param {boolean} connected - Whether the WebSocket is connected
 * @param {string} currentTabUrl - The URL of the current active tab
 * @param {boolean} hasPlaceholders - Whether any headers are using placeholders
 */
async function updateExtensionBadge(connected, currentTabUrl, hasPlaceholders) {
    // Get the appropriate API (chrome.action for MV3, chrome.browserAction for MV2/Firefox)
    const actionAPI = typeof browser !== 'undefined' && browser.browserAction
        ? browser.browserAction
        : (chrome?.action || chrome?.browserAction);

    if (!actionAPI) {
        console.log('Badge API not available');
        return;
    }

    // Determine badge state
    let badgeState = 'none';

    // Priority: placeholders > disconnected > active > none
    if (hasPlaceholders) {
        badgeState = 'placeholders';
    } else if (!connected) {
        badgeState = 'disconnected';
    } else if (currentTabUrl) {
        // Check if any rules apply to current tab (including requests it makes)
        const hasActiveRules = await checkRulesForTab(currentTabUrl);
        if (hasActiveRules) {
            badgeState = 'active';
        }
    }

    // Only update if state changed
    if (badgeState === lastBadgeState) {
        return;
    }

    lastBadgeState = badgeState;

    if (badgeState === 'placeholders') {
        // Show a red exclamation when headers are using placeholders
        actionAPI.setBadgeText({ text: '!' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge text error:', chrome.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#ff4d4f' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge color error:', chrome.runtime.lastError);
            }
        });

        // Update the tooltip with specific information
        if (actionAPI.setTitle) {
            const placeholderReasons = headersUsingPlaceholders.map(h => h.reason);
            const hasDisconnected = placeholderReasons.includes('app_disconnected');
            const hasNotFound = placeholderReasons.includes('source_not_found');
            const hasEmpty = placeholderReasons.includes('empty_source');

            let messages = [];
            if (hasDisconnected) messages.push('App disconnected');
            if (hasNotFound) messages.push('Sources missing');
            if (hasEmpty) messages.push('Sources empty');

            actionAPI.setTitle({
                title: `Open Headers - Warning\n${headersUsingPlaceholders.length} headers using placeholder values\n${messages.join(', ')}`
            });
        }
    } else if (badgeState === 'disconnected') {
        // Show a yellow dot/exclamation when disconnected
        actionAPI.setBadgeText({ text: '!' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge text error:', chrome.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#ffcd04' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge color error:', chrome.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Disconnected\nDynamic header rules may not work'
            });
        }
    } else if (badgeState === 'active') {
        // Show a green checkmark when rules are active for current site
        actionAPI.setBadgeText({ text: '✓' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge text error:', chrome.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#52c41a' }, () => {
            if (chrome.runtime.lastError) {
                console.log('Badge color error:', chrome.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Active\nHeader rules are active for this site'
            });
        }
    } else {
        // Clear the badge when connected but no active rules
        actionAPI.setBadgeText({ text: '' });

        // Reset the tooltip to default
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers'
            });
        }
    }
}

/**
 * Update badge for the current active tab
 */
async function updateBadgeForCurrentTab() {
    const isConnected = isWebSocketConnected();
    const hasPlaceholders = headersUsingPlaceholders.length > 0;

    // Get current active tab
    tabs.query({ active: true, currentWindow: true }, async (tabList) => {
        const currentTab = tabList[0];
        const currentUrl = currentTab?.url || '';

        await updateExtensionBadge(isConnected, currentUrl, hasPlaceholders);
    });
}

/**
 * Initialize the extension.
 */
async function initializeExtension() {
    // Set initial badge state to disconnected
    await updateExtensionBadge(false, null, false);

    // Set up request monitoring
    setupRequestMonitoring();

    // Restore tracking state after a short delay (to ensure tabs are loaded)
    setTimeout(() => {
        restoreTrackingState();
    }, 1000);

    // First try to restore any previous dynamic sources
    storage.local.get(['dynamicSources'], (result) => {
        if (result.dynamicSources && Array.isArray(result.dynamicSources) && result.dynamicSources.length > 0) {
            console.log('Info: Restored dynamic sources from storage:', result.dynamicSources.length);

            // Store the hash of the restored sources
            lastSourcesHash = generateSourcesHash(result.dynamicSources);
            lastRulesUpdateTime = Date.now();

            // Apply the sources immediately to network rules, even before WebSocket connects
            updateNetworkRules(result.dynamicSources);
        }
    });

    // Get the initial savedData hash to prevent unnecessary updates
    storage.sync.get(['savedData'], (result) => {
        if (result.savedData) {
            lastSavedDataHash = generateSavedDataHash(result.savedData);
            console.log('Info: Initialized saved data hash');
        }
    });

    // Connect to WebSocket and update rules when we receive new data
    await connectWebSocket((sources) => {
        console.log('Info: WebSocket provided fresh sources, updating rules immediately');

        // Always update rules when we get sources from a fresh connection
        updateNetworkRules(sources);

        // Update tracking variables
        lastSourcesHash = generateSourcesHash(sources);
        lastRulesUpdateTime = Date.now();
    });

    // Initial update of network rules (with empty sources until we get data)
    setTimeout(() => {
        const sources = getCurrentSources();
        if (sources.length === 0) {
            updateNetworkRules([]);
        }
    }, 1000);
}

/**
 * Opens the welcome page directly, bypassing setup checks.
 * This is only called from the "Open Setup Guide" button.
 */
function openWelcomePageDirectly() {
    console.log('Info: Directly opening welcome page (bypassing setup checks)');

    // Track that we're opening a page to prevent duplicates
    welcomePageBeingOpened = true;

    try {
        // Use appropriate API based on browser
        const api = typeof browser !== 'undefined' ? browser : chrome;

        if (api.tabs && api.tabs.create) {
            const welcomePageUrl = api.runtime.getURL('welcome.html');
            console.log('Info: Welcome page URL:', welcomePageUrl);

            // Create a new welcome page without any checks
            const createPromise = typeof api.tabs.create.then === 'function'
                ? api.tabs.create({ url: welcomePageUrl, active: true })
                : new Promise((resolve) => api.tabs.create({ url: welcomePageUrl, active: true }, resolve));

            createPromise.then(tab => {
                console.log('Info: Force-opened welcome tab:', tab.id);
                welcomePageBeingOpened = false;
            }).catch(err => {
                console.log('Info: Failed to force-open welcome page:', err ? err.message : 'unknown error');
                welcomePageBeingOpened = false;
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            welcomePageBeingOpened = false;
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', e.message);
        welcomePageBeingOpened = false;
    }
}

// Create a debounce function to avoid too many rapid updates
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Create a debounced version of updateNetworkRules for sources
const debouncedUpdateRules = debounce((sources) => {
    console.log('Info: Debounced rule update executing with', sources.length, 'sources');
    updateNetworkRules(sources);

    // Update our tracking variables
    lastSourcesHash = generateSourcesHash(sources);
    lastRulesUpdateTime = Date.now();
}, 100); // Only wait 100ms to avoid noticeable delay but still prevent multiple calls

// Create a debounced version of updateNetworkRules for saved data
const debouncedUpdateRulesFromSavedData = debounce((savedData) => {
    console.log('Info: Debounced rule update from saved data changes');
    updateNetworkRules(getCurrentSources());
    lastSavedDataHash = generateSavedDataHash(savedData);

    // Force immediate badge update
    updateBadgeForCurrentTab();
}, 100);

// Create a debounced version of badge update
const debouncedUpdateBadge = debounce(() => {
    updateBadgeForCurrentTab();
}, 100);

// Set up alarms to keep the service worker alive
alarms.create('keepAlive', { periodInMinutes: 0.5 }); // Every 30 seconds

// Create a more frequent alarm for badge updates
alarms.create('updateBadge', {
    delayInMinutes: 0.01,  // Start after 0.6 seconds
    periodInMinutes: 0.033 // Repeat every ~2 seconds
});

alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        // This will keep the service worker alive
        console.log('Info: Keep alive ping');

        // Check if sources have changed since last update
        const currentSources = getCurrentSources();
        const currentHash = generateSourcesHash(currentSources);

        // Skip update if no changes
        if (currentHash === lastSourcesHash) {
            console.log('Info: Skipping rule update - no changes detected');
            return;
        }

        // Update rules only if sources have changed
        console.log('Info: Updating rules due to source changes');
        updateNetworkRules(currentSources);
        lastSourcesHash = currentHash;
        lastRulesUpdateTime = Date.now();
    } else if (alarm.name === 'updateBadge') {
        // Update badge for current tab
        updateBadgeForCurrentTab();
    }
});

// Listen for tab updates and activations
tabs.onActivated?.addListener((activeInfo) => {
    // Update badge when user switches tabs
    setTimeout(() => {
        debouncedUpdateBadge();
    }, 100);
});

tabs.onUpdated?.addListener((tabId, changeInfo, tab) => {
    // Handle various state changes that might indicate navigation
    if (changeInfo.url || changeInfo.status === 'loading') {
        // For URL changes without full page load (History API)
        if (changeInfo.url && !changeInfo.status) {
            console.log(`Info: Detected potential SPA navigation in tab ${tabId}`);

            // Check if this is a significant navigation (different origin or path)
            if (tabsWithActiveRules.has(tabId)) {
                const trackedUrls = tabsWithActiveRules.get(tabId);
                const normalizedNewUrl = normalizeUrlForTracking(changeInfo.url);

                // Parse URLs to check if it's a significant navigation
                try {
                    const newUrl = new URL(normalizedNewUrl);
                    let significantChange = true;

                    // Check if any tracked URL is from the same origin and path
                    for (const trackedUrl of trackedUrls) {
                        try {
                            const oldUrl = new URL(trackedUrl);
                            // If same origin and same pathname, it's not a significant change
                            if (oldUrl.origin === newUrl.origin && oldUrl.pathname === newUrl.pathname) {
                                significantChange = false;
                                break;
                            }
                        } catch (e) {
                            // Invalid URL in tracking
                        }
                    }

                    if (significantChange) {
                        console.log(`Info: Significant SPA navigation detected, clearing tracked requests for tab ${tabId}`);
                        tabsWithActiveRules.delete(tabId);
                    }
                } catch (e) {
                    // If URL parsing fails, clear to be safe
                    tabsWithActiveRules.delete(tabId);
                }
            }
        }

        // Clear tracking when URL changes (main navigation)
        if (changeInfo.url && tabsWithActiveRules.has(tabId)) {
            const trackedUrls = tabsWithActiveRules.get(tabId);
            if (trackedUrls && trackedUrls.size > 0) {
                // Check if new URL is different origin than tracked URLs
                try {
                    const newOrigin = new URL(changeInfo.url).origin;
                    let differentOrigin = true;

                    for (const trackedUrl of trackedUrls) {
                        try {
                            const trackedOrigin = new URL(trackedUrl).origin;
                            if (newOrigin === trackedOrigin) {
                                differentOrigin = false;
                                break;
                            }
                        } catch (e) {
                            // Invalid URL in tracking, ignore
                        }
                    }

                    if (differentOrigin) {
                        console.log(`Info: Tab ${tabId} navigated to different origin, clearing tracked requests`);
                        tabsWithActiveRules.delete(tabId);
                    }
                } catch (e) {
                    // Invalid URL, clear tracking to be safe
                    tabsWithActiveRules.delete(tabId);
                }
            }
        }
    }

    // Update badge when tab URL changes or completes loading
    if ((changeInfo.url || changeInfo.status === 'complete') && tab.active) {
        setTimeout(() => {
            debouncedUpdateBadge();
        }, 100);
    }
});

// Clean up tracking when tabs are closed
tabs.onRemoved?.addListener((tabId) => {
    tabsWithActiveRules.delete(tabId);
    console.log(`Info: Cleaned up tracking for closed tab ${tabId}`);
});

// Clear tracking when tab is replaced (e.g., when navigating to a completely new site)
tabs.onReplaced?.addListener((addedTabId, removedTabId) => {
    console.log(`Info: Tab ${removedTabId} replaced by ${addedTabId}, transferring tracking`);

    // Transfer tracking from old tab to new tab if any exists
    if (tabsWithActiveRules.has(removedTabId)) {
        const trackedUrls = tabsWithActiveRules.get(removedTabId);
        tabsWithActiveRules.set(addedTabId, trackedUrls);
        tabsWithActiveRules.delete(removedTabId);

        // Update badge if this is the active tab
        tabs.query({ active: true, currentWindow: true }, (tabsList) => {
            if (tabsList[0] && tabsList[0].id === addedTabId) {
                updateBadgeForCurrentTab();
            }
        });
    }
});

// Add handler for when browser starts with existing tabs
tabs.onCreated?.addListener((tab) => {
    // When a new tab is created, check if it should be tracked
    if (tab.url && tab.id && isTrackableUrl(tab.url)) {
        checkIfUrlMatchesAnyRule(tab.url).then(matches => {
            if (matches) {
                if (!tabsWithActiveRules.has(tab.id)) {
                    tabsWithActiveRules.set(tab.id, new Set());
                }
                tabsWithActiveRules.get(tab.id).add(normalizeUrlForTracking(tab.url));
                console.log(`Info: New tab ${tab.id} created with URL that matches rules`);

                if (tab.active) {
                    updateBadgeForCurrentTab();
                }
            }
        });
    }
});

// Handle window focus changes
chrome.windows?.onFocusChanged?.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;

    // When window focus changes, update badge for the active tab in that window
    tabs.query({ active: true, windowId: windowId }, (tabsList) => {
        if (tabsList[0]) {
            console.log(`Info: Window focus changed, updating badge for tab ${tabsList[0].id}`);
            updateBadgeForCurrentTab();
        }
    });
});

// Handle extension suspend/resume
runtime.onSuspend?.addListener(() => {
    console.log('Info: Extension suspending, clearing tracked requests');
    tabsWithActiveRules.clear();
});

// Add listener for when popup closes to ensure badge is updated
runtime.onConnect?.addListener((port) => {
    if (port.name === 'popup') {
        // Check if this is from an incognito context
        if (port.sender?.tab?.incognito || port.sender?.incognito) {
            console.log('Info: Popup opened in incognito mode');
            // You might want to handle incognito differently
        }

        port.onDisconnect.addListener(() => {
            // Check for errors when popup disconnects
            const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
            if (browserAPI.runtime.lastError) {
                console.log('Info: Popup disconnect error:', browserAPI.runtime.lastError.message);
            } else {
                console.log('Info: Popup closed, updating badge');
            }

            setTimeout(() => {
                updateBadgeForCurrentTab();
            }, 100);
        });
    }
});

// Handle back/forward navigation by monitoring webNavigation API if available
if (chrome.webNavigation) {
    chrome.webNavigation.onHistoryStateUpdated?.addListener((details) => {
        if (details.frameId === 0) { // Main frame only
            console.log(`Info: History state updated in tab ${details.tabId}`);

            // Skip non-trackable URLs
            if (!isTrackableUrl(details.url)) {
                return;
            }

            // Re-evaluate if this URL should be tracked
            checkIfUrlMatchesAnyRule(normalizeUrlForTracking(details.url)).then(matches => {
                if (matches) {
                    // URL matches rules, ensure it's tracked
                    if (!tabsWithActiveRules.has(details.tabId)) {
                        tabsWithActiveRules.set(details.tabId, new Set());
                    }
                    tabsWithActiveRules.get(details.tabId).add(normalizeUrlForTracking(details.url));
                }

                // Update badge
                tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeForCurrentTab();
                    }
                });
            });
        }
    });

    // Handle pre-rendered pages (Chrome)
    chrome.webNavigation.onTabReplaced?.addListener((details) => {
        console.log(`Info: Tab ${details.replacedTabId} replaced with ${details.tabId} (likely pre-render)`);

        // Transfer any tracking from the old tab to the new one
        if (tabsWithActiveRules.has(details.replacedTabId)) {
            const trackedUrls = tabsWithActiveRules.get(details.replacedTabId);
            tabsWithActiveRules.set(details.tabId, trackedUrls);
            tabsWithActiveRules.delete(details.replacedTabId);

            console.log(`Info: Transferred ${trackedUrls.size} tracked URLs to new tab`);

            // Update badge if needed
            tabs.query({ active: true, currentWindow: true }, (tabsList) => {
                if (tabsList[0] && tabsList[0].id === details.tabId) {
                    updateBadgeForCurrentTab();
                }
            });
        }
    });
}

// Periodic cleanup of stale tab tracking (tabs that might have been closed without proper cleanup)
setInterval(() => {
    if (tabsWithActiveRules.size > 0) {
        tabs.query({}, (allTabs) => {
            const activeTabIds = new Set(allTabs.map(tab => tab.id));
            let cleaned = 0;

            for (const [tabId] of tabsWithActiveRules) {
                if (!activeTabIds.has(tabId)) {
                    tabsWithActiveRules.delete(tabId);
                    cleaned++;
                }
            }

            if (cleaned > 0) {
                console.log(`Info: Cleaned up ${cleaned} stale tab tracking entries`);
            }
        });
    }
}, 30000); // Every 30 seconds

/**
 * Opens the welcome page ONLY on first install
 */
function openWelcomePageOnInstall() {
    // Don't open if we're already opening a page
    if (welcomePageBeingOpened) {
        console.log('Info: Welcome page already being opened, skipping');
        return;
    }

    // Set flag immediately to prevent race conditions
    welcomePageBeingOpened = true;
    console.log('Info: Opening welcome page for first install');

    try {
        // Use appropriate API based on browser
        const api = typeof browser !== 'undefined' ? browser : chrome;

        if (api.tabs && api.tabs.query) {
            const welcomePageUrl = api.runtime.getURL('welcome.html');

            // First check if a welcome page is already open
            const queryPromise = typeof api.tabs.query.then === 'function'
                ? api.tabs.query({})  // Firefox uses promises
                : new Promise((resolve) => api.tabs.query({}, resolve)); // Chrome uses callbacks

            queryPromise.then(tabs => {
                const welcomeTabs = tabs.filter(tab =>
                    tab.url === welcomePageUrl ||
                    tab.url.startsWith(welcomePageUrl)
                );

                if (welcomeTabs.length > 0) {
                    // Welcome page is already open, just focus it
                    console.log('Info: Welcome page already exists, focusing it');

                    const updatePromise = typeof api.tabs.update.then === 'function'
                        ? api.tabs.update(welcomeTabs[0].id, {active: true})
                        : new Promise((resolve) => api.tabs.update(welcomeTabs[0].id, {active: true}, resolve));

                    updatePromise.then(() => {
                        welcomePageBeingOpened = false;
                    }).catch(err => {
                        console.log('Info: Error focusing existing welcome tab:', err ? err.message : 'unknown error');
                        welcomePageBeingOpened = false;
                    });
                } else {
                    // Create a new welcome page
                    const createPromise = typeof api.tabs.create.then === 'function'
                        ? api.tabs.create({ url: welcomePageUrl, active: true })
                        : new Promise((resolve) => api.tabs.create({ url: welcomePageUrl, active: true }, resolve));

                    createPromise.then(tab => {
                        console.log('Info: Opened welcome tab:', tab.id);
                        welcomePageBeingOpened = false;
                    }).catch(err => {
                        console.log('Info: Failed to open welcome page:', err ? err.message : 'unknown error');
                        welcomePageBeingOpened = false;
                    });
                }
            }).catch(err => {
                console.log('Info: Error checking for existing welcome tabs:', err ? err.message : 'unknown error');
                welcomePageBeingOpened = false;
            });
        } else {
            console.log('Info: Cannot open welcome page - missing permissions');
            welcomePageBeingOpened = false;
        }
    } catch (e) {
        console.log('Info: Error opening welcome page:', e.message);
        welcomePageBeingOpened = false;
    }
}

// Register for startup to reconnect if browser restarts
runtime.onStartup.addListener(() => {
    console.log('Info: Browser started up, connecting WebSocket...');
    initializeExtension();
});

// Keep track of when we're active by listening for install/update events
runtime.onInstalled.addListener((details) => {
    console.log('Info: Extension installed or updated:', details.reason);
    console.log('Info: Browser detected:', isFirefox ? 'Firefox' : 'Other');

    // Show welcome page on fresh install OR if it's Firefox and we haven't shown it yet
    if (details.reason === 'install') {
        console.log('Info: Fresh install detected, opening welcome page');
        setTimeout(() => {
            openWelcomePageOnInstall();
        }, 500);
    } else if (isFirefox && details.reason === 'update') {
        // In Firefox dev mode, sometimes it reports as 'update' instead of 'install'
        storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result) => {
            if (!result.setupCompleted) {
                console.log('Info: Firefox update detected but setup not completed, opening welcome page');
                storage.local.set({ hasSeenWelcome: true }, () => {
                    setTimeout(() => {
                        openWelcomePageOnInstall();
                    }, 500);
                });
            }
        });
    }

    // Always initialize the extension regardless of install/update
    initializeExtension();
});

// Start the extension when loaded
console.log('Info: Background script started, initializing...');
initializeExtension();

// For Firefox development - check if this is a first run
if (isFirefox) {
    storage.local.get(['hasSeenWelcome', 'setupCompleted'], (result) => {
        // If we haven't seen the welcome page and setup isn't completed
        if (!result.hasSeenWelcome && !result.setupCompleted) {
            console.log('Info: First run detected in Firefox, opening welcome page');

            // Mark that we've attempted to show the welcome page
            storage.local.set({ hasSeenWelcome: true }, () => {
                // Open the welcome page after a short delay
                setTimeout(() => {
                    openWelcomePageOnInstall();
                }, 1000);
            });
        }
    });
}

// Listen for changes to dynamic sources in storage
storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dynamicSources) {
        const newSources = changes.dynamicSources.newValue || [];
        const newSourcesHash = generateSourcesHash(newSources);

        // Skip if hash hasn't changed
        if (newSourcesHash === lastSourcesHash) {
            console.log('Info: Dynamic sources changed but content is identical, skipping update');
            return;
        }

        console.log('Info: Dynamic sources changed with new content, triggering rule update');

        // Use the debounced update to avoid multiple rapid updates
        debouncedUpdateRules(newSources);
    }
});

// Listen for changes to saved data with hash check and debouncing
storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.savedData) {
        const newSavedData = changes.savedData.newValue || {};
        const newSavedDataHash = generateSavedDataHash(newSavedData);

        // Skip if hash hasn't changed (prevents loop)
        if (newSavedDataHash === lastSavedDataHash) {
            console.log('Info: Saved data changed but content is identical, skipping update');
            return;
        }

        console.log('Info: Saved header data changed with new content, debouncing update');

        // Revalidate tracked requests when rules change
        revalidateTrackedRequests().then(() => {
            // Then update rules
            debouncedUpdateRulesFromSavedData(newSavedData);
        });
    }
});

// Listen for messages from popup and header-manager
runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Create a safe response function that checks if the channel is still open
    const safeResponse = (data) => {
        try {
            sendResponse(data);
        } catch (error) {
            console.log('Info: Could not send response, channel closed');
        }
    };

    // Handle each message type
    try {
        if (message.type === 'popupOpen') {
            console.log('Info: Popup opened, sending current sources');
            // Send current sources to popup immediately
            const response = {
                type: 'sourcesUpdated',
                sources: getCurrentSources(),
                connected: isWebSocketConnected()
            };
            safeResponse(response);
        } else if (message.type === 'checkConnection') {
            // Respond with current connection status
            const connected = isWebSocketConnected();
            safeResponse({ connected: connected });
        } else if (message.type === 'getDynamicSources') {
            // Get the current sources and send them back
            const currentSources = getCurrentSources();
            safeResponse({
                sources: currentSources,
                connected: isWebSocketConnected()
            });
        } else if (message.type === 'rulesUpdated') {
            // Handle rule update request (for enable/disable toggle)
            console.log('Info: Rule update requested');

            // First revalidate tracked requests
            revalidateTrackedRequests().then(() => {
                // Update network rules with the current sources
                updateNetworkRules(getCurrentSources());

                // Update tracking variables
                lastSourcesHash = generateSourcesHash(getCurrentSources());
                lastRulesUpdateTime = Date.now();

                // Force immediate badge update
                updateBadgeForCurrentTab();

                // Send response
                safeResponse({ success: true });
            }).catch(error => {
                console.log('Info: Error updating rules:', error.message);
                safeResponse({ success: false, error: error.message });
            });

            // Return true to indicate async response
            return true;
        } else if (message.type === 'headersUsingPlaceholders') {
            // Update placeholder tracking from header-manager
            headersUsingPlaceholders = message.headers || [];
            console.log('Info: Headers using placeholders:', headersUsingPlaceholders.length);

            // Update badge immediately
            updateBadgeForCurrentTab();

            safeResponse({ acknowledged: true });
        } else if (message.type === 'configurationImported') {
            // Handle configuration import
            console.log('Info: Configuration imported, updating rules');

            // Clear all request tracking when importing new config
            tabsWithActiveRules.clear();
            console.log('Info: Cleared all request tracking after configuration import');

            // If dynamic sources were provided, update them in storage
            if (message.dynamicSources && Array.isArray(message.dynamicSources)) {
                storage.local.set({ dynamicSources: message.dynamicSources }, () => {
                    console.log('Info: Imported dynamic sources saved to storage:', message.dynamicSources.length);
                });
            }

            // Update network rules with the current sources
            // First try to get dynamic sources from the message
            let dynamicSources = message.dynamicSources || [];

            // If no sources in the message, get them from getCurrentSources()
            if (dynamicSources.length === 0) {
                dynamicSources = getCurrentSources();
            }

            // Apply the rules
            updateNetworkRules(dynamicSources);

            // Update tracking variables
            lastSourcesHash = generateSourcesHash(dynamicSources);
            lastRulesUpdateTime = Date.now();

            // Update saved data hash if available
            if (message.savedData) {
                lastSavedDataHash = generateSavedDataHash(message.savedData);
            }

            // Update badge for current tab
            updateBadgeForCurrentTab();

            // Send response
            safeResponse({ success: true });
        } else if (message.type === 'importConfiguration') {
            // Handle configuration import in the background script
            console.log('Info: Handling configuration import in background');

            try {
                const { savedData, dynamicSources } = message.config;

                if (!savedData) {
                    safeResponse({ success: false, error: 'Invalid configuration: savedData missing' });
                    return true;
                }

                // Save data to storage
                storage.sync.set({ savedData }, () => {
                    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

                    if (browserAPI.runtime.lastError) {
                        console.log('Info: Error saving savedData:', browserAPI.runtime.lastError.message);
                        safeResponse({ success: false, error: 'Failed to save configuration' });
                        return;
                    }

                    // Save dynamic sources if present
                    if (dynamicSources && Array.isArray(dynamicSources)) {
                        storage.local.set({ dynamicSources }, () => {
                            if (browserAPI.runtime.lastError) {
                                console.log('Info: Error saving dynamicSources:', browserAPI.runtime.lastError.message);
                                safeResponse({ success: false, error: 'Failed to save dynamic sources' });
                                return;
                            }

                            console.log('Info: Configuration imported successfully');

                            // Clear all request tracking when importing new config
                            tabsWithActiveRules.clear();
                            console.log('Info: Cleared all request tracking after configuration import');

                            // Update network rules with the imported sources
                            updateNetworkRules(dynamicSources || getCurrentSources());

                            // Update tracking variables
                            lastSourcesHash = generateSourcesHash(dynamicSources || []);
                            lastRulesUpdateTime = Date.now();
                            lastSavedDataHash = generateSavedDataHash(savedData);

                            // Update badge for current tab
                            updateBadgeForCurrentTab();

                            // Send success response
                            safeResponse({ success: true });
                        });
                    } else {
                        // No dynamic sources, just update rules
                        console.log('Info: Configuration imported successfully (no dynamic sources)');

                        // Clear all request tracking
                        tabsWithActiveRules.clear();

                        // Update network rules
                        updateNetworkRules(getCurrentSources());

                        // Update tracking variables
                        lastRulesUpdateTime = Date.now();
                        lastSavedDataHash = generateSavedDataHash(savedData);

                        // Update badge
                        updateBadgeForCurrentTab();

                        // Send success response
                        safeResponse({ success: true });
                    }
                });

            } catch (error) {
                console.log('Info: Import error in background:', error.message);
                safeResponse({ success: false, error: error.message });
            }

            // Return true to indicate async response
            return true;
        } else if (message.type === 'sourcesUpdated') {
            // This catches messages sent from the WebSocket to ensure the background
            // script stays active and processes the updates immediately
            console.log('Info: Background received sources update notification:',
                message.sources ? message.sources.length : 0, 'sources at',
                new Date(message.timestamp).toISOString());

            // No need to update rules here as the WebSocket handler already does this
            safeResponse({ acknowledged: true });
        } else if (message.type === 'openWelcomePage') {
            // This message type is no longer used - we don't want to open welcome page randomly
            console.log('Info: Ignoring openWelcomePage request - welcome page should only open on install');
            safeResponse({ acknowledged: true });
        } else if (message.type === 'forceOpenWelcomePage') {
            // FORCE open the welcome page (from the Guide button in popup)
            console.log('Info: Force opening welcome page requested from popup');
            openWelcomePageDirectly();
            safeResponse({ acknowledged: true });
        } else if (message.type === 'openTab') {
            // Open a new tab with the specified URL
            tabs.create({ url: message.url }, (tab) => {
                if (chrome.runtime.lastError) {
                    safeResponse({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    safeResponse({ success: true, tabId: tab.id });
                }
            });
            return true; // Keep channel open for async response
        } else {
            // Unknown message type
            console.log('Info: Unknown message type:', message.type);
            safeResponse({ error: 'Unknown message type' });
        }
    } catch (error) {
        console.log('Info: Error handling message:', error.message);
        safeResponse({ error: error.message });
    }

    // Return true for any async operations
    return true;
});