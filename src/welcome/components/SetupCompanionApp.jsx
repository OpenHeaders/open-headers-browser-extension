import React from 'react';
import { Typography, Space, Button, Alert } from 'antd';
import { DownloadOutlined, CheckCircleOutlined, LoadingOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * Component for setting up the companion app
 */
const SetupCompanionApp = ({ isConnected }) => {
  const openDownloadPage = () => {
    window.open('https://github.com/OpenHeaders/open-headers-app/releases', '_blank');
  };

  return (
    <div className="step-container">
      <Title level={3}>Companion App Setup</Title>
      
      <Paragraph style={{ marginBottom: 24 }}>
        To use dynamic sources (environment variables, local files, and HTTP requests), 
        you need to install the Open Headers companion app.
      </Paragraph>
      
      <div className="welcome-illustration">
        <img 
          src="../images/companion-app.png" 
          alt="Companion App" 
          style={{ maxWidth: '100%', maxHeight: 160 }}
        />
      </div>
      
      <Space direction="vertical" style={{ width: '100%', marginTop: 24 }}>
        <div className="connection-status">
          {isConnected ? (
            <>
              <div className="status-indicator connected" />
              <Space>
                <CheckCircleOutlined style={{ color: '#34A853' }} />
                <span>Connected to companion app</span>
              </Space>
            </>
          ) : (
            <>
              <div className="status-indicator disconnected" />
              <Space>
                <LoadingOutlined style={{ color: '#FBBC05' }} />
                <span>Waiting for connection...</span>
              </Space>
            </>
          )}
        </div>
        
        {!isConnected && (
          <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
            <Alert
              message="Download and install the companion app to continue"
              type="info"
              showIcon
            />
            
            <Button 
              type="primary" 
              icon={<DownloadOutlined />} 
              onClick={openDownloadPage}
              style={{ marginTop: 8 }}
            >
              Download Companion App
            </Button>
          </Space>
        )}
      </Space>
    </div>
  );
};

export default SetupCompanionApp;