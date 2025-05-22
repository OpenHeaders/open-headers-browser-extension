import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import WelcomeApp from './WelcomeApp';
import './styles/welcome.css';

// Create the theme configuration for Ant Design 5
const themeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#4285F4', // Primary blue color like Google
    borderRadius: 4,
    fontFamily: "'SF Pro Text', -apple-system, BlinkMacSystemFont, sans-serif"
  },
};

// Add global body styles
function addGlobalStyles() {
  const body = document.body;
  body.style.margin = '0';
  body.style.padding = '0';
  body.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif';
  body.style.backgroundColor = '#F5F7FA';
  body.style.height = '100vh';
  body.style.overflow = 'hidden';
  body.style.display = 'flex';
  body.style.alignItems = 'center';
  body.style.justifyContent = 'center';
}

// Initialize React app with error handling
document.addEventListener('DOMContentLoaded', function() {
  console.log('Welcome page: DOM loaded, initializing React...');
  
  // Add global styles
  addGlobalStyles();
  
  const container = document.getElementById('root');
  if (!container) {
    console.error('Welcome page: Root element not found!');
    return;
  }
  
  console.log('Welcome page: Root element found, creating React root...');
  
  // Style the root container
  container.style.width = '100%';
  container.style.maxWidth = '780px';
  
  const root = createRoot(container);

  root.render(
    <ConfigProvider theme={themeConfig}>
      <WelcomeApp />
    </ConfigProvider>
  );
  
  console.log('Welcome page: React app rendered');
});

// Fallback in case DOMContentLoaded already fired
if (document.readyState === 'loading') {
  // DOM still loading, event listener will handle it
} else {
  // DOM already loaded
  console.log('Welcome page: DOM already loaded, initializing React immediately...');
  
  // Add global styles
  addGlobalStyles();
  
  const container = document.getElementById('root');
  if (container) {
    // Style the root container
    container.style.width = '100%';
    container.style.maxWidth = '780px';
    
    const root = createRoot(container);
    root.render(
      <ConfigProvider theme={themeConfig}>
        <WelcomeApp />
      </ConfigProvider>
    );
    console.log('Welcome page: React app rendered (immediate)');
  } else {
    console.error('Welcome page: Root element not found in immediate execution!');
  }
}