import React from 'react';
import { Typography, Space } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

/**
 * Introduction component for the welcome page
 */
const Introduction = () => {
  return (
    <div className="step-container">
      <Title level={2}>Welcome to Open Headers</Title>
      
      <Paragraph style={{ fontSize: 16, marginBottom: 24 }}>
        Open Headers allows you to modify HTTP request and response headers for specific domains.
      </Paragraph>
      
      <div className="welcome-illustration">
        <Space direction="vertical" align="center">
          <GlobalOutlined style={{ fontSize: 64, color: '#4285F4' }} />
          <Paragraph style={{ textAlign: 'center' }}>
            Modify headers with static values or dynamic sources from your local system.
          </Paragraph>
        </Space>
      </div>
      
      <Space direction="vertical" style={{ width: '100%', marginTop: 24 }}>
        <Paragraph>
          <strong>Key Features:</strong>
        </Paragraph>
        <ul>
          <li>Apply headers to specific domains using URL patterns</li>
          <li>Use dynamic values from HTTP requests, environment variables, and files</li>
          <li>Format values with prefixes and suffixes</li>
          <li>Import and export configurations</li>
        </ul>
      </Space>
    </div>
  );
};

export default Introduction;