import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock the browser-api module to control isSafari and isFirefox flags
let mockIsSafari = false;
let mockIsFirefox = false;

vi.mock('../../src/utils/browser-api', () => ({
  get isSafari() { return mockIsSafari; },
  get isFirefox() { return mockIsFirefox; },
}));

import { adaptWebSocketUrl, safariPreCheck } from '../../src/background/safari-websocket-adapter';

describe('safari-websocket-adapter', () => {
  beforeEach(() => {
    mockIsSafari = false;
    mockIsFirefox = false;
    vi.clearAllMocks();
  });

  describe('adaptWebSocketUrl', () => {
    describe('Chrome/Edge (default browser)', () => {
      it('returns URL unchanged for Chrome', () => {
        const url = 'ws://127.0.0.1:9876/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('returns wss URL unchanged for Chrome', () => {
        const url = 'wss://relay.enterprise-corp.com:443/connect';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('returns localhost URL unchanged for Chrome', () => {
        const url = 'wss://localhost:8080/socket';
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

      it('returns wss URL unchanged for Safari', () => {
        const url = 'wss://relay.enterprise-corp.com/connect';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('returns localhost URL unchanged for Safari', () => {
        const url = 'ws://localhost:3000/api';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });
    });

    describe('Firefox', () => {
      beforeEach(() => {
        mockIsFirefox = true;
      });

      it('downgrades wss:// to ws:// for 127.0.0.1', () => {
        expect(adaptWebSocketUrl('wss://127.0.0.1:9876/ws')).toBe('ws://127.0.0.1:9876/ws');
      });

      it('downgrades wss:// to ws:// for localhost', () => {
        expect(adaptWebSocketUrl('wss://localhost:8080/socket')).toBe('ws://localhost:8080/socket');
      });

      it('downgrades https:// to http:// for localhost', () => {
        expect(adaptWebSocketUrl('https://localhost:3000/api')).toBe('http://localhost:3000/api');
      });

      it('downgrades https:// to http:// for 127.0.0.1', () => {
        expect(adaptWebSocketUrl('https://127.0.0.1:8443/ws')).toBe('http://127.0.0.1:8443/ws');
      });

      it('does NOT downgrade wss:// for non-localhost URLs', () => {
        const url = 'wss://relay.enterprise-corp.com:443/connect';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('does NOT downgrade https:// for non-localhost URLs', () => {
        const url = 'https://api.acme-corp.com/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('keeps ws:// unchanged for localhost (already non-secure)', () => {
        const url = 'ws://127.0.0.1:9876/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('keeps ws:// unchanged for localhost hostname', () => {
        const url = 'ws://localhost:3000/ws';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('keeps http:// unchanged for localhost', () => {
        const url = 'http://127.0.0.1:8080/api';
        expect(adaptWebSocketUrl(url)).toBe(url);
      });

      it('handles URL with path and query params', () => {
        expect(adaptWebSocketUrl('wss://127.0.0.1:9876/ws?token=abc123&room=test'))
          .toBe('ws://127.0.0.1:9876/ws?token=abc123&room=test');
      });

      it('handles URL with 127.0.0.1 in path but different host', () => {
        // This URL contains '127.0.0.1' but the host is different
        const url = 'wss://relay.corp.com/proxy/127.0.0.1';
        // The implementation checks with includes(), so this WILL match
        expect(adaptWebSocketUrl(url)).toBe('ws://relay.corp.com/proxy/127.0.0.1');
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

      it('returns true immediately for Firefox', async () => {
        mockIsFirefox = true;
        mockIsSafari = false;
        const result = await safariPreCheck('ws://localhost:3000/ws');
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

      it('returns true for wss URL', async () => {
        const result = await safariPreCheck('wss://relay.enterprise-corp.com/connect');
        expect(result).toBe(true);
      });
    });
  });
});
