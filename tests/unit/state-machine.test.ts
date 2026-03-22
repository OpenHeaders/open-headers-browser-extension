import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingStateMachine, RecordingStates } from '../../src/assets/recording/shared/state-machine';
import type { RecordingStateValue } from '../../src/assets/recording/shared/state-machine';
import { RecordingState } from '../../src/assets/recording/shared/recording-state';

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
    // Suppress console.warn and console.log from state machine
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
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
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');

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

  describe('canTransition', () => {
    it('allows IDLE -> STARTING via START_RECORDING', () => {
      expect(sm.canTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(true);
    });

    it('allows STARTING -> RECORDING via RECORDING_READY', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'RECORDING_READY')).toBe(true);
    });

    it('allows STARTING -> PRE_NAVIGATION via START_PRE_NAV', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'START_PRE_NAV')).toBe(true);
    });

    it('allows PRE_NAVIGATION -> RECORDING via NAVIGATION_COMMITTED', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'START_PRE_NAV');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'NAVIGATION_COMMITTED')).toBe(true);
    });

    it('allows RECORDING -> STOPPING via STOP_RECORDING', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(true);
    });

    it('allows PRE_NAVIGATION -> STOPPING via STOP_RECORDING', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'START_PRE_NAV');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(true);
    });

    it('allows STOPPING -> IDLE via RECORDING_STOPPED', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
      sm.transition(TAB_ID_PRIMARY, 'STOP_RECORDING');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'RECORDING_STOPPED')).toBe(true);
    });

    it('allows ERROR -> IDLE via RESET', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'ERROR');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'RESET')).toBe(true);
    });

    it('rejects invalid transitions', () => {
      // IDLE cannot receive RECORDING_READY
      expect(sm.canTransition(TAB_ID_PRIMARY, 'RECORDING_READY')).toBe(false);
      // IDLE cannot receive STOP_RECORDING
      expect(sm.canTransition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(false);
      // IDLE cannot receive NAVIGATION_COMMITTED
      expect(sm.canTransition(TAB_ID_PRIMARY, 'NAVIGATION_COMMITTED')).toBe(false);
    });

    it('rejects RECORDING -> START_RECORDING (already recording)', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(sm.canTransition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(false);
    });
  });

  describe('transition', () => {
    it('performs valid IDLE -> STARTING transition', () => {
      const result = sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');

      expect(result).toBe(true);
      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.STARTING);
    });

    it('sets startTime and initializationToken on STARTING', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1700000050000);
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');

      const state = sm.getTabState(TAB_ID_PRIMARY);
      expect(state.startTime).toBe(1700000050000);
      expect(state.initializationToken).toBeTruthy();
      expect(typeof state.initializationToken).toBe('string');
    });

    it('sets lastError on ERROR transition', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'ERROR', { error: 'Content script injection failed' });

      const state = sm.getTabState(TAB_ID_PRIMARY);
      expect(state.state).toBe(RecordingStates.ERROR);
      expect(state.lastError).toBe('Content script injection failed');
    });

    it('sets default error message when no error provided', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'ERROR');

      expect(sm.getTabState(TAB_ID_PRIMARY).lastError).toBe('Unknown error');
    });

    it('clears state on IDLE transition', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'ERROR', { error: 'test error' });
      sm.transition(TAB_ID_PRIMARY, 'RESET');

      const state = sm.getTabState(TAB_ID_PRIMARY);
      expect(state.state).toBe(RecordingStates.IDLE);
      expect(state.recording).toBeNull();
      expect(state.initializationToken).toBeNull();
      expect(state.lastError).toBeNull();
    });

    it('rejects invalid transition and returns false', () => {
      const result = sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');

      expect(result).toBe(false);
      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
    });

    it('sends notification to tab via chrome.tabs.sendMessage', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
        TAB_ID_PRIMARY,
        expect.objectContaining({
          type: 'RECORDING_STATE_CHANGED',
          action: 'recordingStateChanged',
          data: expect.objectContaining({
            state: RecordingStates.STARTING,
          }),
        }),
      );
    });

    it('does NOT notify tab when transitioning to PRE_NAVIGATION', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      vi.mocked(chrome.tabs.sendMessage).mockClear();

      sm.transition(TAB_ID_PRIMARY, 'START_PRE_NAV');

      // notifyTab returns early for PRE_NAVIGATION
      expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    });

    describe('full lifecycle: idle -> starting -> recording -> stopping -> idle', () => {
      it('completes full recording lifecycle', () => {
        expect(sm.transition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.STARTING);

        expect(sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.RECORDING);

        expect(sm.transition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.STOPPING);

        expect(sm.transition(TAB_ID_PRIMARY, 'RECORDING_STOPPED')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });
    });

    describe('pre-navigation flow: idle -> starting -> pre_nav -> recording -> stopping -> idle', () => {
      it('completes pre-navigation flow', () => {
        expect(sm.transition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(true);
        expect(sm.transition(TAB_ID_PRIMARY, 'START_PRE_NAV')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.PRE_NAVIGATION);

        expect(sm.transition(TAB_ID_PRIMARY, 'NAVIGATION_COMMITTED')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.RECORDING);

        expect(sm.transition(TAB_ID_PRIMARY, 'STOP_RECORDING')).toBe(true);
        expect(sm.transition(TAB_ID_PRIMARY, 'RECORDING_STOPPED')).toBe(true);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });
    });

    describe('error recovery flow', () => {
      it('recovers from error during starting', () => {
        sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.transition(TAB_ID_PRIMARY, 'ERROR', { error: 'Tab closed unexpectedly' });
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.ERROR);

        sm.transition(TAB_ID_PRIMARY, 'RESET');
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);

        // Can start recording again
        expect(sm.transition(TAB_ID_PRIMARY, 'START_RECORDING')).toBe(true);
      });

      it('recovers from error during recording', () => {
        sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
        sm.transition(TAB_ID_PRIMARY, 'ERROR', { error: 'WebSocket disconnected' });

        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.ERROR);
        expect(sm.getTabState(TAB_ID_PRIMARY).lastError).toBe('WebSocket disconnected');

        sm.transition(TAB_ID_PRIMARY, 'RESET');
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });

      it('recovers from error during stopping', () => {
        sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
        sm.transition(TAB_ID_PRIMARY, 'STOP_RECORDING');
        sm.transition(TAB_ID_PRIMARY, 'ERROR', { error: 'Data upload failed' });

        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.ERROR);
        sm.transition(TAB_ID_PRIMARY, 'RESET');
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });

      it('cannot transition to error from IDLE', () => {
        const result = sm.transition(TAB_ID_PRIMARY, 'ERROR');
        expect(result).toBe(false);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      });

      it('cannot transition to error from PRE_NAVIGATION', () => {
        sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
        sm.transition(TAB_ID_PRIMARY, 'START_PRE_NAV');
        const result = sm.transition(TAB_ID_PRIMARY, 'ERROR');
        expect(result).toBe(false);
        expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.PRE_NAVIGATION);
      });
    });
  });

  describe('setRecording', () => {
    it('associates a RecordingState with a tab', () => {
      const recording = makeRecording();
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
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
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(false);
    });

    it('returns true for recording tab', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(true);
    });

    it('returns true for pre-navigation tab', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'START_PRE_NAV');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(true);
    });

    it('returns false for stopping tab', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');
      sm.transition(TAB_ID_PRIMARY, 'STOP_RECORDING');
      expect(sm.isRecording(TAB_ID_PRIMARY)).toBe(false);
    });
  });

  describe('getRecordingTabs', () => {
    it('returns empty array when no tabs are recording', () => {
      expect(sm.getRecordingTabs()).toEqual([]);
    });

    it('returns tab IDs of recording tabs', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');

      sm.transition(TAB_ID_SECONDARY, 'START_RECORDING');
      sm.transition(TAB_ID_SECONDARY, 'START_PRE_NAV');

      // Tertiary is idle
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
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      expect(sm.tabStates.has(TAB_ID_PRIMARY)).toBe(true);

      sm.cleanupTab(TAB_ID_PRIMARY);
      expect(sm.tabStates.has(TAB_ID_PRIMARY)).toBe(false);
    });

    it('does not affect other tabs', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_SECONDARY, 'START_RECORDING');

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
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');

      sm.transition(TAB_ID_SECONDARY, 'START_RECORDING');
      sm.transition(TAB_ID_SECONDARY, 'START_PRE_NAV');

      sm.transition(TAB_ID_TERTIARY, 'START_RECORDING');

      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.RECORDING);
      expect(sm.getTabState(TAB_ID_SECONDARY).state).toBe(RecordingStates.PRE_NAVIGATION);
      expect(sm.getTabState(TAB_ID_TERTIARY).state).toBe(RecordingStates.STARTING);
    });

    it('stopping one tab does not affect others', () => {
      sm.transition(TAB_ID_PRIMARY, 'START_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_READY');

      sm.transition(TAB_ID_SECONDARY, 'START_RECORDING');
      sm.transition(TAB_ID_SECONDARY, 'RECORDING_READY');

      sm.transition(TAB_ID_PRIMARY, 'STOP_RECORDING');
      sm.transition(TAB_ID_PRIMARY, 'RECORDING_STOPPED');

      expect(sm.getTabState(TAB_ID_PRIMARY).state).toBe(RecordingStates.IDLE);
      expect(sm.getTabState(TAB_ID_SECONDARY).state).toBe(RecordingStates.RECORDING);
    });
  });
});
