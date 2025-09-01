// Pre-navigation recording utilities
// Allows starting recording on a new tab before navigating to capture all initial requests

import { MESSAGE_TYPES } from '../../assets/recording/shared/constants.js';

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

export async function startRecordingNewTab(url) {
  try {
    // Create a new tab with about:blank first
    const tab = await browserAPI.tabs.create({ 
      url: 'about:blank',
      active: true 
    });
    
    // Generate record ID
    const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Send message to background to mark this tab for recording
    const response = await browserAPI.runtime.sendMessage({
      action: 'START_PRE_NAV_RECORDING',
      tabId: tab.id,
      recordId: recordId,
      targetUrl: url
    });
    
    // Check if recording started successfully
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to start recording');
    }
    
    // Wait a bit for recording to initialize before navigating
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Navigate to the target URL
    console.log('[RecordingPreNav] Navigating to URL:', url);
    await browserAPI.tabs.update(tab.id, { url: url });
    
    return { 
      success: true, 
      tabId: tab.id,
      recordId: recordId 
    };
  } catch (error) {
    console.error('Failed to start pre-navigation recording:', error);
    throw error;
  }
}

export async function startRecordingCurrentTabWithReload() {
  try {
    // Get current tab
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found');
    
    // Generate record ID
    const recordId = `record-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Send message to background to mark this tab for recording
    const response = await browserAPI.runtime.sendMessage({
      action: 'START_PRE_NAV_RECORDING',
      tabId: tab.id,
      recordId: recordId,
      targetUrl: tab.url
    });
    
    // Check if recording started successfully
    if (!response || !response.success) {
      throw new Error(response?.error || 'Failed to start recording');
    }
    
    // Wait a bit for recording to initialize before reloading
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Reload the tab to capture all requests from the beginning
    await browserAPI.tabs.reload(tab.id, { bypassCache: true });
    
    return { 
      success: true, 
      tabId: tab.id,
      recordId: recordId 
    };
  } catch (error) {
    console.error('Failed to start recording with reload:', error);
    throw error;
  }
}