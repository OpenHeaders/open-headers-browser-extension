import React from 'react';
import { Typography, Space, Badge, Button, Dropdown, Switch, type MenuProps } from 'antd';
import { BulbOutlined, BulbFilled, CompressOutlined, MenuOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { useTheme } from '../../context';

const { Title, Text } = Typography;

interface HeaderProps {
    onOpenSetupGuide: () => void;
}

type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeDisplayConfig {
    icon: React.ReactNode;
    text: string;
    color: string;
}

const Header: React.FC<HeaderProps> = ({ onOpenSetupGuide }) => {
    const { isConnected } = useHeader();
    const { isDarkMode, themeMode, setThemeMode, isCompactMode, toggleCompactMode } = useTheme();

    const themeDisplay: Record<ThemeMode, ThemeDisplayConfig> = {
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
            icon: <span style={{ fontSize: '14px' }}>&#x25D0;</span>,
            text: 'Auto',
            color: '#1890ff'
        }
    };

    const currentTheme = themeDisplay[themeMode as ThemeMode];

    const themeMenuItems: MenuProps['items'] = [
        {
            key: 'light',
            label: (
                <Space>
                    {themeDisplay.light.icon}
                    <span>{themeDisplay.light.text}</span>
                    {themeMode === 'light' && <span style={{ marginLeft: 'auto' }}>&#x2713;</span>}
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
                    {themeMode === 'dark' && <span style={{ marginLeft: 'auto' }}>&#x2713;</span>}
                </Space>
            ),
            onClick: () => setThemeMode('dark')
        },
        {
            type: 'divider' as const
        },
        {
            key: 'auto',
            label: (
                <Space>
                    {themeDisplay.auto.icon}
                    <span>{themeDisplay.auto.text}</span>
                    {themeMode === 'auto' && <span style={{ marginLeft: 'auto' }}>&#x2713;</span>}
                </Space>
            ),
            onClick: () => setThemeMode('auto')
        },
        {
            type: 'divider' as const
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
                        onClick={(checked: boolean, e: React.MouseEvent | React.KeyboardEvent) => {
                            if ('stopPropagation' in e) e.stopPropagation();
                            toggleCompactMode();
                        }}
                    />
                </Space>
            ),
            onClick: (e) => {
                if (!(e.domEvent.target as HTMLElement).closest('.ant-switch')) {
                    toggleCompactMode();
                }
            }
        }
    ];

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
