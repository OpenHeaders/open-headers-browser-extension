/**
 * Message Adapter Layer
 * Translates between existing UI message format and new core recording logic
 */

import { MESSAGE_TYPES } from './constants.js';

// New message types from recording-extension
export const NewMessageTypes = {
  START_RECORDING: 'START_RECORDING',
  STOP_RECORDING: 'STOP_RECORDING',
  GET_RECORDING_STATE: 'GET_RECORDING_STATE',
  QUERY_RECORDING_STATE: 'QUERY_RECORDING_STATE',
  RECORDING_STATE_CHANGED: 'RECORDING_STATE_CHANGED',
  CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
  RECORDING_DATA: 'RECORDING_DATA'
};

/**
 * Adapts existing UI messages to new core format
 */
export function adaptUIMessage(message) {
  // Map existing message types to new format
  switch (message.type) {
    case MESSAGE_TYPES.START_RECORDING:
      return {
        type: NewMessageTypes.START_RECORDING,
        payload: {
          tabId: message.tabId,
          useWidget: message.useWidget
        }
      };
      
    case MESSAGE_TYPES.STOP_RECORDING:
      return {
        type: NewMessageTypes.STOP_RECORDING,
        payload: {
          tabId: message.tabId
        }
      };
      
    case MESSAGE_TYPES.CHECK_RECORDING_STATUS:
      return {
        type: NewMessageTypes.GET_RECORDING_STATE,
        payload: {
          tabId: message.tabId
        }
      };
      
    case MESSAGE_TYPES.UPDATE_RECORDING_WIDGET:
      // Widget updates handled differently in new system
      return null;
      
    default:
      return message;
  }
}

/**
 * Adapts new core responses to existing UI format
 */
export function adaptCoreResponse(response, originalMessageType) {
  switch (originalMessageType) {
    case MESSAGE_TYPES.START_RECORDING:
      return {
        success: response.success,
        recordId: response.recording?.id,
        isPreNav: response.recording?.status === 'pre_navigation'
      };
      
    case MESSAGE_TYPES.STOP_RECORDING:
      return {
        success: response.success,
        recording: response.recording
      };
      
    case MESSAGE_TYPES.CHECK_RECORDING_STATUS:
      return {
        isRecording: response.isRecording,
        recordId: response.recordingId
      };
      
    default:
      return response;
  }
}

/**
 * Adapts recording data from new format to existing format
 */
export function adaptRecordingData(newRecording) {
  if (!newRecording) return null;
  
  // Convert from new format to existing format
  const adaptedRecording = {
    recordId: newRecording.id,
    tabId: newRecording.tabId,
    startTime: newRecording.startTime,
    endTime: newRecording.endTime,
    status: newRecording.status,
    url: newRecording.url,
    title: newRecording.title,
    
    // Separate events by type for existing viewer compatibility
    events: [],
    console: [],
    network: [],
    storage: [],
    navigationHistory: [],
    
    // Additional metadata
    flowType: newRecording.status === 'pre_navigation' ? 'pre-nav' : 'nav',
    duration: newRecording.endTime ? newRecording.endTime - newRecording.startTime : 0
  };
  
  // Separate events by type
  if (newRecording.events) {
    for (const event of newRecording.events) {
      switch (event.type) {
        case 'rrweb':
          adaptedRecording.events.push(event.data);
          break;
          
        case 'console':
          adaptedRecording.console.push({
            timestamp: event.timestamp,
            ...event.data
          });
          break;
          
        case 'network':
          adaptedRecording.network.push({
            timestamp: event.timestamp,
            ...event.data
          });
          break;
          
        case 'storage':
          adaptedRecording.storage.push({
            timestamp: event.timestamp,
            ...event.data
          });
          break;
          
        case 'navigation':
          adaptedRecording.navigationHistory.push({
            url: event.url,
            timestamp: event.timestamp,
            ...event.data
          });
          break;
      }
    }
  }
  
  return adaptedRecording;
}

/**
 * Converts events from injected script to new format
 */
export function adaptInjectedEvent(event) {
  return {
    type: NewMessageTypes.RECORDING_DATA,
    payload: {
      type: event.type,
      data: event.data,
      timestamp: event.timestamp || Date.now(),
      url: window.location.href
    }
  };
}