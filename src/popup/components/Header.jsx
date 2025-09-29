import React from 'react';
import { Typography, Space, Badge, Button, Dropdown, Tooltip, Switch } from 'antd';
import { ApiOutlined, CheckCircleOutlined, BulbOutlined, BulbFilled, CompressOutlined, MenuOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { useTheme } from '../../context';
import { runtime } from '../../utils/browser-api';

const { Title, Text } = Typography;

/**
 * Professional header component with connection status indicator and theme toggle
 */
const Header = ({ onOpenSetupGuide }) => {
    const { isConnected } = useHeader();
    const { isDarkMode, themeMode, setThemeMode, isCompactMode, toggleCompactMode } = useTheme();

    // Theme display configuration
    const themeDisplay = {
        light: {
            icon: <BulbOutlined />,
            text: 'Light',
            color: '#faad14'
        },
        dark: {
            icon: <BulbFilled />,
            text: 'Dark',
            color: '#722ed1'
        },
        auto: {
            icon: <span style={{ fontSize: '14px' }}>◐</span>,
            text: 'Auto',
            color: isDarkMode ? '#1890ff' : '#1890ff'
        }
    };

    const currentTheme = themeDisplay[themeMode];

    const themeMenuItems = [
        {
            key: 'light',
            label: (
                <Space>
                    {themeDisplay.light.icon}
                    <span>{themeDisplay.light.text}</span>
                    {themeMode === 'light' && <span style={{ marginLeft: 'auto' }}>✓</span>}
                </Space>
            ),
            onClick: () => setThemeMode('light')
        },
        {
            key: 'dark',
            label: (
                <Space>
                    {themeDisplay.dark.icon}
                    <span>{themeDisplay.dark.text}</span>
                    {themeMode === 'dark' && <span style={{ marginLeft: 'auto' }}>✓</span>}
                </Space>
            ),
            onClick: () => setThemeMode('dark')
        },
        {
            type: 'divider'
        },
        {
            key: 'auto',
            label: (
                <Space>
                    {themeDisplay.auto.icon}
                    <span>{themeDisplay.auto.text}</span>
                    {themeMode === 'auto' && <span style={{ marginLeft: 'auto' }}>✓</span>}
                </Space>
            ),
            onClick: () => setThemeMode('auto')
        },
        {
            type: 'divider'
        },
        {
            key: 'compact',
            label: (
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                        <CompressOutlined />
                        <span>Compact Mode</span>
                    </Space>
                    <Switch 
                        size="small" 
                        checked={isCompactMode} 
                        onClick={(checked, e) => {
                            e.stopPropagation();
                            toggleCompactMode();
                        }}
                    />
                </Space>
            ),
            onClick: (e) => {
                // Prevent default click behavior when switch is clicked
                if (!e.domEvent.target.closest('.ant-switch')) {
                    toggleCompactMode();
                }
            }
        }
    ];

    // Menu items for the burger menu
    const menuItems = [
        {
            key: 'setup',
            icon: <QuestionCircleOutlined />,
            label: 'Setup Guide',
            onClick: onOpenSetupGuide
        }
    ];

    return (
        <div className="header">
            <Space align="center">
                <Title level={4} style={{ margin: 0, color: '#1890ff' }}>Open Headers</Title>
                <Text type="secondary" style={{ fontSize: '12px' }}>Extension</Text>
            </Space>
            <Space align="center" size={12}>
                <div className="connection-status">
                    <Space align="center" size={6}>
                        <Badge
                            status={isConnected ? 'success' : 'error'}
                            text={
                                <Space size={4}>
                                    <Text style={{ fontSize: '12px' }}>
                                        {isConnected ? 'Connected' : 'Disconnected'}
                                    </Text>
                                </Space>
                            }
                        />
                    </Space>
                </div>
                <Dropdown
                    menu={{ items: themeMenuItems }}
                    placement="bottomRight"
                    trigger={['click']}
                >
                    <Button
                        type="text"
                        size="small"
                        style={{
                            padding: '4px 12px',
                            height: 'auto',
                            color: currentTheme.color,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        {currentTheme.icon}
                        <span style={{ fontSize: '12px' }}>{currentTheme.text}</span>
                    </Button>
                </Dropdown>
                <Dropdown
                    menu={{ items: menuItems }}
                    placement="bottomRight"
                    trigger={['click']}
                >
                    <Button
                        type="text"
                        size="small"
                        icon={<MenuOutlined />}
                        style={{
                            padding: '4px 12px',
                            height: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span style={{ fontSize: '12px' }}>Menu</span>
                    </Button>
                </Dropdown>
            </Space>
        </div>
    );
};

export default Header;