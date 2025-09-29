/**
 * Recording State Machine
 * Adapted from .recording-extension for compatibility with existing UI
 */

export const RecordingStates = {
  IDLE: 'idle',
  STARTING: 'starting',
  RECORDING: 'recording',
  PRE_NAVIGATION: 'pre_navigation',
  STOPPING: 'stopping',
  ERROR: 'error'
};

export class RecordingStateMachine {
  constructor() {
    this.tabStates = new Map();
    
    this.transitions = [
      // Starting recording
      { from: [RecordingStates.IDLE], to: RecordingStates.STARTING, event: 'START_RECORDING' },
      { from: [RecordingStates.STARTING], to: RecordingStates.RECORDING, event: 'RECORDING_READY' },
      { from: [RecordingStates.STARTING], to: RecordingStates.PRE_NAVIGATION, event: 'START_PRE_NAV' },
      
      // Navigation
      { from: [RecordingStates.PRE_NAVIGATION], to: RecordingStates.RECORDING, event: 'NAVIGATION_COMMITTED' },
      
      // Stopping
      { from: [RecordingStates.RECORDING, RecordingStates.PRE_NAVIGATION], to: RecordingStates.STOPPING, event: 'STOP_RECORDING' },
      { from: [RecordingStates.STOPPING], to: RecordingStates.IDLE, event: 'RECORDING_STOPPED' },
      
      // Error handling
      { from: [RecordingStates.STARTING, RecordingStates.RECORDING, RecordingStates.STOPPING], to: RecordingStates.ERROR, event: 'ERROR' },
      { from: [RecordingStates.ERROR], to: RecordingStates.IDLE, event: 'RESET' }
    ];
  }
  
  getTabState(tabId) {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        state: RecordingStates.IDLE,
        recording: null,
        initializationToken: null,
        lastError: null,
        startTime: 0
      });
    }
    return this.tabStates.get(tabId);
  }
  
  canTransition(tabId, event) {
    const currentState = this.getTabState(tabId).state;
    return this.transitions.some(t => 
      t.event === event && t.from.includes(currentState)
    );
  }
  
  transition(tabId, event, data = null) {
    const currentState = this.getTabState(tabId);
    const transition = this.transitions.find(t => 
      t.event === event && t.from.includes(currentState.state)
    );
    
    if (!transition) {
      console.warn(`[StateMachine] Invalid transition: ${currentState.state} -> ${event}`);
      return false;
    }
    
    console.log(`[StateMachine] Tab ${tabId}: ${currentState.state} -> ${transition.to} (${event})`);
    
    // Update state
    currentState.state = transition.to;
    
    // Handle state-specific logic
    switch (transition.to) {
      case RecordingStates.STARTING:
        currentState.startTime = Date.now();
        currentState.initializationToken = this.generateToken();
        break;
        
      case RecordingStates.ERROR:
        currentState.lastError = data?.error || 'Unknown error';
        break;
        
      case RecordingStates.IDLE:
        // Clean up
        currentState.recording = null;
        currentState.initializationToken = null;
        currentState.lastError = null;
        break;
    }
    
    // Notify tab of state change (compatible with existing widget)
    this.notifyTab(tabId, currentState);
    
    return true;
  }
  
  setRecording(tabId, recording) {
    const state = this.getTabState(tabId);
    state.recording = recording;
  }
  
  generateToken() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  async notifyTab(tabId, state) {
    // Skip notification for pre-navigation state (no content script on chrome:// pages)
    if (state.state === RecordingStates.PRE_NAVIGATION) {
      return;
    }
    
    try {
      // Send message compatible with existing widget
      await chrome.tabs.sendMessage(tabId, {
        type: 'RECORDING_STATE_CHANGED',
        action: 'recordingStateChanged',
        data: {
          state: state.state,
          isRecording: state.state === RecordingStates.RECORDING || state.state === RecordingStates.PRE_NAVIGATION,
          isPreNav: state.state === RecordingStates.PRE_NAVIGATION,
          recordingId: state.recording?.recordId,
          // Use actualStartTime if available (for pre-nav recordings that transitioned)
          startTime: state.recording?.actualStartTime || state.recording?.startTime
        }
      });
    } catch (error) {
      // Tab might not have content script yet, this is fine for new tabs
      // Also silently ignore if tab was closed or connection errors
      if (!error.message?.includes('tab') && 
          !error.message?.includes('context') &&
          !error.message?.includes('receiving end does not exist') &&
          !error.message?.includes('Could not establish connection')) {
        console.log(`[StateMachine] Could not notify tab ${tabId}:`, error.message);
      }
    }
  }
  
  isRecording(tabId) {
    const state = this.getTabState(tabId).state;
    return state === RecordingStates.RECORDING || state === RecordingStates.PRE_NAVIGATION;
  }
  
  getRecordingTabs() {
    const tabs = [];
    for (const [tabId, state] of this.tabStates) {
      if (state.state === RecordingStates.RECORDING || 
          state.state === RecordingStates.PRE_NAVIGATION) {
        tabs.push(tabId);
      }
    }
    return tabs;
  }
  
  cleanupTab(tabId) {
    this.tabStates.delete(tabId);
  }
}