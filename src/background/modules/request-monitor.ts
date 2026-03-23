/**
 * Request Monitor - Sets up webRequest monitoring for tracking requests
 */

import { tabs } from '../../utils/browser-api.js';
import { normalizeUrlForTracking, isTrackableUrl } from './url-utils';
import { checkIfUrlMatchesAnyRule, addTrackedUrl, tabsWithActiveRules } from './request-tracker';

import type { PendingRequest } from '../../types/browser';
import { getBrowserAPI } from '../../types/browser';
import { logger } from '../../utils/logger';

/**
 * Set up request monitoring to track which domains tabs are making requests to
 */
export function setupRequestMonitoring(updateBadgeCallback: () => void): void {
    // Check if webRequest API is available
    const browserAPI = getBrowserAPI();
    const webRequestAPI = browserAPI.webRequest;

    if (!webRequestAPI) {
        logger.info('RequestMonitor', 'webRequest API not available');
        return;
    }

    logger.info('RequestMonitor', 'Setting up request monitoring for badge updates');

    // Track pending requests to handle failures
    const pendingRequests = new Map<string, PendingRequest>();

    // Monitor all outgoing requests
    webRequestAPI.onBeforeRequest.addListener(
        ((details: chrome.webRequest.WebRequestDetails) => {
            // Skip non-tab requests
            if (details.tabId === -1) return;

            // Skip non-trackable URLs
            if (!isTrackableUrl(details.url)) {
                return;
            }

            const normalizedUrl = normalizeUrlForTracking(details.url);

            // Check if this request URL matches any of our rules
            checkIfUrlMatchesAnyRule(normalizedUrl).then(matchesRule => {
                // Track this request with whether headers were applied
                pendingRequests.set(details.requestId, {
                    tabId: details.tabId,
                    url: normalizedUrl,
                    headersApplied: matchesRule,
                    method: details.method
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
                    addTrackedUrl(details.tabId, normalizedUrl);

                    // Update badge if this is the active tab
                    tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                        if (tabsList[0] && tabsList[0].id === details.tabId) {
                            updateBadgeCallback();
                        }
                    });
                }
            });
        }) as Parameters<typeof webRequestAPI.onBeforeRequest.addListener>[0],
        { urls: ["<all_urls>"] }
    );

    // Handle completed requests (successful)
    if (webRequestAPI.onCompleted) {
        webRequestAPI.onCompleted.addListener((details: chrome.webRequest.OnCompletedDetails) => {
            // Remove from pending - request succeeded
            pendingRequests.delete(details.requestId);
        }, { urls: ["<all_urls>"] });
    }

    // Handle errors - but DON'T remove tracking for requests where headers were applied
    if (webRequestAPI.onErrorOccurred) {
        webRequestAPI.onErrorOccurred.addListener((details: chrome.webRequest.OnErrorOccurredDetails) => {
            const pending = pendingRequests.get(details.requestId);

            if (pending) {
                // Determine the type of error
                const error = details.error || '';

                // List of errors that indicate the request was never sent
                const networkFailureErrors: string[] = [
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

                if (pending.headersApplied && networkFailureErrors.includes(error)) {

                    if (tabsWithActiveRules.has(pending.tabId)) {
                        const trackedUrls = tabsWithActiveRules.get(pending.tabId)!;
                        if (trackedUrls.has(pending.url)) {
                            trackedUrls.delete(pending.url);

                            // If no more tracked URLs, remove the tab
                            if (trackedUrls.size === 0) {
                                tabsWithActiveRules.delete(pending.tabId);
                            }

                            // Update badge if this is the active tab
                            tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                                if (tabsList[0] && tabsList[0].id === pending.tabId) {
                                    updateBadgeCallback();
                                }
                            });
                        }
                    }
                }
            }

            pendingRequests.delete(details.requestId);
        }, { urls: ["<all_urls>"] });
    }

    // Also monitor response headers to detect CORS issues that don't trigger onErrorOccurred
    if (webRequestAPI.onResponseStarted) {
        webRequestAPI.onResponseStarted.addListener((details: chrome.webRequest.OnResponseStartedDetails) => {
            const pending = pendingRequests.get(details.requestId);

            if (pending && pending.headersApplied) {
                if (!tabsWithActiveRules.has(details.tabId)) {
                    tabsWithActiveRules.set(details.tabId, new Set());
                }

                const trackedUrls = tabsWithActiveRules.get(details.tabId)!;
                if (!trackedUrls.has(pending.url)) {
                    trackedUrls.add(pending.url);
                }
            }
        }, { urls: ["<all_urls>"] });
    }

    // Monitor redirects to update tracking
    if (webRequestAPI.onBeforeRedirect) {
        webRequestAPI.onBeforeRedirect.addListener(
            ((details: chrome.webRequest.OnBeforeRedirectDetails) => {
                if (details.tabId === -1) return;

                // Skip non-trackable URLs
                if (!isTrackableUrl(details.redirectUrl)) {
                    return;
                }

                const normalizedRedirectUrl = normalizeUrlForTracking(details.redirectUrl);

                // Check if the redirect URL matches any rules
                checkIfUrlMatchesAnyRule(normalizedRedirectUrl).then(matchesRule => {
                    if (matchesRule) {
                        addTrackedUrl(details.tabId, normalizedRedirectUrl);

                        // Update badge if active tab
                        tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                            if (tabsList[0] && tabsList[0].id === details.tabId) {
                                updateBadgeCallback();
                            }
                        });
                    }

                    // Update pending request with new URL and header status
                    const pending = pendingRequests.get(details.requestId);
                    if (pending) {
                        pending.url = normalizedRedirectUrl;
                        pending.headersApplied = matchesRule;
                    }
                });
            }) as Parameters<typeof webRequestAPI.onBeforeRedirect.addListener>[0],
            { urls: ["<all_urls>"] }
        );
    }

    // Clear tracking when tab navigates (main frame only)
    const webNavigationAPI = browserAPI.webNavigation;
    if (webNavigationAPI && webNavigationAPI.onBeforeNavigate) {
        webNavigationAPI.onBeforeNavigate.addListener((details: chrome.webNavigation.WebNavigationBaseCallbackDetails & { frameId: number }) => {
            if (details.frameId === 0) { // Main frame
                tabsWithActiveRules.delete(details.tabId);

                // Also clean up any pending requests for this tab
                for (const [requestId, pending] of pendingRequests) {
                    if (pending.tabId === details.tabId) {
                        pendingRequests.delete(requestId);
                    }
                }

                // Update badge if this is the active tab
                tabs.query({ active: true, currentWindow: true }, (tabsList: chrome.tabs.Tab[]) => {
                    if (tabsList[0] && tabsList[0].id === details.tabId) {
                        updateBadgeCallback();
                    }
                });
            }
        });
    }
}
