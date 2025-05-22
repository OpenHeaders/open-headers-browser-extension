import React from 'react';
import { Typography, Space, Button, Alert, Checkbox } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * Component for browser-specific setup instructions
 */
const BrowserSpecificSetup = ({ browserType, certificateAccepted, setCertificateAccepted }) => {
  // Instructions based on browser type
  const renderBrowserSpecificContent = () => {
    switch (browserType) {
      case 'firefox':
        return (
          <>
            <Title level={3}>Firefox Certificate Setup</Title>
            
            <Paragraph style={{ marginBottom: 16 }}>
              Firefox requires an additional security step to connect to the companion app.
              You'll need to accept a self-signed certificate.
            </Paragraph>
            
            <div className="welcome-illustration">
              <img 
                src="../images/firefox-certificate.png" 
                alt="Firefox Certificate" 
                style={{ maxWidth: '100%', maxHeight: 160 }}
              />
            </div>
            
            <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
              <Alert
                message="Certificate Acceptance Instructions"
                description={
                  <ol style={{ marginBottom: 0, paddingLeft: 16 }}>
                    <li>Open <Button type="link" style={{ padding: 0 }} onClick={() => window.open('https://localhost:59211', '_blank')}>https://localhost:59211</Button></li>
                    <li>Click "Advanced" on the security warning page</li>
                    <li>Click "Accept the Risk and Continue"</li>
                    <li>Return to this page and check the box below</li>
                  </ol>
                }
                type="info"
                showIcon
              />
              
              <Checkbox 
                checked={certificateAccepted} 
                onChange={(e) => setCertificateAccepted(e.target.checked)}
                style={{ marginTop: 16 }}
              >
                I've accepted the certificate
              </Checkbox>
            </Space>
          </>
        );
        
      case 'safari':
        return (
          <>
            <Title level={3}>Safari Specific Setup</Title>
            
            <Paragraph style={{ marginBottom: 16 }}>
              Safari has specific security requirements for connecting to the companion app.
            </Paragraph>
            
            <div className="welcome-illustration">
              <SafetyCertificateOutlined style={{ fontSize: 64, color: '#4285F4' }} />
            </div>
            
            <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
              <Alert
                message="Safari Connection Instructions"
                description={
                  <ol style={{ marginBottom: 0, paddingLeft: 16 }}>
                    <li>Ensure the companion app is running</li>
                    <li>Allow connection requests when prompted</li>
                    <li>Safari's strict security model may require additional permission dialogs</li>
                  </ol>
                }
                type="info"
                showIcon
              />
            </Space>
          </>
        );
        
      default:
        return (
          <>
            <Title level={3}>Browser Setup</Title>
            
            <Paragraph style={{ marginBottom: 16 }}>
              Make sure the companion app is running and check your connection status.
            </Paragraph>
            
            <div className="welcome-illustration">
              <SafetyCertificateOutlined style={{ fontSize: 64, color: '#4285F4' }} />
            </div>
          </>
        );
    }
  };

  return (
    <div className="step-container browser-specific-setup">
      {renderBrowserSpecificContent()}
    </div>
  );
};

export default BrowserSpecificSetup;