/**
 * AppLauncher - Handles launching/focusing the OpenHeaders desktop app
 * Uses multiple methods for reliability: WebSocket (via background), then protocol handler
 */
export class AppLauncher {
  constructor() {
    this.protocolName = 'openheaders';
    // Import browser API based on environment
    this.runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  }

  /**
   * Launch or focus the app with specific navigation
   * @param {Object} data - Navigation data
   * @param {string} data.tab - Main tab to navigate to ('rules', 'records', 'settings', etc.)
   * @param {string} data.subTab - Sub-tab if applicable
   * @param {string} data.action - Action to perform (edit, delete, toggle, toggleVideoRecording, etc.)
   * @param {string} data.itemId - ID of the item to act upon
   * @param {string} data.settingsTab - Specific settings tab to open ('workflows', 'general', 'appearance')
   * @param {*} data.value - Value for the action (e.g., true/false for toggles)
   * @returns {Promise<Object>} Result with success status and method used
   */
  async launchOrFocus(data = {}) {
    // Try WebSocket first via background script (fastest if app is running)
    if (await this.tryWebSocket(data)) {
      return { success: true, method: 'websocket' };
    }

    // Fallback to protocol handler
    await this.launchViaProtocol(data);
    
    return { success: true, method: 'protocol' };
  }

  async tryWebSocket(data) {
    try {
      // Send message to background script to use its WebSocket connection
      return new Promise((resolve) => {
        this.runtime.sendMessage({
          type: 'focusApp',
          navigation: data
        }, (response) => {
          // Check for errors
          const lastError = this.runtime.lastError;
          if (lastError) {
            console.log('Info: Could not send focusApp via background:', lastError.message);
            resolve(false);
          } else {
            resolve(response?.success || false);
          }
        });
      });
    } catch (e) {
      console.log('Info: Failed to communicate with background script:', e);
      return false;
    }
  }

  async launchViaProtocol(data) {
    // Build URL with navigation parameters
    const params = new URLSearchParams();
    if (data.tab) params.set('tab', data.tab);
    if (data.subTab) params.set('subTab', data.subTab);
    if (data.action) params.set('action', data.action);
    if (data.itemId) params.set('itemId', data.itemId);
    if (data.settingsTab) params.set('settingsTab', data.settingsTab);
    if (data.value !== undefined) params.set('value', String(data.value));
    
    const url = `${this.protocolName}://launch${params.toString() ? '?' + params.toString() : ''}`;
    
    // Method 1: Create a new tab with the protocol URL
    // This is cleaner than iframe for manifest v3
    if (chrome?.tabs?.create) {
      try {
        const tab = await chrome.tabs.create({ url, active: false });
        // Close the tab after a short delay
        setTimeout(() => {
          chrome.tabs.remove(tab.id).catch(() => {
            // Tab might already be closed
          });
        }, 100);
        return;
      } catch (e) {
        console.log('Info: Failed to create tab for protocol launch:', e);
      }
    }
    
    // Method 2: Use window.open as fallback
    try {
      const win = window.open(url, '_blank');
      if (win) {
        setTimeout(() => {
          win.close();
        }, 100);
      }
    } catch (e) {
      // Method 3: Set location as last resort
      window.location.href = url;
    }
  }
}

// Create singleton instance
let appLauncherInstance = null;

export function getAppLauncher() {
  if (!appLauncherInstance) {
    appLauncherInstance = new AppLauncher();
  }
  return appLauncherInstance;
}