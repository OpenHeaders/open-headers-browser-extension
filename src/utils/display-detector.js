/**
 * DisplayDetector - Multi-display detection for browser extensions
 * Detects which monitor/display contains the browser window
 */

import { isChrome, isEdge, isFirefox } from './browser-api.js';

export class DisplayDetector {
  constructor() {
    this.displays = [];
    this.currentDisplay = null;
  }

  /**
   * Initialize display detection and discover all available displays
   * @returns {Promise<Array>} Array of display objects
   */
  async init() {
    // Try Chrome/Edge system.display API first (most accurate)
    if ((isChrome || isEdge) && chrome?.system?.display) {
      try {
        this.displays = await this.getDisplaysFromChromeAPI();
        return this.displays;
      } catch (error) {
        console.log('[DisplayDetector] Chrome API failed, falling back:', error);
      }
    }

    // Fallback to basic Screen API (works in all browsers)
    this.displays = await this.getDisplaysFromScreenAPI();
    return this.displays;
  }

  /**
   * Get displays using Chrome's system.display API
   * @returns {Promise<Array>} Array of display objects
   */
  async getDisplaysFromChromeAPI() {
    return new Promise((resolve, reject) => {
      chrome.system.display.getInfo((displays) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        // Transform Chrome display format to our standard format
        const standardDisplays = displays.map(display => ({
          id: display.id,
          name: display.name || `Display ${display.id}`,
          isPrimary: display.isPrimary || false,
          bounds: {
            left: display.bounds.left,
            top: display.bounds.top,
            width: display.bounds.width,
            height: display.bounds.height
          },
          workArea: display.workArea ? {
            left: display.workArea.left,
            top: display.workArea.top,
            width: display.workArea.width,
            height: display.workArea.height
          } : display.bounds,
          scaleFactor: display.displayZoomFactor || 1.0
        }));

        resolve(standardDisplays);
      });
    });
  }

  /**
   * Get displays using basic Screen API (fallback)
   * @returns {Promise<Array>} Array of display objects
   */
  async getDisplaysFromScreenAPI() {
    // Basic screen API only gives us the current screen
    // We'll detect if it's primary based on position (0,0)
    const isPrimary = (window.screenX === 0 || window.screenX === undefined) && 
                     (window.screenY === 0 || window.screenY === undefined);

    return [{
      id: 'screen-0',
      name: isPrimary ? 'Primary Display' : 'Display',
      isPrimary: isPrimary,
      bounds: {
        left: window.screen.availLeft || 0,
        top: window.screen.availTop || 0,
        width: window.screen.width,
        height: window.screen.height
      },
      workArea: {
        left: window.screen.availLeft || 0,
        top: window.screen.availTop || 0,
        width: window.screen.availWidth,
        height: window.screen.availHeight
      },
      scaleFactor: window.devicePixelRatio || 1.0
    }];
  }

  /**
   * Detect which display contains the current browser window
   * @param {Object} browserWindow - Browser window object with position info
   * @returns {Promise<Object>} Display object containing the window
   */
  async detectCurrentDisplay(browserWindow) {
    if (!this.displays.length) {
      await this.init();
    }

    // If we only have one display, return it
    if (this.displays.length === 1) {
      this.currentDisplay = this.displays[0];
      return this.currentDisplay;
    }

    // Get window position
    const windowLeft = browserWindow?.left ?? window.screenX ?? 0;
    const windowTop = browserWindow?.top ?? window.screenY ?? 0;

    // Find which display contains this window position
    for (const display of this.displays) {
      const bounds = display.bounds;
      if (windowLeft >= bounds.left && 
          windowLeft < (bounds.left + bounds.width) &&
          windowTop >= bounds.top && 
          windowTop < (bounds.top + bounds.height)) {
        this.currentDisplay = display;
        return display;
      }
    }

    // If no exact match, find the closest display
    let closestDisplay = this.displays[0];
    let minDistance = Infinity;

    for (const display of this.displays) {
      const bounds = display.bounds;
      const centerX = bounds.left + bounds.width / 2;
      const centerY = bounds.top + bounds.height / 2;
      const distance = Math.sqrt(
        Math.pow(windowLeft - centerX, 2) + 
        Math.pow(windowTop - centerY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestDisplay = display;
      }
    }

    this.currentDisplay = closestDisplay;
    return closestDisplay;
  }

  /**
   * Get display information for a specific browser window
   * @param {Object} window - Browser window object
   * @returns {Promise<Object>} Display info with window context
   */
  async getDisplayForWindow(window) {
    await this.init();
    const currentDisplay = await this.detectCurrentDisplay(window);
    
    return {
      currentDisplay,
      allDisplays: this.displays,  // Send all available displays for better matching
      windowPosition: {
        left: window.left,
        top: window.top,
        width: window.width,
        height: window.height,
        state: window.state,
        focused: window.focused
      },
      // Calculate relative position within the display
      relativePosition: currentDisplay ? {
        x: window.left - currentDisplay.bounds.left,
        y: window.top - currentDisplay.bounds.top
      } : null
    };
  }
}