import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingStateMachine, RecordingStates } from '../../src/assets/recording/shared/state-machine';
import { RecordingState } from '../../src/assets/recording/shared/recording-state';

vi.mock('../../src/utils/logger', () => ({
    logger: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

const TAB_ID_PRIMARY = 101;
const TAB_ID_SECONDARY = 202;
const TAB_ID_TERTIARY = 303;

function makeStateMachine(): RecordingStateMachine {
  return new RecordingStateMachine();
}

function makeRecording(overrides: {
  recordId?: string;
  startTime?: number;
} = {}): RecordingState {
  return new RecordingState(
    overrides.recordId ?? 'rec_b7e4d2a1-c3f5-4890-9abc-def012345678',
    overrides.startTime ?? 1700000000000,
  );
}

describe('RecordingStateMachine', () => {
  let sm: RecordingStateMachine;

  beforeEach(() => {
    sm = makeStateMachine();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('initializes with empty tabStates map', () => {
      expect(sm.tabStates.size).toBe(0);
    });
  });

  describe('getTabState', () => {
    it('creates default idle state for new tab', () => {
      const state = sm.getTabState(TAB_ID_PRIMARY);

      expect(state).toEqual({
        state: RecordingStates.IDLE,
        recording: null,
        initializationToken: null,
        lastError: null,
        startTime: 0,
      });
    });

    it('returns existing state for known tab', () => {
      const first = sm.getTabState(TAB_ID_PRIMARY);
      first.state = RecordingStates.RECORDING;

      const second = sm.getTabState(TAB_ID_PRIMARY);
      expect(second.state).toBe(RecordingStates.RECORDING);
    });

    it('maintains independent state per tab', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');

      const primaryState = sm.getTabState(TAB_ID_PRIMARY);
      const secondaryState = sm.getTabState(TAB_ID_SECONDARY);

      expect(primaryState.state).toBe(RecordingStates.RECORDING);
      expect(secondaryState.state).toBe(RecordingStates.IDLE);
    });
  });

  describe('RecordingStates values', () => {
    it('defines all expected states', () => {
      expect(RecordingStates).toEqual({
        IDLE: 'idle',
        STARTING: 'starting',
        RECORDING: 'recording',
        PRE_NAVIGATION: 'pre_navigation',
        STOPPING: 'stopping',
        ERROR: 'error',
      });
    });
  });

  describe('tryTransition', () => {
    it('returns new state on valid transition', () => {
      const result = sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(result).toBe(RecordingStates.STARTING);
      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.STARTING);
    });

    it('returns null on invalid transition', () => {
      const result = sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(result).toBeNull();
      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
    });

    it('allows IDLE -> STARTING via START_RECORDING', () => {
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(RecordingStates.STARTING);
    });

    it('allows STARTING -> RECORDING via RECORDING_READY', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY')).toBe(RecordingStates.RECORDING);
    });

    it('allows STARTING -> PRE_NAVIGATION via START_PRE_NAV', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_PRE_NAV')).toBe(RecordingStates.PRE_NAVIGATION);
    });

    it('allows PRE_NAVIGATION -> RECORDING via NAVIGATION_COMMITTED', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'START_PRE_NAV');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'NAVIGATION_COMMITTED')).toBe(RecordingStates.RECORDING);
    });

    it('allows RECORDING -> STOPPING via STOP_RECORDING', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(RecordingStates.STOPPING);
    });

    it('allows PRE_NAVIGATION -> STOPPING via STOP_RECORDING', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'START_PRE_NAV');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(RecordingStates.STOPPING);
    });

    it('allows STOPPING -> IDLE via RECORDING_STOPPED', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
      sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_STOPPED')).toBe(RecordingStates.IDLE);
    });

    it('allows ERROR -> IDLE via RESET', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'ERROR');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'RESET')).toBe(RecordingStates.IDLE);
    });

    it('rejects invalid transitions', () => {
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY')).toBeNull();
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBeNull();
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'NAVIGATION_COMMITTED')).toBeNull();
    });

    it('rejects RECORDING -> START_RECORDING (already recording)', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBeNull();
    });

    it('sets startTime and initializationToken on STARTING', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000050000);
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');

      const state = sm.getTabState(TAB_ID_PRIMARY);
      expect(state.startTime).toBe(1700000050000);
      expect(state.initializationToken).toBeTruthy();
      expect(typeof state.initializationToken).toBe('string');
    });

    it('sets lastError on ERROR transition', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'ERROR', { error: 'Content script injection failed' });

      const state = sm.getTabState(TAB_ID_PRIMARY);
      expect(state.state).toBe(RecordingStates.ERROR);
      expect(state.lastError).toBe('Content script injection failed');
    });

    it('sets default error message when no error provided', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'ERROR');

      expect(sm.getTabState(TAB_ID_PRIMARY).lastError).toBe('Unknown error');
    });

    it('clears state on IDLE transition', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'ERROR', { error: 'test error' });
      sm.tryTransition(TAB_ID_PRIMARY, 'RESET');

      const state = sm.getTabState(TAB_ID_PRIMARY);
      expect(state.state).toBe(RecordingStates.IDLE);
      expect(state.recording).toBeNull();
      expect(state.initializationToken).toBeNull();
      expect(state.lastError).toBeNull();
    });

    describe('full lifecycle: idle -> starting -> recording -> stopping -> idle', () => {
      it('completes full recording lifecycle', () => {
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(RecordingStates.STARTING);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY')).toBe(RecordingStates.RECORDING);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(RecordingStates.STOPPING);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_STOPPED')).toBe(RecordingStates.IDLE);
      });
    });

    describe('pre-navigation flow: idle -> starting -> pre_nav -> recording -> stopping -> idle', () => {
      it('completes pre-navigation flow', () => {
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(RecordingStates.STARTING);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_PRE_NAV')).toBe(RecordingStates.PRE_NAVIGATION);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'NAVIGATION_COMMITTED')).toBe(RecordingStates.RECORDING);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(RecordingStates.STOPPING);
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_STOPPED')).toBe(RecordingStates.IDLE);
      });
    });

    describe('error recovery flow', () => {
      it('recovers from error during starting', () => {
        sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.tryTransition(TAB_ID_PRIMARY, 'ERROR', { error: 'Tab closed unexpectedly' });
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.ERROR);

        sm.tryTransition(TAB_ID_PRIMARY, 'RESET');
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);

        expect(sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(RecordingStates.STARTING);
      });

      it('recovers from error during recording', () => {
        sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
        sm.tryTransition(TAB_ID_PRIMARY, 'ERROR', { error: 'WebSocket disconnected' });

        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.ERROR);
        expect(sm.getTabState(TAB_ID_PRIMARY).lastError).toBe('WebSocket disconnected');

        sm.tryTransition(TAB_ID_PRIMARY, 'RESET');
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });

      it('recovers from error during stopping', () => {
        sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
        sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING');
        sm.tryTransition(TAB_ID_PRIMARY, 'ERROR', { error: 'Data upload failed' });

        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.ERROR);
        sm.tryTransition(TAB_ID_PRIMARY, 'RESET');
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });

      it('cannot transition to error from IDLE', () => {
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'ERROR')).toBeNull();
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });

      it('cannot transition to error from PRE_NAVIGATION', () => {
        sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.tryTransition(TAB_ID_PRIMARY, 'START_PRE_NAV');
        expect(sm.tryTransition(TAB_ID_PRIMARY, 'ERROR')).toBeNull();
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.PRE_NAVIGATION);
      });
    });
  });

  describe('setRecording', () => {
    it('associates a RecordingState with a tab', () => {
      const recording = makeRecording();
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.setRecording(TAB_ID_PRIMARY, recording);

      const tabState = sm.getTabState(TAB_ID_PRIMARY);
      expect(tabState.recording).toBe(recording);
      expect(tabState.recording!.recordId).toBe('rec_b7e4d2a1-c3f5-4890-9abc-def012345678');
    });
  });

  describe('isRecording', () => {
    it('returns false for idle tab', () => {
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(false);
    });

    it('returns false for starting tab', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(false);
    });

    it('returns true for recording tab', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(true);
    });

    it('returns true for pre-navigation tab', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'START_PRE_NAV');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(true);
    });

    it('returns false for stopping tab', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');
      sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(false);
    });
  });

  describe('getRecordingTabs', () => {
    it('returns empty array when no tabs are recording', () => {
      expect(sm.getRecordingTabs()).toEqual([]);
    });

    it('returns tab IDs of recording tabs', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');

      sm.tryTransition(TAB_ID_SECONDARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_SECONDARY, 'START_PRE_NAV');

      sm.getTabState(TAB_ID_TERTIARY);

      const recordingTabs = sm.getRecordingTabs();
      expect(recordingTabs).toContain(TAB_ID_PRIMARY);
      expect(recordingTabs).toContain(TAB_ID_SECONDARY);
      expect(recordingTabs).not.toContain(TAB_ID_TERTIARY);
      expect(recordingTabs).toHaveLength(2);
    });
  });

  describe('cleanupTab', () => {
    it('removes tab state entirely', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.tabStates.has(TAB_ID_PRIMARY)).toBe(true);

      sm.cleanupTab(TAB_ID_PRIMARY);
      expect(sm.tabStates.has(TAB_ID_PRIMARY)).toBe(false);
    });

    it('does not affect other tabs', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_SECONDARY, 'START_RECORDING');

      sm.cleanupTab(TAB_ID_PRIMARY);

      expect(sm.tabStates.has(TAB_ID_PRIMARY)).toBe(false);
      expect(sm.tabStates.has(TAB_ID_SECONDARY)).toBe(true);
    });

    it('handles cleanup of non-existent tab gracefully', () => {
      expect(() => sm.cleanupTab(999)).not.toThrow();
    });
  });

  describe('multiple tabs with independent states', () => {
    it('supports concurrent recordings on different tabs', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');

      sm.tryTransition(TAB_ID_SECONDARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_SECONDARY, 'START_PRE_NAV');

      sm.tryTransition(TAB_ID_TERTIARY, 'START_RECORDING');

      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.RECORDING);
      expect(sm.getTabState(TAB_ID_SECONDARY).state).toBe(RecordingStates.PRE_NAVIGATION);
      expect(sm.getTabState(TAB_ID_TERTIARY).state).toBe(RecordingStates.STARTING);
    });

    it('stopping one tab does not affect others', () => {
      sm.tryTransition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_READY');

      sm.tryTransition(TAB_ID_SECONDARY, 'START_RECORDING');
      sm.tryTransition(TAB_ID_SECONDARY, 'RECORDING_READY');

      sm.tryTransition(TAB_ID_PRIMARY, 'STOP_RECORDING');
      sm.tryTransition(TAB_ID_PRIMARY, 'RECORDING_STOPPED');

      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      expect(sm.getTabState(TAB_ID_SECONDARY).state).toBe(RecordingStates.RECORDING);
    });
  });
});
