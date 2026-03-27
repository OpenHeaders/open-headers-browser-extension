import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the browser-api module to control isSafari flag
let mockIsSafari = false;

vi.mock('../../src/utils/browser-api', () => ({
  get isSafari() { return mockIsSafari; },
}));

import { adaptWebSocketUrl, safariPreCheck } from '../../src/background/safari-websocket-adapter';

describe('safari-websocket-adapter', () => {
  beforeEach(() => {
    mockIsSafari = false;
    vi.clearAllMocks();
  });

  describe('adaptWebSocketUrl', () => {
    describe('Chrome/Edge/Firefox (default browser)', () => {
      it('returns URL unchanged', () => {
        const url = 'ws://127.0.0.1:9876/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('returns any URL unchanged', () => {
        const url = 'ws://localhost:3000/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });
    });

    describe('Safari', () => {
      beforeEach(() => {
        mockIsSafari = true;
      });

      it('returns URL unchanged for Safari (current implementation)', () => {
        const url = 'ws://127.0.0.1:9876/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('returns localhost URL unchanged for Safari', () => {
        const url = 'ws://localhost:3000/api';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });
    });
  });

  describe('safariPreCheck', () => {
    describe('non-Safari browsers', () => {
      it('returns true immediately for Chrome', async () => {
        mockIsSafari = false;
        const result = await safariPreCheck('ws://127.0.0.1:9876/ws');
        expect(result).toBe(true);
      });

      it('returns true without URL argument', async () => {
        const result = await safariPreCheck();
        expect(result).toBe(true);
      });
    });

    describe('Safari browser', () => {
      beforeEach(() => {
        mockIsSafari = true;
      });

      it('returns true for Safari (current implementation allows connections)', async () => {
        const result = await safariPreCheck('ws://127.0.0.1:9876/ws');
        expect(result).toBe(true);
      });

      it('returns true without URL argument', async () => {
        const result = await safariPreCheck();
        expect(result).toBe(true);
      });
    });
  });
});
