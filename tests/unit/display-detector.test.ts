import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DisplayInfo, DisplayBounds, BrowserWindowInfo } from '../../src/utils/display-detector';

// Mock browser-api before importing DisplayDetector
vi.mock('../../src/utils/browser-api', () => ({
  isChrome: true,
  isEdge: false,
}));

import { DisplayDetector } from '../../src/utils/display-detector';

// Helper to mock chrome.system.display.getInfo without type issues
function mockGetInfo(displays: Record<string, unknown>[]): void {
  // The mock in setup.ts uses callback pattern; override it safely
  (chrome.system.display.getInfo as ReturnType<typeof vi.fn>).mockImplementation(
    (callbackOrFlags: unknown, maybeCallback?: unknown) => {
      const cb = typeof callbackOrFlags === 'function' ? callbackOrFlags : maybeCallback;
      if (typeof cb === 'function') {
        (cb as (d: Record<string, unknown>[]) => void)(displays);
      }
    },
  );
}

// Helper to set lastError without readonly assignment error
function setLastError(err: { message: string } | null): void {
  Object.defineProperty(chrome.runtime, 'lastError', {
    value: err,
    writable: true,
    configurable: true,
  });
}

function makeDisplayBounds(overrides: Partial<DisplayBounds> = {}): DisplayBounds {
  return {
    left: 0,
    top: 0,
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

function makeDisplayInfo(overrides: Partial<DisplayInfo> = {}): DisplayInfo {
  return {
    id: 'display-a1b2c3d4',
    name: 'Primary Display',
    isPrimary: true,
    bounds: makeDisplayBounds(),
    workArea: makeDisplayBounds({ top: 25, height: 1055 }),
    scaleFactor: 1.0,
    ...overrides,
  };
}

function makeBrowserWindow(overrides: Partial<BrowserWindowInfo> = {}): BrowserWindowInfo {
  return {
    left: 100,
    top: 200,
    width: 1280,
    height: 720,
    state: 'normal',
    focused: true,
    ...overrides,
  };
}

function makeSecondaryDisplay(): DisplayInfo {
  return makeDisplayInfo({
    id: 'display-e5f6a7b8',
    name: 'External Monitor',
    isPrimary: false,
    bounds: makeDisplayBounds({ left: 1920, top: 0, width: 2560, height: 1440 }),
    workArea: makeDisplayBounds({ left: 1920, top: 0, width: 2560, height: 1440 }),
    scaleFactor: 2.0,
  });
}

function makeThirdDisplay(): DisplayInfo {
  return makeDisplayInfo({
    id: 'display-c9d0e1f2',
    name: 'Vertical Monitor',
    isPrimary: false,
    bounds: makeDisplayBounds({ left: -1080, top: 0, width: 1080, height: 1920 }),
    workArea: makeDisplayBounds({ left: -1080, top: 0, width: 1080, height: 1920 }),
    scaleFactor: 1.0,
  });
}

function makeChromeDisplayPayload(d: DisplayInfo): Record<string, unknown> {
  return {
    id: d.id,
    name: d.name,
    isPrimary: d.isPrimary,
    bounds: d.bounds,
    workArea: d.workArea,
    displayZoomFactor: d.scaleFactor,
  };
}

describe('DisplayDetector', () => {
  let detector: DisplayDetector;

  beforeEach(() => {
    detector = new DisplayDetector();
    vi.clearAllMocks();
    setLastError(null);
  });

  describe('constructor', () => {
    it('initializes with empty displays and null currentDisplay', () => {
      expect(detector.displays).toEqual([]);
      expect(detector.currentDisplay).toBeNull();
    });
  });

  describe('init', () => {
    it('uses Chrome system.display API when available', async () => {
      mockGetInfo([{
        id: 'disp-001',
        name: 'Built-in Display',
        isPrimary: true,
        bounds: { left: 0, top: 0, width: 2560, height: 1600 },
        workArea: { left: 0, top: 25, width: 2560, height: 1575 },
        displayZoomFactor: 2.0,
      }]);

      const displays = await detector.init();

      expect(displays).toHaveLength(1);
      expect(displays[0]).toEqual({
        id: 'disp-001',
        name: 'Built-in Display',
        isPrimary: true,
        bounds: { left: 0, top: 0, width: 2560, height: 1600 },
        workArea: { left: 0, top: 25, width: 2560, height: 1575 },
        scaleFactor: 2.0,
      });
    });

    it('handles display without workArea by using bounds as fallback', async () => {
      mockGetInfo([{
        id: 'disp-002',
        name: '',
        isPrimary: false,
        bounds: { left: 0, top: 0, width: 1920, height: 1080 },
        workArea: undefined,
        displayZoomFactor: undefined,
      }]);

      const displays = await detector.init();

      expect(displays[0].name).toBe('Display disp-002');
      expect(displays[0].workArea).toEqual(displays[0].bounds);
      expect(displays[0].scaleFactor).toBe(1.0);
    });

    it('falls back to Screen API when Chrome API fails', async () => {
      (chrome.system.display.getInfo as ReturnType<typeof vi.fn>).mockImplementation(
        (callbackOrFlags: unknown, maybeCallback?: unknown) => {
          const cb = typeof callbackOrFlags === 'function' ? callbackOrFlags : maybeCallback;
          setLastError({ message: 'Permission denied' });
          if (typeof cb === 'function') {
            (cb as (d: never[]) => void)([]);
          }
        },
      );

      Object.defineProperty(window, 'screenX', { value: 0, configurable: true });
      Object.defineProperty(window, 'screenY', { value: 0, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 2.0, configurable: true });
      Object.defineProperty(window.screen, 'width', { value: 1440, configurable: true });
      Object.defineProperty(window.screen, 'height', { value: 900, configurable: true });
      Object.defineProperty(window.screen, 'availWidth', { value: 1440, configurable: true });
      Object.defineProperty(window.screen, 'availHeight', { value: 875, configurable: true });

      const displays = await detector.init();

      expect(displays).toHaveLength(1);
      expect(displays[0].id).toBe('screen-0');
      expect(displays[0].isPrimary).toBe(true);
      expect(displays[0].scaleFactor).toBe(2.0);
    });
  });

  describe('detectCurrentDisplay', () => {
    it('returns single display when only one exists', async () => {
      const primary = makeDisplayInfo();
      detector.displays = [primary];

      const result = await detector.detectCurrentDisplay(makeBrowserWindow());

      expect(result).toEqual(primary);
      expect(detector.currentDisplay).toEqual(primary);
    });

    it('detects window on primary display in multi-monitor setup', async () => {
      const primary = makeDisplayInfo();
      const secondary = makeSecondaryDisplay();
      detector.displays = [primary, secondary];

      const windowOnPrimary = makeBrowserWindow({ left: 500, top: 300 });
      const result = await detector.detectCurrentDisplay(windowOnPrimary);

      expect(result.id).toBe('display-a1b2c3d4');
    });

    it('detects window on secondary display in multi-monitor setup', async () => {
      const primary = makeDisplayInfo();
      const secondary = makeSecondaryDisplay();
      detector.displays = [primary, secondary];

      const windowOnSecondary = makeBrowserWindow({ left: 2200, top: 400 });
      const result = await detector.detectCurrentDisplay(windowOnSecondary);

      expect(result.id).toBe('display-e5f6a7b8');
    });

    it('detects window on display with negative coordinates (left monitor)', async () => {
      const primary = makeDisplayInfo();
      const leftMonitor = makeThirdDisplay();
      detector.displays = [primary, leftMonitor];

      const windowOnLeft = makeBrowserWindow({ left: -800, top: 200 });
      const result = await detector.detectCurrentDisplay(windowOnLeft);

      expect(result.id).toBe('display-c9d0e1f2');
    });

    it('finds closest display when window is between monitors', async () => {
      const primary = makeDisplayInfo({ bounds: makeDisplayBounds({ left: 0, width: 1920 }) });
      const secondary = makeSecondaryDisplay();
      detector.displays = [primary, secondary];

      // Window at position between monitors (gap area)
      const windowInGap = makeBrowserWindow({ left: 1910, top: 500 });
      const result = await detector.detectCurrentDisplay(windowInGap);

      expect(result).toBeDefined();
      expect(result.id).toBeTruthy();
    });

    it('handles window with undefined position', async () => {
      const primary = makeDisplayInfo();
      detector.displays = [primary];

      const windowNoPos = makeBrowserWindow({ left: undefined, top: undefined });
      const result = await detector.detectCurrentDisplay(windowNoPos);

      expect(result).toEqual(primary);
    });

    it('calls init if displays array is empty', async () => {
      const display = makeDisplayInfo({ id: 'auto-init-display', name: 'Auto Init' });
      mockGetInfo([makeChromeDisplayPayload(display)]);

      expect(detector.displays).toHaveLength(0);
      const result = await detector.detectCurrentDisplay(makeBrowserWindow());
      expect(detector.displays.length).toBeGreaterThan(0);
      expect(result).toBeDefined();
    });
  });

  describe('getDisplayForWindow', () => {
    it('returns full display information for a browser window', async () => {
      const primary = makeDisplayInfo();
      mockGetInfo([makeChromeDisplayPayload(primary)]);

      const browserWindow = makeBrowserWindow({ left: 300, top: 150, width: 1024, height: 768 });
      const result = await detector.getDisplayForWindow(browserWindow);

      expect(result.currentDisplay).toBeDefined();
      expect(result.allDisplays).toHaveLength(1);
      expect(result.windowPosition).toEqual({
        left: 300,
        top: 150,
        width: 1024,
        height: 768,
        state: 'normal',
        focused: true,
      });
      expect(result.relativePosition).toEqual({
        x: 300,
        y: 150,
      });
    });

    it('calculates relative position on secondary display', async () => {
      const primary = makeDisplayInfo();
      const secondary = makeSecondaryDisplay();
      mockGetInfo([primary, secondary].map(makeChromeDisplayPayload));

      const browserWindow = makeBrowserWindow({ left: 2100, top: 200 });
      const result = await detector.getDisplayForWindow(browserWindow);

      expect(result.currentDisplay!.id).toBe('display-e5f6a7b8');
      expect(result.relativePosition).toEqual({
        x: 2100 - 1920,
        y: 200,
      });
    });

    it('returns non-null relative position when display is found', async () => {
      const primary = makeDisplayInfo();
      mockGetInfo([makeChromeDisplayPayload(primary)]);

      const browserWindow = makeBrowserWindow();
      const result = await detector.getDisplayForWindow(browserWindow);

      expect(result.currentDisplay).not.toBeNull();
      expect(result.relativePosition).not.toBeNull();
    });

    it('handles window with undefined left/top in relative position', async () => {
      const primary = makeDisplayInfo();
      mockGetInfo([makeChromeDisplayPayload(primary)]);

      const browserWindow: BrowserWindowInfo = { left: undefined, top: undefined };
      const result = await detector.getDisplayForWindow(browserWindow);

      expect(result.relativePosition).toEqual({
        x: 0 - primary.bounds.left,
        y: 0 - primary.bounds.top,
      });
    });
  });

  describe('getDisplaysFromScreenAPI (fallback)', () => {
    it('detects non-primary display when screenX is non-zero', async () => {
      const origSystem = chrome.system;
      (chrome as Record<string, unknown>).system = undefined;

      Object.defineProperty(window, 'screenX', { value: 1920, configurable: true });
      Object.defineProperty(window, 'screenY', { value: 0, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1.0, configurable: true });

      const freshDetector = new DisplayDetector();
      const displays = await freshDetector.init();

      expect(displays[0].isPrimary).toBe(false);
      expect(displays[0].name).toBe('Display');

      chrome.system = origSystem;
    });
  });
});
