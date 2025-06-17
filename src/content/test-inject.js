// Simple test content script
console.log('[Open Headers Test] Content script injected successfully!');
console.log('[Open Headers Test] Current URL:', window.location.href);
console.log('[Open Headers Test] Document ready state:', document.readyState);

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Open Headers Test] Received message:', request);
  sendResponse({ received: true, message: 'Test content script received your message!' });
  return true;
});