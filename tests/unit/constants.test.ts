import { describe, it, expect } from 'vitest';
import { MESSAGE_TYPES, RECORDING_STATES } from '../../src/assets/recording/shared/constants';
import type { MessageType, RecordingStateType } from '../../src/assets/recording/shared/constants';

describe('constants', () => {
  describe('MESSAGE_TYPES', () => {
    it('defines all expected message types with correct values', () => {
      expect(MESSAGE_TYPES).toEqual({
        START_RECORDING: 'START_RECORDING',
        STOP_RECORDING: 'STOP_RECORDING',
        CANCEL_RECORDING: 'CANCEL_RECORDING',
        GET_RECORDING_STATE: 'GET_RECORDING_STATE',
        CHECK_RECORDING_STATUS: 'CHECK_RECORDING_STATUS',
        UPDATE_RECORDING_WIDGET: 'UPDATE_RECORDING_WIDGET',
        RECORDING_STARTED: 'RECORDING_STARTED',
        RECORDING_STOPPED: 'RECORDING_STOPPED',
        RECORDING_ERROR: 'RECORDING_ERROR',
        RECORDING_DATA: 'RECORDING_DATA',
      });
    });

    it('has no duplicate values', () => {
      const values = Object.values(MESSAGE_TYPES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('has exactly 10 message types', () => {
      expect(Object.keys(MESSAGE_TYPES)).toHaveLength(10);
    });

    it('values are assignable to MessageType', () => {
      const start: MessageType = MESSAGE_TYPES.START_RECORDING;
      const stop: MessageType = MESSAGE_TYPES.STOP_RECORDING;
      const cancel: MessageType = MESSAGE_TYPES.CANCEL_RECORDING;
      const getState: MessageType = MESSAGE_TYPES.GET_RECORDING_STATE;
      const checkStatus: MessageType = MESSAGE_TYPES.CHECK_RECORDING_STATUS;
      const updateWidget: MessageType = MESSAGE_TYPES.UPDATE_RECORDING_WIDGET;
      const started: MessageType = MESSAGE_TYPES.RECORDING_STARTED;
      const stopped: MessageType = MESSAGE_TYPES.RECORDING_STOPPED;
      const error: MessageType = MESSAGE_TYPES.RECORDING_ERROR;
      const data: MessageType = MESSAGE_TYPES.RECORDING_DATA;

      expect(start).toBe('START_RECORDING');
      expect(stop).toBe('STOP_RECORDING');
      expect(cancel).toBe('CANCEL_RECORDING');
      expect(getState).toBe('GET_RECORDING_STATE');
      expect(checkStatus).toBe('CHECK_RECORDING_STATUS');
      expect(updateWidget).toBe('UPDATE_RECORDING_WIDGET');
      expect(started).toBe('RECORDING_STARTED');
      expect(stopped).toBe('RECORDING_STOPPED');
      expect(error).toBe('RECORDING_ERROR');
      expect(data).toBe('RECORDING_DATA');
    });

    it('is frozen (const assertion ensures immutability at type level)', () => {
      // Values should be string literals, not just string
      const startType: 'START_RECORDING' = MESSAGE_TYPES.START_RECORDING;
      expect(startType).toBe('START_RECORDING');
    });
  });

  describe('RECORDING_STATES', () => {
    it('defines all expected recording states with correct values', () => {
      expect(RECORDING_STATES).toEqual({
        IDLE: 'idle',
        RECORDING: 'recording',
        STOPPING: 'stopping',
      });
    });

    it('has no duplicate values', () => {
      const values = Object.values(RECORDING_STATES);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });

    it('has exactly 3 recording states', () => {
      expect(Object.keys(RECORDING_STATES)).toHaveLength(3);
    });

    it('values are assignable to RecordingStateType', () => {
      const idle: RecordingStateType = RECORDING_STATES.IDLE;
      const recording: RecordingStateType = RECORDING_STATES.RECORDING;
      const stopping: RecordingStateType = RECORDING_STATES.STOPPING;

      expect(idle).toBe('idle');
      expect(recording).toBe('recording');
      expect(stopping).toBe('stopping');
    });

    it('is frozen (const assertion ensures immutability at type level)', () => {
      const idleType: 'idle' = RECORDING_STATES.IDLE;
      expect(idleType).toBe('idle');
    });
  });

  describe('cross-reference integrity', () => {
    it('MESSAGE_TYPES keys and values are all non-empty strings', () => {
      for (const [key, value] of Object.entries(MESSAGE_TYPES)) {
        expect(key).toBeTruthy();
        expect(typeof key).toBe('string');
        expect(value).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    });

    it('RECORDING_STATES keys and values are all non-empty strings', () => {
      for (const [key, value] of Object.entries(RECORDING_STATES)) {
        expect(key).toBeTruthy();
        expect(typeof key).toBe('string');
        expect(value).toBeTruthy();
        expect(typeof value).toBe('string');
      }
    });
  });
});
