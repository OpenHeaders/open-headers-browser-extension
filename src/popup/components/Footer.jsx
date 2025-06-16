import React from 'react';
import { Button, Space, Typography, theme, Tooltip } from 'antd';
import {
  GlobalOutlined,
  PlaySquareOutlined
} from '@ant-design/icons';
import { runtime } from '../../utils/browser-api';
import RecordingButton from './RecordingButton';

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
 * Professional footer component with recording button, records link, and version info
 */
const Footer = () => {
  // Version information
  const version = '2.2.0';
  const { token } = theme.useToken();


  // Handle opening website
  const handleOpenWebsite = async () => {
    const response = await sendMessageSafely({
      type: 'openTab',
      url: 'https://openheaders.io'
    });
    if (!response.error) {
      window.close();
    }
  };

  // Handle opening record viewer
  const handleOpenRecordViewer = async () => {
    const response = await sendMessageSafely({
      type: 'openTab',
      url: runtime.getURL('record-viewer.html')
    });
    if (!response.error) {
      window.close();
    }
  };

  return (
      <div className="footer" style={{ 
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`
      }}>
        <div>
          <Space size={12}>
            <RecordingButton />
            <Tooltip title="View records in OpenHeaders local app">
              <Button
                  type="text"
                  icon={<PlaySquareOutlined />}
                  onClick={handleOpenRecordViewer}
                  size="small"
              >
                View Records
              </Button>
            </Tooltip>
          </Space>
        </div>

        <div>
          <Space size={8} align="center">
            <Text style={{ fontSize: '11px', color: token.colorTextTertiary }}>v{version}</Text>
            <Button
                type="text"
                icon={<GlobalOutlined />}
                onClick={handleOpenWebsite}
                size="small"
                style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
            />
          </Space>
        </div>
      </div>
  );
};

export default Footer;