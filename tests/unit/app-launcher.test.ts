import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LaunchData } from '../../src/utils/app-launcher';
import { AppLauncher, getAppLauncher } from '../../src/utils/app-launcher';

// Helper to set lastError without readonly assignment error
function setLastError(err: { message?: string } | null): void {
  Object.defineProperty(chrome.runtime, 'lastError', {
    value: err,
    writable: true,
    configurable: true,
  });
}

function makeLaunchData(overrides: Partial<LaunchData> = {}): LaunchData {
  return {
    tab: 'headers',
    subTab: 'request-headers',
    action: 'edit',
    itemId: 'item_7f3a2b1c-d4e5-6789-abcd-ef0123456789',
    settingsTab: 'general',
    value: 'https://api.enterprise-corp.com/v3/config',
    ...overrides,
  };
}

describe('AppLauncher', () => {
  let launcher: AppLauncher;

  beforeEach(() => {
    launcher = new AppLauncher();
    vi.clearAllMocks();
    setLastError(null);
  });

  describe('constructor', () => {
    it('creates an instance with chrome runtime', () => {
      expect(launcher).toBeInstanceOf(AppLauncher);
    });
  });

  describe('launchOrFocus', () => {
    it('returns websocket method when background script responds with success', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        (callback as (response: { success: boolean }) => void)({ success: true });
      });

      const result = await launcher.launchOrFocus(makeLaunchData());

      expect(result).toEqual({ success: true, method: 'websocket' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'focusApp', navigation: makeLaunchData() },
        expect.any(Function),
      );
    });

    it('falls back to protocol handler when websocket fails', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        (callback as (response: { success: boolean }) => void)({ success: false });
      });

      vi.mocked(chrome.tabs.create).mockImplementation((_props) => {
        return Promise.resolve({ id: 42 } as chrome.tabs.Tab);
      });
      (chrome.tabs as Record<string, unknown>).remove = vi.fn(() => Promise.resolve());

      const result = await launcher.launchOrFocus(makeLaunchData({ tab: 'settings' }));

      expect(result).toEqual({ success: true, method: 'protocol' });
    });

    it('falls back to protocol when runtime.lastError is set', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        setLastError({ message: 'Extension context invalidated' });
        (callback as (response: undefined) => void)(undefined);
        setLastError(null);
      });

      vi.mocked(chrome.tabs.create).mockImplementation((_props) => {
        return Promise.resolve({ id: 99 } as chrome.tabs.Tab);
      });
      (chrome.tabs as Record<string, unknown>).remove = vi.fn(() => Promise.resolve());

      const result = await launcher.launchOrFocus({});

      expect(result).toEqual({ success: true, method: 'protocol' });
    });

    it('handles empty launch data', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        (callback as (response: { success: boolean }) => void)({ success: true });
      });

      const result = await launcher.launchOrFocus();

      expect(result).toEqual({ success: true, method: 'websocket' });
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { type: 'focusApp', navigation: {} },
        expect.any(Function),
      );
    });

    it('propagates error when sendMessage throws synchronously in promise executor', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation(() => {
        throw new Error('Cannot access runtime');
      });

      // When sendMessage throws inside the Promise executor, the promise rejects.
      // The try-catch in tryWebSocket wraps `return new Promise(...)` but the
      // Promise constructor catches executor throws as rejections, not synchronous errors.
      // The rejected promise bubbles up through launchOrFocus since it awaits tryWebSocket.
      await expect(launcher.launchOrFocus(makeLaunchData())).rejects.toThrow('Cannot access runtime');
    });
  });

  describe('protocol URL construction', () => {
    it('builds URL with all parameters', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        (callback as (response: { success: boolean }) => void)({ success: false });
      });

      let capturedUrl = '';
      vi.mocked(chrome.tabs.create).mockImplementation((props) => {
        capturedUrl = (props as { url: string }).url;
        return Promise.resolve({ id: 50 } as chrome.tabs.Tab);
      });
      (chrome.tabs as Record<string, unknown>).remove = vi.fn(() => Promise.resolve());

      await launcher.launchOrFocus(makeLaunchData());

      expect(capturedUrl).toContain('openheaders://launch?');
      expect(capturedUrl).toContain('tab=headers');
      expect(capturedUrl).toContain('subTab=request-headers');
      expect(capturedUrl).toContain('action=edit');
      expect(capturedUrl).toContain('itemId=item_7f3a2b1c-d4e5-6789-abcd-ef0123456789');
      expect(capturedUrl).toContain('settingsTab=general');
      expect(capturedUrl).toContain('value=https');
    });

    it('builds URL without parameters when data is empty', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        (callback as (response: { success: boolean }) => void)({ success: false });
      });

      let capturedUrl = '';
      vi.mocked(chrome.tabs.create).mockImplementation((props) => {
        capturedUrl = (props as { url: string }).url;
        return Promise.resolve({ id: 51 } as chrome.tabs.Tab);
      });
      (chrome.tabs as Record<string, unknown>).remove = vi.fn(() => Promise.resolve());

      await launcher.launchOrFocus({});

      expect(capturedUrl).toBe('openheaders://launch');
    });

    it('includes only provided parameters', async () => {
      vi.mocked(chrome.runtime.sendMessage).mockImplementation((_message, callback) => {
        (callback as (response: { success: boolean }) => void)({ success: false });
      });

      let capturedUrl = '';
      vi.mocked(chrome.tabs.create).mockImplementation((props) => {
        capturedUrl = (props as { url: string }).url;
        return Promise.resolve({ id: 52 } as chrome.tabs.Tab);
      });
      (chrome.tabs as Record<string, unknown>).remove = vi.fn(() => Promise.resolve());

      await launcher.launchOrFocus({ tab: 'recordings', action: 'view' });

      expect(capturedUrl).toBe('openheaders://launch?tab=recordings&action=view');
    });
  });

  describe('getAppLauncher singleton', () => {
    it('returns an AppLauncher instance', () => {
      const instance = getAppLauncher();
      expect(instance).toBeInstanceOf(AppLauncher);
    });

    it('returns the same instance on repeated calls', () => {
      const instance1 = getAppLauncher();
      const instance2 = getAppLauncher();
      expect(instance1).toBe(instance2);
    });
  });
});
