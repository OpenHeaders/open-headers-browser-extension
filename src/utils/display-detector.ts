/**
 * DisplayDetector - Multi-display detection for browser extensions
 * Detects which monitor/display contains the browser window
 */

import { isChrome, isEdge } from './browser-api';
import { logger } from './logger';

export interface DisplayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: string;
  name: string;
  isPrimary: boolean;
  bounds: DisplayBounds;
  workArea: DisplayBounds;
  scaleFactor: number;
}

export interface WindowPosition {
  left: number | undefined;
  top: number | undefined;
  width: number | undefined;
  height: number | undefined;
  state: string | undefined;
  focused: boolean | undefined;
}

export interface DisplayForWindowResult {
  currentDisplay: DisplayInfo | null;
  allDisplays: DisplayInfo[];
  windowPosition: WindowPosition;
  relativePosition: { x: number; y: number } | null;
}

export interface BrowserWindowInfo {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  state?: string;
  focused?: boolean;
}

export class DisplayDetector {
  displays: DisplayInfo[];
  currentDisplay: DisplayInfo | null;

  constructor() {
    this.displays = [];
    this.currentDisplay = null;
  }

  /**
   * Initialize display detection and discover all available displays
   */
  async init(): Promise<DisplayInfo[]> {
    // Try Chrome/Edge system.display API first (most accurate)
    if ((isChrome || isEdge) && chrome?.system?.display) {
      try {
        this.displays = await this.getDisplaysFromChromeAPI();
        return this.displays;
      } catch (error) {
        logger.info('DisplayDetector', 'Chrome API failed, falling back:', error);
      }
    }

    // Fallback to basic Screen API (works in all browsers)
    this.displays = await this.getDisplaysFromScreenAPI();
    return this.displays;
  }

  /**
   * Get displays using Chrome's system.display API
   */
  async getDisplaysFromChromeAPI(): Promise<DisplayInfo[]> {
    return new Promise((resolve, reject) => {
      chrome.system.display.getInfo((displays) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const standardDisplays: DisplayInfo[] = displays.map(display => ({
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
   */
  async getDisplaysFromScreenAPI(): Promise<DisplayInfo[]> {
    const isPrimary = (window.screenX === 0 || window.screenX === undefined) &&
                     (window.screenY === 0 || window.screenY === undefined);

    return [{
      id: 'screen-0',
      name: isPrimary ? 'Primary Display' : 'Display',
      isPrimary: isPrimary,
      bounds: {
        left: (window.screen as unknown as { availLeft?: number }).availLeft || 0,
        top: (window.screen as unknown as { availTop?: number }).availTop || 0,
        width: window.screen.width,
        height: window.screen.height
      },
      workArea: {
        left: (window.screen as unknown as { availLeft?: number }).availLeft || 0,
        top: (window.screen as unknown as { availTop?: number }).availTop || 0,
        width: window.screen.availWidth,
        height: window.screen.availHeight
      },
      scaleFactor: window.devicePixelRatio || 1.0
    }];
  }

  /**
   * Detect which display contains the current browser window
   */
  async detectCurrentDisplay(browserWindow: BrowserWindowInfo): Promise<DisplayInfo> {
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
   */
  async getDisplayForWindow(browserWindow: BrowserWindowInfo): Promise<DisplayForWindowResult> {
    await this.init();
    const currentDisplay = await this.detectCurrentDisplay(browserWindow);

    return {
      currentDisplay,
      allDisplays: this.displays,
      windowPosition: {
        left: browserWindow.left,
        top: browserWindow.top,
        width: browserWindow.width,
        height: browserWindow.height,
        state: browserWindow.state,
        focused: browserWindow.focused
      },
      relativePosition: currentDisplay ? {
        x: (browserWindow.left ?? 0) - currentDisplay.bounds.left,
        y: (browserWindow.top ?? 0) - currentDisplay.bounds.top
      } : null
    };
  }
}
