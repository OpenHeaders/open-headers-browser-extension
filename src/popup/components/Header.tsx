import React, { useState, useEffect } from 'react';
import { Typography, Space, Badge, Button, Dropdown, Switch, Select, Tooltip, type MenuProps } from 'antd';
import { BulbOutlined, BulbFilled, CompressOutlined, MenuOutlined, QuestionCircleOutlined, CloseCircleOutlined, WarningOutlined, InfoCircleOutlined, BugOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { useTheme } from '../../context';
import { logger, type LogLevel } from '../../utils/logger';
import { getBrowserAPI } from '../../types/browser';

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

const LOG_LEVEL_OPTIONS: Array<{ value: LogLevel; label: React.ReactNode }> = [
    { value: 'error', label: <Space size={4}><CloseCircleOutlined style={{ fontSize: 12, color: '#ff4d4f' }} /><span>Error</span></Space> },
    { value: 'warn', label: <Space size={4}><WarningOutlined style={{ fontSize: 12, color: '#faad14' }} /><span>Warning</span></Space> },
    { value: 'info', label: <Space size={4}><InfoCircleOutlined style={{ fontSize: 12, color: '#1890ff' }} /><span>Info</span></Space> },
    { value: 'debug', label: <Space size={4}><BugOutlined style={{ fontSize: 12, color: '#52c41a' }} /><span>Debug</span></Space> },
];

const Header: React.FC<HeaderProps> = ({ onOpenSetupGuide }) => {
    const { isConnected, isStatusLoaded } = useHeader();
    const { isDarkMode, themeMode, setThemeMode, isCompactMode, toggleCompactMode } = useTheme();
    const [logLevel, setLogLevel] = useState<LogLevel>(logger.getLevel());

    useEffect(() => {
        const browserAPI = getBrowserAPI();
        browserAPI.storage.sync.get(['logLevel'], (result: Record<string, unknown>) => {
            if (result.logLevel && typeof result.logLevel === 'string') {
                setLogLevel(result.logLevel as LogLevel);
            }
        });
    }, []);

    const handleLogLevelChange = (level: LogLevel) => {
        setLogLevel(level);
        logger.setLevel(level);
    };

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

    const menuItems: MenuProps['items'] = [
        {
            key: 'setup',
            icon: <QuestionCircleOutlined />,
            label: 'Setup Guide',
            onClick: onOpenSetupGuide
        },
        { type: 'divider' as const },
        {
            key: 'logLevel',
            label: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '200px' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Tooltip overlayStyle={{ maxWidth: 280 }} title={
                        <>
                            <div style={{ marginBottom: 4, opacity: 0.75 }}>Each level includes all levels above it:</div>
                            <div><strong>Error:</strong> <span style={{ opacity: 0.75 }}>Operation failures</span></div>
                            <div><strong>Warning:</strong> <span style={{ opacity: 0.75 }}>Anomalies and fallbacks</span></div>
                            <div><strong>Info:</strong> <span style={{ opacity: 0.75 }}>State changes (default)</span></div>
                            <div><strong>Debug:</strong> <span style={{ opacity: 0.75 }}>Verbose internals</span></div>
                        </>
                    }>
                        <Space>
                            <span>Log Level</span>
                            <QuestionCircleOutlined style={{ fontSize: 11, cursor: 'help' }} />
                        </Space>
                    </Tooltip>
                    <Select
                        size="small"
                        value={logLevel}
                        onChange={handleLogLevelChange}
                        options={LOG_LEVEL_OPTIONS}
                        style={{ width: 110 }}
                        popupMatchSelectWidth={false}
                    />
                </div>
            ),
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
                            status={!isStatusLoaded ? 'default' : isConnected ? 'success' : 'error'}
                            text={
                                <Space size={4}>
                                    <Text style={{ fontSize: '12px' }}>
                                        {!isStatusLoaded ? '' : isConnected ? 'Connected' : 'Disconnected'}
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
