import React from 'react';
import { Typography, Space, Badge } from 'antd';
import { ApiOutlined, DisconnectOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';

const { Title, Text } = Typography;

/**
 * Professional header component with connection status indicator
 */
const Header = () => {
  const { isConnected } = useHeader();
  
  return (
    <div className="header">
      <Space align="center">
        <Title level={4} style={{ margin: 0, color: '#1890ff' }}>Open Headers</Title>
        <Text type="secondary" style={{ fontSize: '12px' }}>Extension</Text>
      </Space>
      <div className="connection-status">
        <Space align="center" size={6}>
          <Badge 
            status={isConnected ? 'success' : 'error'} 
            text={
              <Space size={4}>
                {isConnected ? <ApiOutlined /> : <DisconnectOutlined />}
                <Text style={{ fontSize: '12px' }}>
                  {isConnected ? 'Connected' : 'Disconnected'}
                </Text>
              </Space>
            }
          />
        </Space>
      </div>
    </div>
  );
};

export default Header;