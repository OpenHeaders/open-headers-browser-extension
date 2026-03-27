/**
 * AppLauncher - Handles launching/focusing the OpenHeaders desktop app
 * Uses multiple methods for reliability: WebSocket (via background), then protocol handler
 */

import { logger } from './logger';

declare const browser: typeof chrome | undefined;

export interface LaunchData {
  tab?: string;
  subTab?: string;
  action?: string;
  itemId?: string;
  settingsTab?: string;
  value?: unknown;
}

interface LaunchResult {
  success: boolean;
  method: string;
}

export class AppLauncher {
  private protocolName: string;
  private runtime: typeof chrome.runtime;

  constructor() {
    this.protocolName = 'openheaders';
    this.runtime = typeof browser !== 'undefined' ? browser.runtime : chrome.runtime;
  }

  /**
   * Launch or focus the app with specific navigation
   */
  async launchOrFocus(data: LaunchData = {}): Promise<LaunchResult> {
    // Try WebSocket first via background script (fastest if app is running)
    if (await this.tryWebSocket(data)) {
      return { success: true, method: 'websocket' };
    }

    // Fallback to protocol handler
    await this.launchViaProtocol(data);

    return { success: true, method: 'protocol' };
  }

  private async tryWebSocket(data: LaunchData): Promise<boolean> {
    try {
      // Send message to background script to use its WebSocket connection
      return new Promise<boolean>((resolve) => {
        this.runtime.sendMessage({
          type: 'focusApp',
          navigation: data
        }, (response: { success?: boolean } | undefined) => {
          // Check for errors
          const lastError = this.runtime.lastError;
          if (lastError) {
            logger.info('AppLauncher', 'Could not send focusApp via background:', lastError.message);
            resolve(false);
          } else {
            resolve(response?.success || false);
          }
        });
      });
    } catch (e) {
      logger.info('AppLauncher', 'Failed to communicate with background script:', e);
      return false;
    }
  }

  private async launchViaProtocol(data: LaunchData): Promise<void> {
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
    if (chrome?.tabs?.create) {
      try {
        const tab = await chrome.tabs.create({ url, active: false });
        // Close the tab after a short delay
        setTimeout(() => {
          if (tab.id) {
            chrome.tabs.remove(tab.id).catch(() => {
              // Tab might already be closed
            });
          }
        }, 100);
        return;
      } catch (e) {
        logger.info('AppLauncher', 'Failed to create tab for protocol launch:', e);
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
let appLauncherInstance: AppLauncher | null = null;

export function getAppLauncher(): AppLauncher {
  if (!appLauncherInstance) {
    appLauncherInstance = new AppLauncher();
  }
  return appLauncherInstance;
}
