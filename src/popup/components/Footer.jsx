import React, { useRef } from 'react';
import { Button, Space, App, Typography } from 'antd';
import {
  ExportOutlined,
  ImportOutlined,
  QuestionCircleOutlined,
  GithubOutlined
} from '@ant-design/icons';
import { storage, runtime, isFirefox } from '../../utils/browser-api';

const { Text } = Typography;

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

/**
 * Professional footer component with labeled actions and version info
 */
const Footer = () => {
  const { message } = App.useApp();
  const fileInputRef = useRef(null);

  // Version information
  const version = '2.0.0';

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
      const filename = `open-headers-config-${timestamp}.json`;

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
  const handleImportClick = async () => {
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
  const handleOpenWelcomePage = async () => {
    const response = await sendMessageSafely({ type: 'forceOpenWelcomePage' });
    if (!response.error) {
      window.close();
    }
  };

  // Handle opening GitHub page
  const handleOpenGitHub = async () => {
    const response = await sendMessageSafely({
      type: 'openTab',
      url: 'https://github.com/OpenHeaders/open-headers-browser-extension'
    });
    if (!response.error) {
      window.close();
    }
  };

  return (
      <div className="footer">
        <div>
          <Space size={12}>
            <Button
                type="text"
                icon={<ExportOutlined />}
                onClick={handleExport}
                size="small"
            >
              Export rules
            </Button>

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

            <Button
                type="text"
                icon={<ImportOutlined />}
                size="small"
                onClick={handleImportClick}
            >
              Import rules
            </Button>

            <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                onClick={handleOpenWelcomePage}
                size="small"
            >
              Setup Guide
            </Button>
          </Space>
        </div>

        <div>
          <Space size={8} align="center">
            <Text style={{ fontSize: '11px', color: '#8c8c8c' }}>v{version}</Text>
            <Button
                type="text"
                icon={<GithubOutlined />}
                onClick={handleOpenGitHub}
                size="small"
                style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
            />
          </Space>
        </div>
      </div>
  );
};

export default Footer;