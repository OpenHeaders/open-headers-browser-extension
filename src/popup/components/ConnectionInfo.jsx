import React, { useState, useEffect } from 'react';
import { Alert, Button, Space, Tooltip } from 'antd';
import { InfoCircleOutlined, DownloadOutlined, CloseOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { runtime, storage } from '../../utils/browser-api';

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
 * Component showing connection information or instructions when disconnected
 */
const ConnectionInfo = () => {
  const { isConnected } = useHeader();
  const [dismissed, setDismissed] = useState(false);
  const [lastConnectionState, setLastConnectionState] = useState(isConnected);

  // Load dismissal state from storage
  useEffect(() => {
    storage.local.get(['connectionAlertDismissed'], (result) => {
      if (result.connectionAlertDismissed) {
        setDismissed(true);
      }
    });
  }, []);

  // Monitor connection state changes
  useEffect(() => {
    // If connection state changed from disconnected to connected
    if (!lastConnectionState && isConnected) {
      // Clear dismissal state when reconnected
      setDismissed(false);
      storage.local.remove(['connectionAlertDismissed']);
    }

    setLastConnectionState(isConnected);
  }, [isConnected, lastConnectionState]);

  const handleOpenWelcomePage = () => {
    // Send message to background script to open welcome page
    sendMessageSafely({ type: 'forceOpenWelcomePage' }, (response, error) => {
      if (!error) {
        // Close the popup after sending the message
        window.close();
      }
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Save dismissal state to storage
    storage.local.set({ connectionAlertDismissed: true });
  };

  // Don't show anything if connected or dismissed
  if (isConnected || dismissed) {
    return null;
  }

  return (
      <Alert
          message="Local App Not Connected"
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <span style={{ fontSize: '12px' }}>Install the local app to use dynamic sources.</span>
              <Space size={8}>
                <Button
                    type="primary"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => window.open('https://openheaders.io', '_blank')}
                >
                  Download
                </Button>

                <Button
                    size="small"
                    onClick={handleOpenWelcomePage}
                >
                  Setup Guide
                </Button>
              </Space>
            </Space>
          }
          type="info"
          showIcon
          closable
          onClose={handleDismiss}
          style={{
            marginBottom: 8,
            fontSize: '12px',
            padding: '8px 12px'
          }}
      />
  );
};

export default ConnectionInfo;