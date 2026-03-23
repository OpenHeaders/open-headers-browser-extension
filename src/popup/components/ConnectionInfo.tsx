import React, { useState, useEffect } from 'react';
import { Alert, Button, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { storage } from '../../utils/browser-api';
import { sendMessage } from '../../utils/messaging';

const ConnectionInfo: React.FC = () => {
  const { isConnected, isStatusLoaded } = useHeader();
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

  if (!isStatusLoaded || isConnected || dismissed) {
    return null;
  }

  return (
    <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 1000 }}>
      <Alert
        message="Desktop App Not Connected"
        description={
          <Space size={6} style={{ marginTop: 4 }}>
            <Button
              type="primary"
              size="small"
              icon={<DownloadOutlined />}
              onClick={() => window.open('https://openheaders.io', '_blank')}
            >
              Download App
            </Button>
            <Button size="small" onClick={handleOpenWelcomePage}>
              Setup Guide
            </Button>
          </Space>
        }
        type="info"
        showIcon
        closable
        onClose={handleDismiss}
        style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)', borderRadius: 8 }}
      />
    </div>
  );
};

export default ConnectionInfo;
