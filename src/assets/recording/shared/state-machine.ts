/**
 * Recording State Machine — pure state container.
 *
 * Owns ONLY state transitions and validity checks.
 * Has NO side effects (no tab messaging, no I/O).
 * The RecordingService is responsible for acting on state changes.
 */

import { logger } from '../../../utils/logger';
import type { RecordingState } from './recording-state';

export const RecordingStates = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  PRE_NAVIGATION: 'pre_navigation',
  STOPPING: 'stopping',
  ERROR: 'error'
} as const;

export type RecordingStateValue = typeof RecordingStates[keyof typeof RecordingStates];

export type TransitionEvent = 'START_RECORDING' | 'RECORDING_READY' | 'START_PRE_NAV' |
  'NAVIGATION_COMMITTED' | 'STOP_RECORDING' | 'RECORDING_STOPPED' | 'ERROR' | 'RESET';

interface Transition {
  from: RecordingStateValue[];
  to: RecordingStateValue;
  event: TransitionEvent;
}

interface TabState {
  state: RecordingStateValue;
  recording: RecordingState | null;
  initializationToken: string | null;
  lastError: string | null;
  startTime: number;
}

export class RecordingStateMachine {
  tabStates: Map<number, TabState>;
  private transitions: Transition[];

  constructor() {
    this.tabStates = new Map();

    this.transitions = [
      { from: [RecordingStates.IDLE], to: RecordingStates.STARTING, event: 'START_RECORDING' },
      { from: [RecordingStates.STARTING], to: RecordingStates.RECORDING, event: 'RECORDING_READY' },
      { from: [RecordingStates.STARTING], to: RecordingStates.PRE_NAVIGATION, event: 'START_PRE_NAV' },
      { from: [RecordingStates.PRE_NAVIGATION], to: RecordingStates.RECORDING, event: 'NAVIGATION_COMMITTED' },
      { from: [RecordingStates.RECORDING, RecordingStates.PRE_NAVIGATION], to: RecordingStates.STOPPING, event: 'STOP_RECORDING' },
      { from: [RecordingStates.STOPPING], to: RecordingStates.IDLE, event: 'RECORDING_STOPPED' },
      { from: [RecordingStates.STARTING, RecordingStates.RECORDING, RecordingStates.STOPPING], to: RecordingStates.ERROR, event: 'ERROR' },
      { from: [RecordingStates.ERROR], to: RecordingStates.IDLE, event: 'RESET' }
    ];
  }

  getTabState(tabId: number): TabState {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        state: RecordingStates.IDLE,
        recording: null,
        initializationToken: null,
        lastError: null,
        startTime: 0
      });
    }
    return this.tabStates.get(tabId)!;
  }

  /**
   * Atomic transition: checks validity and transitions in one call.
   * Returns the new state value on success, or null if the transition is invalid.
   */
  tryTransition(tabId: number, event: TransitionEvent, data?: { error?: string } | null): RecordingStateValue | null {
    const currentState = this.getTabState(tabId);
    const transition = this.transitions.find(t =>
      t.event === event && t.from.includes(currentState.state)
    );

    if (!transition) {
      logger.warn('StateMachine', `Invalid transition: ${currentState.state} -> ${event} (tab ${tabId})`);
      return null;
    }

    const previousState = currentState.state;
    currentState.state = transition.to;

    logger.debug('StateMachine', `Tab ${tabId}: ${previousState} -> ${transition.to} (${event})`);

    switch (transition.to) {
      case RecordingStates.STARTING:
        currentState.startTime = Date.now();
        currentState.initializationToken = this.generateToken();
        break;

      case RecordingStates.ERROR:
        currentState.lastError = data?.error || 'Unknown error';
        break;

      case RecordingStates.IDLE:
        currentState.recording = null;
        currentState.initializationToken = null;
        currentState.lastError = null;
        break;
    }

    return transition.to;
  }

  setRecording(tabId: number, recording: RecordingState): void {
    const state = this.getTabState(tabId);
    state.recording = recording;
  }

  private generateToken(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  isRecording(tabId: number): boolean {
    const state = this.getTabState(tabId).state;
    return state === RecordingStates.RECORDING || state === RecordingStates.PRE_NAVIGATION;
  }

  getRecordingTabs(): number[] {
    const recordingTabs: number[] = [];
    for (const [tabId, state] of this.tabStates) {
      if (state.state === RecordingStates.RECORDING ||
          state.state === RecordingStates.PRE_NAVIGATION) {
        recordingTabs.push(tabId);
      }
    }
    return recordingTabs;
  }

  cleanupTab(tabId: number): void {
    this.tabStates.delete(tabId);
  }
}
