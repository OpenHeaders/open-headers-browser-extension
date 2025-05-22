import React, { useState, useEffect } from 'react';
import { Typography, Space, Button, Alert, Result } from 'antd';
import { CheckCircleOutlined, LoadingOutlined, ReloadOutlined } from '@ant-design/icons';
import { runtime } from '../../utils/browser-api';

const { Title, Paragraph } = Typography;

/**
 * Component for verifying connection to the companion app
 */
const ConnectionVerification = ({ isConnected, onConnectionVerified }) => {
  const [verificationStatus, setVerificationStatus] = useState('checking'); // checking, success, failed

  // Check connection when component mounts and periodically
  useEffect(() => {
    const checkConnection = () => {
      runtime.sendMessage({ type: 'checkConnection' }, (response) => {
        if (response?.connected === true) {
          setVerificationStatus('success');
          onConnectionVerified();
        } else {
          setVerificationStatus('failed');
        }
      });
    };

    // Check immediately
    checkConnection();

    // Set up periodic checking
    const interval = setInterval(checkConnection, 2000);

    return () => clearInterval(interval);
  }, [onConnectionVerified]);

  // Handle retry button click
  const handleRetry = () => {
    setVerificationStatus('checking');
    
    // Check connection after a short delay
    setTimeout(() => {
      runtime.sendMessage({ type: 'checkConnection' }, (response) => {
        if (response?.connected === true) {
          setVerificationStatus('success');
          onConnectionVerified();
        } else {
          setVerificationStatus('failed');
        }
      });
    }, 1000);
  };

  // Render content based on verification status
  const renderContent = () => {
    switch (verificationStatus) {
      case 'checking':
        return (
          <Space direction="vertical" align="center" style={{ width: '100%', textAlign: 'center' }}>
            <LoadingOutlined style={{ fontSize: 48, color: '#FBBC05' }} />
            <Title level={4}>Verifying Connection...</Title>
            <Paragraph>
              Please wait while we verify your connection to the companion app.
            </Paragraph>
          </Space>
        );

      case 'success':
        return (
          <Result
            status="success"
            title="Connection Verified!"
            subTitle="Your browser extension is now successfully connected to the companion app."
            icon={<CheckCircleOutlined style={{ color: '#34A853' }} />}
          />
        );

      case 'failed':
        return (
          <Space direction="vertical" align="center" style={{ width: '100%', textAlign: 'center' }}>
            <Title level={4}>Connection Verification</Title>
            
            <Alert
              message="Connection Failed"
              description="Unable to connect to the companion app. Please ensure it's running and try again."
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            <Space direction="vertical" style={{ textAlign: 'center' }}>
              <Paragraph>
                Make sure the companion app is:
              </Paragraph>
              <ul style={{ textAlign: 'left', marginBottom: 16 }}>
                <li>Downloaded and installed</li>
                <li>Running in the background</li>
                <li>Not blocked by firewall or antivirus</li>
              </ul>
              
              <Button 
                type="primary" 
                icon={<ReloadOutlined />} 
                onClick={handleRetry}
              >
                Retry Connection
              </Button>
            </Space>
          </Space>
        );

      default:
        return null;
    }
  };

  return (
    <div className="step-container">
      {renderContent()}
    </div>
  );
};

export default ConnectionVerification;