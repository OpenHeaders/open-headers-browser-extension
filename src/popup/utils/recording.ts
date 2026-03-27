// Simple recording utilities that work directly from popup
import { MESSAGE_TYPES } from '../../assets/recording/shared/constants';

declare const browser: typeof chrome | undefined;

// Use the browser API wrapper to ensure cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

interface StartRecordingResult {
  success: boolean;
  recordId: string;
  preNavigation?: boolean;
}

interface RecordingStateResult {
  isRecording: boolean;
  [key: string]: unknown;
}

export async function startRecording(useWidget = false): Promise<StartRecordingResult> {
  // Get active tab with retry logic for transient errors
  let tab: chrome.tabs.Tab | undefined;
  let retries = 3;

  while (retries > 0) {
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      tab = tabs[0];
      if (tab) break;
    } catch (e) {
      if ((e as Error).message.includes('Tabs cannot be edited right now')) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries--;
      } else {
        throw e;
      }
    }
  }

  if (!tab) throw new Error('No active tab found');

  // Check if we're on a restricted page
  const restrictedUrls = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file:///',
    'view-source:',
    'data:',
    'blob:',
    'chrome-devtools://',
    'https://ntp.msn.com/edge/ntp'
  ];

  const isRestrictedPage = !tab.url || tab.url === '' ||
    restrictedUrls.some(prefix => tab!.url!.startsWith(prefix));

  if (isRestrictedPage) {
    const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await browserAPI.runtime.sendMessage({
      action: 'START_PRE_NAV_RECORDING',
      tabId: tab.id,
      recordId: recordId,
      targetUrl: null,
      useWidget: useWidget
    });

    return { success: true, recordId, preNavigation: true };
  }

  const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Single authority: background owns all start transitions.
  // It will inject the content script and notify it as part of its start flow.
  try {
    await browserAPI.runtime.sendMessage({
      type: MESSAGE_TYPES.START_RECORDING,
      tabId: tab.id,
      recordId: recordId,
      useWidget: useWidget
    });
  } catch (e) {
    throw new Error('Failed to start workflow in background');
  }

  return { success: true, recordId };
}

export async function stopRecording(): Promise<{ success: boolean }> {
  const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (!tab) throw new Error('No active tab found');

  // Single authority: background owns all stop transitions.
  // It will notify the content script as part of its stop flow.
  await browserAPI.runtime.sendMessage({
    type: 'STOP_RECORDING',
    tabId: tab.id
  });

  return { success: true };
}

export async function getRecordingState(): Promise<RecordingStateResult> {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { isRecording: false };

    try {
      const response = await browserAPI.runtime.sendMessage({
        action: 'GET_TAB_RECORDING_STATE',
        tabId: tab.id
      });

      console.log(new Date().toISOString(), 'INFO ', '[Recording]', '[Recording] Background state response:', response);

      if (response && (response as RecordingStateResult).isRecording) {
        return response as RecordingStateResult;
      }
    } catch (e) {
      console.log(new Date().toISOString(), 'INFO ', '[Recording]', '[Recording] Background state check failed:', e);
    }

    try {
      const response = await browserAPI.tabs.sendMessage(tab.id!, {
        type: MESSAGE_TYPES.GET_RECORDING_STATE
      });
      console.log(new Date().toISOString(), 'INFO ', '[Recording]', '[Recording] Content script state response:', response);
      return (response as RecordingStateResult) || { isRecording: false };
    } catch (e) {
      console.log(new Date().toISOString(), 'INFO ', '[Recording]', '[Recording] Content script state check failed:', e);
      return { isRecording: false };
    }
  } catch (error) {
    console.log(new Date().toISOString(), 'INFO ', '[Recording]', '[Recording] getRecordingState error:', error);
    return { isRecording: false };
  }
}
