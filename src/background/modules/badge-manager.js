/**
 * Badge Manager - Handles extension badge updates
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let lastBadgeState = null;

/**
 * Updates the extension badge based on connection status, active rules, and placeholder usage
 * @param {boolean} connected - Whether the WebSocket is connected
 * @param {Array} activeRules - Array of active rules for current tab
 * @param {boolean} hasPlaceholders - Whether any headers are using placeholders
 * @param {boolean} isPaused - Whether rules execution is paused
 * @param {Object} recordingService - The recording service to check if recording is active
 */
export async function updateExtensionBadge(connected, activeRules, hasPlaceholders, isPaused, recordingService) {
    // Get the appropriate API (chrome.action for MV3, chrome.browserAction for MV2/Firefox)
    const actionAPI = browserAPI.action || browserAPI.browserAction;

    if (!actionAPI) {
        console.log('Badge API not available');
        return;
    }

    // Check if recording is active for ANY tab (not just the current active tab)
    if (recordingService) {
        // Get all tabs
        const allTabs = await new Promise(resolve => {
            browserAPI.tabs.query({}, resolve);
        });
        
        // Check if any tab is recording
        const anyTabRecording = allTabs.some(tab => recordingService.isRecording(tab.id));
        
        if (anyTabRecording) {
            // Skip badge update if any tab is recording
            console.log('[BadgeManager] Skipping badge update - recording is active on some tab');
            return;
        }
    }

    // Determine badge state and count
    let badgeState = 'none';
    const activeRulesCount = activeRules ? activeRules.length : 0;

    // Priority: placeholders > disconnected > paused > active > none
    if (hasPlaceholders) {
        badgeState = 'placeholders';
    } else if (!connected) {
        badgeState = 'disconnected';
    } else if (isPaused) {
        badgeState = 'paused';
    } else if (activeRulesCount > 0) {
        badgeState = 'active';
    }

    // Create a unique state key that includes the count
    const currentStateKey = `${badgeState}-${activeRulesCount}-${isPaused}`;
    
    // Only update if state or count changed
    if (currentStateKey === lastBadgeState) {
        return;
    }

    lastBadgeState = currentStateKey;

    if (badgeState === 'placeholders') {
        // Show a red exclamation when headers are using placeholders
        actionAPI.setBadgeText({ text: '!' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge text error:', browserAPI.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#ff4d4f' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge color error:', browserAPI.runtime.lastError);
            }
        });

        // Update the tooltip with specific information
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: `Open Headers - Warning\nHeaders using placeholder values`
            });
        }
    } else if (badgeState === 'disconnected') {
        // Show a yellow dot/exclamation when disconnected
        actionAPI.setBadgeText({ text: '!' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge text error:', browserAPI.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#ffcd04' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge color error:', browserAPI.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Disconnected\nDynamic header rules may not work'
            });
        }
    } else if (badgeState === 'paused') {
        // Show a gray dash when rules execution is paused
        actionAPI.setBadgeText({ text: '−' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge text error:', browserAPI.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#8c8c8c' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge color error:', browserAPI.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            actionAPI.setTitle({
                title: 'Open Headers - Paused\nRules execution is paused'
            });
        }
    } else if (badgeState === 'active') {
        // Show the number of active rules
        const badgeText = activeRulesCount > 99 ? '99+' : activeRulesCount.toString();
        actionAPI.setBadgeText({ text: badgeText }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge text error:', browserAPI.runtime.lastError);
            }
        });
        actionAPI.setBadgeBackgroundColor({ color: '#52c41a' }, () => {
            if (browserAPI.runtime.lastError) {
                console.log('Badge color error:', browserAPI.runtime.lastError);
            }
        });

        // Update the tooltip
        if (actionAPI.setTitle) {
            const ruleText = activeRulesCount === 1 ? 'rule' : 'rules';
            actionAPI.setTitle({
                title: `Open Headers - Active\n${activeRulesCount} ${ruleText} active for this site`
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

export function resetBadgeState() {
    lastBadgeState = null;
}