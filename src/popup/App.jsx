import React, { useEffect, useRef } from 'react';
import { Layout, App as AntApp } from 'antd';
import { HeaderProvider } from '../context/HeaderContext';
import { useTheme } from '../context/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import Header from './components/Header';
import HeaderForm from './components/HeaderForm';
import HeaderList from './components/HeaderList';
import Footer from './components/Footer';
import ConnectionInfo from './components/ConnectionInfo';
import { runtime, storage, isFirefox } from '../utils/browser-api';

const { Content } = Layout;

/**
 * Main App component for the popup
 */
// Helper function for safe message sending
const sendMessageSafely = (message) => {
  return new Promise((resolve) => {
    runtime.sendMessage(message, (response) => {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      if (browserAPI.runtime.lastError) {
        console.log(`Info: Message '${message.type}' failed:`, browserAPI.runtime.lastError.message);
        resolve({ error: browserAPI.runtime.lastError.message });
      } else {
        resolve(response || {});
      }
    });
  });
};

const AppContent = () => {
  const { message } = AntApp.useApp();
  const { isDarkMode } = useTheme();
  const fileInputRef = useRef(null);
  // Notify background script when popup opens/closes
  useEffect(() => {
    console.log('Popup: Establishing connection to background script');

    // Create a connection port to notify background when popup is open
    let port = null;

    try {
      // Use the browser API wrapper
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      port = browserAPI.runtime.connect({ name: 'popup' });

      // Handle disconnect events
      port.onDisconnect.addListener(() => {
        if (browserAPI.runtime.lastError) {
          console.log('Popup: Port disconnected:', browserAPI.runtime.lastError.message);
        }
      });

      // Also send the popupOpen message with error handling
      runtime.sendMessage({ type: 'popupOpen' }, (response) => {
        // Check for errors
        if (browserAPI.runtime.lastError) {
          // This is expected if background script is still initializing
          console.log('Popup: Background script not ready yet:', browserAPI.runtime.lastError.message);
        } else if (response) {
          console.log('Popup: Received response from background');
        }
      });
    } catch (error) {
      console.log('Popup: Error connecting to background:', error.message);
    }

    // Cleanup function - this runs when popup closes
    return () => {
      console.log('Popup: Closing, disconnecting from background');
      if (port) {
        try {
          port.disconnect();
        } catch (error) {
          // Ignore disconnect errors
        }
      }
    };
  }, []);

  // Handle export configuration
  const handleExport = async () => {
    try {
      // Get data from storage
      const getDataPromise = new Promise((resolve) => {
        storage.sync.get(['savedData'], (syncData) => {
          storage.local.get(['dynamicSources'], (localData) => {
            resolve({
              savedData: syncData.savedData || {},
              dynamicSources: localData.dynamicSources || []
            });
          });
        });
      });

      const data = await getDataPromise;

      // Calculate stats
      const ruleCount = Object.keys(data.savedData).length;
      const sourceCount = data.dynamicSources.length;

      // Format timestamp for filename
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `open-headers_rules_${timestamp}.json`;

      // Create a blob
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const fileSize = (blob.size / 1024).toFixed(1) + ' KB';

      // For Firefox, show export success page
      if (isFirefox) {
        // First download the file
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        // Then open the export success page
        const exportUrl = runtime.getURL(`export.html?filename=${encodeURIComponent(filename)}&rules=${ruleCount}&sources=${sourceCount}&size=${encodeURIComponent(fileSize)}`);
        const response = await sendMessageSafely({
          type: 'openTab',
          url: exportUrl
        });

        if (!response.error) {
          window.close();
        }
      } else {
        // Chrome/Edge - just download as before
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        message.success('Configuration exported successfully');
      }
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export configuration');
    }
  };

  // Handle import for Chrome/Edge
  const handleImportChrome = async (file) => {
    try {
      const hide = message.loading('Importing configuration...', 0);

      // Read file content
      const fileContent = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      // Parse the configuration
      let config;
      try {
        config = JSON.parse(fileContent);
      } catch (parseError) {
        console.error('Parse error:', parseError);
        hide();
        message.error('Failed to parse configuration file');
        return;
      }

      if (!config.savedData) {
        hide();
        message.error('Invalid configuration file: savedData missing');
        return;
      }

      // Send to background script
      const response = await sendMessageSafely({
        type: 'importConfiguration',
        config: config
      });

      hide();

      if (response.error) {
        message.error('Failed to import: ' + response.error);
      } else if (response.success) {
        message.success('Configuration imported successfully');
      } else {
        message.error('Import failed');
      }

    } catch (error) {
      console.error('Import error:', error);
      message.error('Failed to import configuration');
    }
  };

  // Handle import button click
  const handleImport = async () => {
    if (isFirefox) {
      // For Firefox, open a dedicated import page
      const response = await sendMessageSafely({
        type: 'openTab',
        url: runtime.getURL('import.html')
      });

      if (!response.error) {
        // Close the popup after opening the import page
        window.close();
      } else {
        message.error('Failed to open import page');
      }
    } else {
      // For Chrome/Edge, use the file input
      fileInputRef.current?.click();
    }
  };

  // Handle file input change (Chrome/Edge only)
  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImportChrome(file);
      // Reset the input
      e.target.value = '';
    }
  };

  // Handle opening the welcome page
  const handleOpenSetupGuide = async () => {
    const response = await sendMessageSafely({ type: 'forceOpenWelcomePage' });
    if (!response.error) {
      window.close();
    }
  };

  return (
      <ErrorBoundary>
        <HeaderProvider>
          <Layout className="app-container" data-theme={isDarkMode ? 'dark' : 'light'}>
            <Header 
              onExport={handleExport}
              onImport={handleImport}
              onOpenSetupGuide={handleOpenSetupGuide}
            />
            
            {/* Hidden file input for Chrome/Edge */}
            {!isFirefox && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    style={{ display: 'none' }}
                    onChange={handleFileInputChange}
                />
            )}

            <Content className="content">
              <div className="form-container">
                <HeaderForm />
              </div>

              <ConnectionInfo />

              <div className="entries-list">
                <HeaderList />
              </div>
            </Content>

            <Footer />
          </Layout>
        </HeaderProvider>
      </ErrorBoundary>
  );
};

export default AppContent;