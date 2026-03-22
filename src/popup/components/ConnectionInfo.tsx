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
      <div style={{
        position: 'absolute',
        top: 0,
        left: 470,
        right: 16,
        zIndex: 100,
      }}>
        <Alert
            message={<span style={{ fontSize: '12px', fontWeight: 600 }}>Desktop App Not Connected</span>}
            description={
              <Space size={6} style={{ marginTop: 2 }}>
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
            }
            type="warning"
            showIcon
            closable
            onClose={handleDismiss}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              borderRadius: '8px',
            }}
        />
      </div>
  );
};

export default ConnectionInfo;
