/**
 * Message Adapter Layer
 * Translates between existing UI message format and new core recording logic
 */

import { MESSAGE_TYPES } from './constants';

// New message types from recording-extension
export const NewMessageTypes = {
  START_RECORDING: 'START_RECORDING',
  STOP_RECORDING: 'STOP_RECORDING',
  GET_RECORDING_STATE: 'GET_RECORDING_STATE',
  QUERY_RECORDING_STATE: 'QUERY_RECORDING_STATE',
  RECORDING_STATE_CHANGED: 'RECORDING_STATE_CHANGED',
  CONTENT_SCRIPT_READY: 'CONTENT_SCRIPT_READY',
  RECORDING_DATA: 'RECORDING_DATA'
} as const;

interface UIMessage {
  type: string;
  tabId?: number;
  useWidget?: boolean;
  [key: string]: unknown;
}

interface AdaptedMessage {
  type: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

interface RecordingInfo {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

interface CoreResponse {
  success?: boolean;
  recording?: RecordingInfo;
  isRecording?: boolean;
  recordingId?: string;
  [key: string]: unknown;
}

interface AdaptedRecordingEvent {
  type: string;
  timestamp: number;
  url?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AdaptedRecording {
  recordId: string;
  tabId?: number;
  startTime: number;
  endTime?: number;
  status?: string;
  url?: string;
  title?: string;
  events: unknown[];
  console: Array<Record<string, unknown>>;
  network: Array<Record<string, unknown>>;
  storage: Array<Record<string, unknown>>;
  navigationHistory: Array<Record<string, unknown>>;
  flowType: string;
  duration: number;
}

interface NewRecording {
  id: string;
  tabId?: number;
  startTime: number;
  endTime?: number;
  status?: string;
  url?: string;
  title?: string;
  events?: AdaptedRecordingEvent[];
  [key: string]: unknown;
}

/**
 * Adapts existing UI messages to new core format
 */
export function adaptUIMessage(message: UIMessage): AdaptedMessage | null {
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
      return null;

    default:
      return message;
  }
}

/**
 * Adapts new core responses to existing UI format
 */
export function adaptCoreResponse(response: CoreResponse, originalMessageType: string): Record<string, unknown> {
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
export function adaptRecordingData(newRecording: NewRecording | null): AdaptedRecording | null {
  if (!newRecording) return null;

  const adaptedRecording: AdaptedRecording = {
    recordId: newRecording.id,
    tabId: newRecording.tabId,
    startTime: newRecording.startTime,
    endTime: newRecording.endTime,
    status: newRecording.status,
    url: newRecording.url,
    title: newRecording.title,
    events: [],
    console: [],
    network: [],
    storage: [],
    navigationHistory: [],
    flowType: newRecording.status === 'pre_navigation' ? 'pre-nav' : 'nav',
    duration: newRecording.endTime ? newRecording.endTime - newRecording.startTime : 0
  };

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

interface InjectedEvent {
  type: string;
  data: unknown;
  timestamp?: number;
}

/**
 * Converts events from injected script to new format
 */
export function adaptInjectedEvent(event: InjectedEvent): AdaptedMessage {
  return {
    type: NewMessageTypes.RECORDING_DATA,
    payload: {
      type: event.type,
      data: event.data as Record<string, unknown>,
      timestamp: event.timestamp || Date.now(),
      url: window.location.href
    }
  };
}
