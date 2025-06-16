// Simple recording utilities that work directly from popup
import { MESSAGE_TYPES } from '../../assets/recording/shared/constants.js';

// Use the browser API wrapper to ensure cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

export async function startRecording() {
  try {
    // Get active tab with retry logic for transient errors
    let tab;
    let retries = 3;
    
    while (retries > 0) {
      try {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        tab = tabs[0];
        if (tab) break;
      } catch (e) {
        if (e.message.includes('Tabs cannot be edited right now')) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries--;
        } else {
          throw e;
        }
      }
    }
    
    if (!tab) throw new Error('No active tab found');
    
    
    // Generate record ID
    const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inject the content script
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/content/record-recorder/index.js']
      });
    } catch (e) {
    }
    
    // Wait a moment for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Send start recording message directly to the tab
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.START_RECORDING,
        recordId: recordId
      });
      return { success: true, recordId };
    } catch (e) {
      // Check for Chrome runtime errors
      if (browserAPI.runtime.lastError) {
      }
      throw e;
    }
  } catch (error) {
    throw error;
  }
}

export async function stopRecording() {
  try {
    // Get active tab
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    
    
    // Send stop message to content script
    const response = await browserAPI.tabs.sendMessage(tab.id, {
      type: MESSAGE_TYPES.STOP_RECORDING
    });
    
    return { success: true };
  } catch (error) {
    throw error;
  }
}

export async function getRecordingState() {
  try {
    // Get active tab
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { isRecording: false };
    
    // Try to get state from content script
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.GET_RECORDING_STATE
      });
      return response || { isRecording: false };
    } catch (e) {
      // No content script loaded
      return { isRecording: false };
    }
  } catch (error) {
    return { isRecording: false };
  }
}