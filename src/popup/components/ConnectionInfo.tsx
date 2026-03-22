import React, { useState, useEffect } from 'react';
import { Alert, Button, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { storage } from '../../utils/browser-api';
import { sendMessage } from '../../utils/messaging';

const ConnectionInfo: React.FC = () => {
  const { isConnected } = useHeader();
  const [dismissed, setDismissed] = useState(false);
  const [lastConnectionState, setLastConnectionState] = useState(isConnected);

  useEffect(() => {
    storage.local.get(['connectionAlertDismissed'], (result: Record<string, unknown>) => {
      if (result.connectionAlertDismissed) {
        setDismissed(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!lastConnectionState && isConnected) {
      setDismissed(false);
      storage.local.remove(['connectionAlertDismissed']);
    }

    setLastConnectionState(isConnected);
  }, [isConnected, lastConnectionState]);

  const handleOpenWelcomePage = async (): Promise<void> => {
    const response = await sendMessage({ type: 'forceOpenWelcomePage' });
    if (!response.error) {
      window.close();
    }
  };

  const handleDismiss = (): void => {
    setDismissed(true);
    storage.local.set({ connectionAlertDismissed: true });
  };

  if (isConnected || dismissed) {
    return null;
  }

  return (
      <Alert
          message="Desktop App Not Connected"
          description={
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              <span style={{ fontSize: '12px' }}>Install the Open Headers desktop app to manage rules and view recordings.</span>
              <Space size={8}>
                <Button
                    type="primary"
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => window.open('https://openheaders.io', '_blank')}
                >
                  Download App
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
