import React from 'react';
import { Button, Space, Tooltip, Upload, App, Typography } from 'antd';
import {
  ExportOutlined,
  ImportOutlined,
  QuestionCircleOutlined,
  GithubOutlined
} from '@ant-design/icons';
import { storage, runtime } from '../../utils/browser-api';

const { Text, Link } = Typography;

// Helper function for safe message sending
const sendMessageSafely = (message, callback) => {
  runtime.sendMessage(message, (response) => {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    if (browserAPI.runtime.lastError) {
      console.log(`Info: Message '${message.type}' failed:`, browserAPI.runtime.lastError.message);
      if (callback) callback(null, browserAPI.runtime.lastError);
    } else {
      if (callback) callback(response, null);
    }
  });
};

/**
 * Professional footer component with labeled actions and version info
 */
const Footer = () => {
  const { message } = App.useApp();

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

      // Format timestamp for filename
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      const filename = `open-headers-config-${timestamp}.json`;

      // Create a blob and download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create and click a download link
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

      // Removed the success message - let browser handle the feedback
    } catch (error) {
      console.error('Export error:', error);
      message.error('Failed to export configuration');
    }
  };

  // Handle import configuration
  const handleImport = (file) => {
    try {
      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const config = JSON.parse(event.target.result);

          if (!config.savedData) {
            message.error('Invalid configuration file: savedData missing');
            return;
          }

          // Save data to storage
          storage.sync.set({ savedData: config.savedData }, () => {
            // If dynamic sources are present, save them too
            if (config.dynamicSources && Array.isArray(config.dynamicSources)) {
              storage.local.set({ dynamicSources: config.dynamicSources }, () => {
                // Notify the background script about the import
                sendMessageSafely({
                  type: 'configurationImported',
                  savedData: config.savedData,
                  dynamicSources: config.dynamicSources
                }, (response, error) => {
                  if (!error) {
                    message.success('Configuration imported successfully');
                  } else {
                    message.warning('Configuration imported but background update failed');
                  }
                });
              });
            } else {
              // Notify without dynamic sources
              sendMessageSafely({
                type: 'configurationImported',
                savedData: config.savedData
              }, (response, error) => {
                if (!error) {
                  message.success('Configuration imported successfully');
                } else {
                  message.warning('Configuration imported but background update failed');
                }
              });
            }
          });
        } catch (parseError) {
          console.error('Parse error:', parseError);
          message.error('Failed to parse configuration file');
        }
      };

      reader.readAsText(file);
    } catch (error) {
      console.error('Import error:', error);
      message.error('Failed to import configuration');
    }

    // Prevent default upload behavior
    return false;
  };

  // Handle opening the welcome page
  const handleOpenWelcomePage = () => {
    sendMessageSafely({ type: 'forceOpenWelcomePage' }, (response, error) => {
      if (!error) {
        // Close the popup after sending the message
        window.close();
      }
    });
  };

  // Handle opening GitHub page
  const handleOpenGitHub = () => {
    sendMessageSafely({
      type: 'openTab',
      url: 'https://github.com/OpenHeaders/open-headers-browser-extension'
    }, (response, error) => {
      if (!error) {
        window.close();
      }
    });
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

            <Upload
                beforeUpload={handleImport}
                showUploadList={false}
                accept=".json"
            >
              <Button
                  type="text"
                  icon={<ImportOutlined />}
                  size="small"
              >
                Import rules
              </Button>
            </Upload>

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