// Simple recording utilities that work directly from popup
import { MESSAGE_TYPES } from '../../assets/recording/shared/constants.js';

// Use the browser API wrapper to ensure cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

export async function startRecording(useWidget = false) {
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
      'https://ntp.msn.com/edge/ntp' // Edge's new tab page
    ];
    
    const isRestrictedPage = !tab.url || tab.url === '' || 
      restrictedUrls.some(prefix => tab.url.startsWith(prefix));
    
    if (isRestrictedPage) {
      // For new tabs or restricted pages, use pre-navigation recording
      
      // Generate record ID
      const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Send message to background to set up pre-navigation recording
      await browserAPI.runtime.sendMessage({
        action: 'START_PRE_NAV_RECORDING',
        tabId: tab.id,
        recordId: recordId,
        targetUrl: null, // Will record when user navigates
        useWidget: useWidget
      });
      
      return { success: true, recordId, preNavigation: true };
    }
    
    // For normal pages, proceed with regular recording
    
    // Generate record ID
    const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Inject the content script
    try {
      await browserAPI.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['js/content/record-recorder/index.js']
      });
    } catch (e) {
      throw new Error('Cannot inject workflow script on this page');
    }
    
    // Wait a moment for content script to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // First notify background script to start tracking network requests
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
    
    // Then send start recording message to the tab
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.START_RECORDING,
        recordId: recordId,
        useWidget: useWidget
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
    
    // First stop recording via background script
    try {
      await browserAPI.runtime.sendMessage({
        type: 'STOP_RECORDING',
        tabId: tab.id
      });
    } catch (e) {
    }
    
    // Also try to send stop message to content script if it exists
    try {
      await browserAPI.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.STOP_RECORDING
      });
    } catch (e) {
      // Content script might not be loaded, that's ok
    }
    
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
    
    // First check with background script for tab recording state
    try {
      const response = await browserAPI.runtime.sendMessage({
        action: 'GET_TAB_RECORDING_STATE',
        tabId: tab.id
      });
      
      console.log('[Recording] Background state response:', response);
      
      if (response && response.isRecording) {
        return response;
      }
    } catch (e) {
      console.log('[Recording] Background state check failed:', e);
    }
    
    // Fallback: Try to get state from content script
    try {
      const response = await browserAPI.tabs.sendMessage(tab.id, {
        type: MESSAGE_TYPES.GET_RECORDING_STATE
      });
      console.log('[Recording] Content script state response:', response);
      return response || { isRecording: false };
    } catch (e) {
      // No content script loaded
      console.log('[Recording] Content script state check failed:', e);
      return { isRecording: false };
    }
  } catch (error) {
    console.log('[Recording] getRecordingState error:', error);
    return { isRecording: false };
  }
}