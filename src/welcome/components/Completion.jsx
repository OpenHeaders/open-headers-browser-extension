import React from 'react';
import { Typography, Space, Button, Result } from 'antd';
import { CheckCircleOutlined, BookOutlined, SettingOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * Completion component for the welcome page
 */
const Completion = ({ browserType }) => {
  const handleViewDocs = () => {
    window.open('https://github.com/OpenHeaders/open-headers-browser-extension#readme', '_blank');
  };

  const handlePinExtension = () => {
    // Provide instructions for pinning the extension to toolbar based on browser
    const getBrowserInstructions = () => {
      switch (browserType) {
        case 'firefox':
          return 'In Firefox, right-click the extension icon to pin it to the toolbar.';
        case 'chrome':
          return 'In Chrome, click the puzzle piece icon and pin Open Headers.';
        case 'edge':
          return 'In Edge, click the three dots menu > Extensions and pin Open Headers.';
        case 'safari':
          return 'In Safari, ensure the extension is enabled in Settings > Extensions.';
        default:
          return 'Pin the extension to your browser toolbar for easy access.';
      }
    };

    alert(getBrowserInstructions());
  };

  return (
    <div className="step-container">
      <Result
        status="success"
        title="Setup Complete!"
        subTitle="Open Headers is now ready to use. You can start managing HTTP headers for your web development needs."
        icon={<CheckCircleOutlined style={{ color: '#34A853' }} />}
      />
      
      <Space direction="vertical" style={{ width: '100%', marginTop: 24 }}>
        <Paragraph style={{ textAlign: 'center' }}>
          <strong>Next Steps:</strong>
        </Paragraph>
        
        <ul style={{ marginBottom: 16 }}>
          <li>Pin the extension to your browser toolbar for easy access</li>
          <li>Start adding headers for your development domains</li>
          <li>Explore dynamic sources for environment-specific values</li>
          <li>Check out the documentation for advanced features</li>
        </ul>
        
        <Space style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
          <Button 
            icon={<SettingOutlined />} 
            onClick={handlePinExtension}
          >
            Pin Extension
          </Button>
          
          <Button 
            type="primary" 
            icon={<BookOutlined />} 
            onClick={handleViewDocs}
          >
            View Documentation
          </Button>
        </Space>
      </Space>
    </div>
  );
};

export default Completion;