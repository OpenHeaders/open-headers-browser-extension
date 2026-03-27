import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  adaptUIMessage,
  adaptCoreResponse,
  adaptRecordingData,
  adaptInjectedEvent,
  NewMessageTypes,
} from '../../src/assets/recording/shared/message-adapter';
import { MESSAGE_TYPES } from '../../src/assets/recording/shared/constants';

describe('message-adapter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('NewMessageTypes', () => {
    it('defines all expected new message types', () => {
      expect(NewMessageTypes).toEqual({
        START_RECORDING: 'START_RECORDING',
        STOP_RECORDING: 'STOP_RECORDING',
        GET_RECORDING_STATE: 'GET_RECORDING_STATE',
        QUERY_RECORDING_STATE: 'QUERY_RECORDING_STATE',
        RECORDING_STATE_CHANGED: 'RECORDING_STATE_CHANGED',
        CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
        RECORDING_DATA: 'RECORDING_DATA',
      });
    });
  });

  describe('adaptUIMessage', () => {
    it('adapts START_RECORDING message', () => {
      const result = adaptUIMessage({
        type: MESSAGE_TYPES.START_RECORDING,
        tabId: 42,
        useWidget: true,
      });

      expect(result).toEqual({
        type: NewMessageTypes.START_RECORDING,
        payload: {
          tabId: 42,
          useWidget: true,
        },
      });
    });

    it('adapts STOP_RECORDING message', () => {
      const result = adaptUIMessage({
        type: MESSAGE_TYPES.STOP_RECORDING,
        tabId: 99,
      });

      expect(result).toEqual({
        type: NewMessageTypes.STOP_RECORDING,
        payload: {
          tabId: 99,
        },
      });
    });

    it('adapts CHECK_RECORDING_STATUS to GET_RECORDING_STATE', () => {
      const message = {
        type: 'CHECK_RECORDING_STATUS',
        tabId: 55,
      };

      const result = adaptUIMessage(message);

      expect(result).toEqual({
        type: 'GET_RECORDING_STATE',
        payload: {
          tabId: 55,
        },
      });
    });

    it('returns null for UPDATE_RECORDING_WIDGET', () => {
      const message = {
        type: 'UPDATE_RECORDING_WIDGET',
      };

      const result = adaptUIMessage(message);

      expect(result).toBeNull();
    });

    it('passes through unknown message types unchanged', () => {
      const originalMessage = {
        type: 'CUSTOM_MESSAGE',
        data: { key: 'value' },
      };

      const result = adaptUIMessage(originalMessage);

      expect(result).toEqual(originalMessage);
    });

    it('handles START_RECORDING without optional fields', () => {
      const result = adaptUIMessage({
        type: MESSAGE_TYPES.START_RECORDING,
      });

      expect(result).toEqual({
        type: NewMessageTypes.START_RECORDING,
        payload: {
          tabId: undefined,
          useWidget: undefined,
        },
      });
    });
  });

  describe('adaptCoreResponse', () => {
    it('adapts response for START_RECORDING', () => {
      const response = {
        success: true,
        recording: {
          id: 'rec_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          status: 'pre_navigation',
        },
      };

      const result = adaptCoreResponse(response, MESSAGE_TYPES.START_RECORDING);

      expect(result).toEqual({
        success: true,
        recordId: 'rec_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        isPreNav: true,
      });
    });

    it('adapts response for START_RECORDING with non-pre-nav status', () => {
      const response = {
        success: true,
        recording: {
          id: 'rec_f47ac10b-58cc-4372-a567-0e02b2c3d479',
          status: 'recording',
        },
      };

      const result = adaptCoreResponse(response, MESSAGE_TYPES.START_RECORDING);

      expect(result).toEqual({
        success: true,
        recordId: 'rec_f47ac10b-58cc-4372-a567-0e02b2c3d479',
        isPreNav: false,
      });
    });

    it('adapts response for STOP_RECORDING', () => {
      const recording = {
        id: 'rec_b2c3d4e5-f6a7-8901-bcde-f01234567890',
        status: 'stopped',
      };
      const response = {
        success: true,
        recording,
      };

      const result = adaptCoreResponse(response, MESSAGE_TYPES.STOP_RECORDING);

      expect(result).toEqual({
        success: true,
        recording,
      });
    });

    it('adapts CHECK_RECORDING_STATUS response to isRecording/recordId', () => {
      const response = {
        isRecording: true,
        recordingId: 'rec_c9a1f2b3-d4e5-6789-0abc-def012345678',
      };

      const result = adaptCoreResponse(response, 'CHECK_RECORDING_STATUS');

      expect(result).toEqual({
        isRecording: true,
        recordId: 'rec_c9a1f2b3-d4e5-6789-0abc-def012345678',
      });
    });

    it('passes through response for unknown message types', () => {
      const response = {
        success: true,
        custom: 'data',
      };

      const result = adaptCoreResponse(response, 'UNKNOWN_TYPE');

      expect(result).toEqual(response);
    });

    it('handles response without recording object for START_RECORDING', () => {
      const response = {
        success: false,
      };

      const result = adaptCoreResponse(response, MESSAGE_TYPES.START_RECORDING);

      expect(result).toEqual({
        success: false,
        recordId: undefined,
        isPreNav: false,
      });
    });
  });

  describe('adaptRecordingData', () => {
    it('returns null for null input', () => {
      expect(adaptRecordingData(null)).toBeNull();
    });

    it('adapts basic recording without events', () => {
      const result = adaptRecordingData({
        id: 'rec_d4e5f6a7-b8c9-0123-def0-123456789abc',
        tabId: 42,
        startTime: 1700000000000,
        endTime: 1700000060000,
        status: 'completed',
        url: 'https://dashboard.enterprise-corp.com/analytics',
        title: 'Analytics Dashboard',
      });

      expect(result).toEqual({
        recordId: 'rec_d4e5f6a7-b8c9-0123-def0-123456789abc',
        tabId: 42,
        startTime: 1700000000000,
        endTime: 1700000060000,
        status: 'completed',
        url: 'https://dashboard.enterprise-corp.com/analytics',
        title: 'Analytics Dashboard',
        events: [],
        console: [],
        network: [],
        storage: [],
        navigationHistory: [],
        flowType: 'nav',
        duration: 60000,
      });
    });

    it('sets flowType to pre-nav for pre_navigation status', () => {
      const result = adaptRecordingData({
        id: 'rec_e5f6a7b8-c9d0-1234-ef01-23456789abcd',
        startTime: 1700000000000,
        status: 'pre_navigation',
      });

      expect(result!.flowType).toBe('pre-nav');
    });

    it('calculates duration from startTime and endTime', () => {
      const result = adaptRecordingData({
        id: 'rec_f6a7b8c9-d0e1-2345-f012-3456789abcde',
        startTime: 1700000000000,
        endTime: 1700000120000,
      });

      expect(result!.duration).toBe(120000);
    });

    it('sets duration to 0 when endTime is missing', () => {
      const result = adaptRecordingData({
        id: 'rec_a7b8c9d0-e1f2-3456-0123-456789abcdef',
        startTime: 1700000000000,
      });

      expect(result!.duration).toBe(0);
    });

    it('separates events by type', () => {
      const result = adaptRecordingData({
        id: 'rec_b8c9d0e1-f2a3-4567-1234-56789abcdef0',
        startTime: 1700000000000,
        events: [
          {
            type: 'rrweb',
            timestamp: 1700000001000,
            data: { nodeType: 1, childNodes: [] },
          },
          {
            type: 'console',
            timestamp: 1700000002000,
            data: { level: 'error', message: 'Uncaught TypeError' },
          },
          {
            type: 'network',
            timestamp: 1700000003000,
            data: { url: 'https://api.acme-corp.com/v2/users', method: 'GET', status: 200 },
          },
          {
            type: 'storage',
            timestamp: 1700000004000,
            data: { storageType: 'localStorage', key: 'session', action: 'set' },
          },
          {
            type: 'navigation',
            timestamp: 1700000005000,
            url: 'https://app.acme-corp.com/settings',
            data: { transitionType: 'link' },
          },
        ],
      });

      expect(result!.events).toHaveLength(1);
      expect(result!.events[0]).toEqual({ nodeType: 1, childNodes: [] });

      expect(result!.console).toHaveLength(1);
      expect(result!.console[0]).toEqual({
        timestamp: 1700000002000,
        level: 'error',
        message: 'Uncaught TypeError',
      });

      expect(result!.network).toHaveLength(1);
      expect(result!.network[0]).toEqual({
        timestamp: 1700000003000,
        url: 'https://api.acme-corp.com/v2/users',
        method: 'GET',
        status: 200,
      });

      expect(result!.storage).toHaveLength(1);
      expect(result!.storage[0]).toEqual({
        timestamp: 1700000004000,
        storageType: 'localStorage',
        key: 'session',
        action: 'set',
      });

      expect(result!.navigationHistory).toHaveLength(1);
      expect(result!.navigationHistory[0]).toEqual({
        url: 'https://app.acme-corp.com/settings',
        timestamp: 1700000005000,
        transitionType: 'link',
      });
    });

    it('ignores events with unknown type', () => {
      const result = adaptRecordingData({
        id: 'rec_c9d0e1f2-a3b4-5678-2345-6789abcdef01',
        startTime: 1700000000000,
        events: [
          {
            type: 'unknown_event_type',
            timestamp: 1700000001000,
            data: { foo: 'bar' },
          },
        ],
      });

      expect(result!.events).toEqual([]);
      expect(result!.console).toEqual([]);
      expect(result!.network).toEqual([]);
      expect(result!.storage).toEqual([]);
      expect(result!.navigationHistory).toEqual([]);
    });
  });

  describe('adaptInjectedEvent', () => {
    it('wraps injected event in RECORDING_DATA message format', () => {
      // Mock window.location.href
      Object.defineProperty(window, 'location', {
        value: { href: 'https://app.enterprise-corp.com/dashboard' },
        writable: true,
        configurable: true,
      });

      const result = adaptInjectedEvent({
        type: 'rrweb',
        data: { type: 2, timestamp: 1700000001000 },
        timestamp: 1700000001000,
      });

      expect(result).toEqual({
        type: NewMessageTypes.RECORDING_DATA,
        payload: {
          type: 'rrweb',
          data: { type: 2, timestamp: 1700000001000 },
          timestamp: 1700000001000,
          url: 'https://app.enterprise-corp.com/dashboard',
        },
      });
    });

    it('uses Date.now() when event has no timestamp', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000099000);

      Object.defineProperty(window, 'location', {
        value: { href: 'https://app.acme-corp.com/test' },
        writable: true,
        configurable: true,
      });

      const result = adaptInjectedEvent({
        type: 'console',
        data: { level: 'log', message: 'test' },
      });

      expect(result.payload!['timestamp']).toBe(1700000099000);
    });
  });
});
