import React, { useState, useEffect } from 'react';
import { Button, Space, Typography, theme, Tooltip, Switch, App, Dropdown, Divider, Tag, Badge } from 'antd';
import {
  GlobalOutlined,
  PlaySquareOutlined,
  AppstoreOutlined,
  VideoCameraTwoTone,
  FileTextOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  TrademarkCircleTwoTone,
  EditOutlined,
  NodeExpandOutlined
} from '@ant-design/icons';
import { runtime } from '../../utils/browser-api';
import RecordingButton from './RecordingButton';
import { getAppLauncher } from '../../utils/app-launcher';
import { useHeader } from '../../hooks/useHeader';

const { Text } = Typography;

// Helper function for safe message sending
const sendMessageSafely = (message) => {
  return new Promise((resolve) => {
    runtime.sendMessage(message, (response) => {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      if (browserAPI.runtime.lastError) {
        console.log(`Info: Message '${message.type}' failed:`, browserAPI.runtime.lastError.message);
        resolve({ error: browserAPI.runtime.lastError.message });
      } else {
        resolve(response || {});
      }
    });
  });
};

/**
 * Professional footer component with recording button, records link, and version info
 */
const Footer = () => {
  // Version information
  const version = '3.0.0';
  const { token } = theme.useToken();
  const [useWidget, setUseWidget] = useState(true);
  const [enableVideoRecording, setEnableVideoRecording] = useState(false);
  const [recordingHotkey, setRecordingHotkey] = useState('Cmd+Shift+E');
  const [recordingHotkeyEnabled, setRecordingHotkeyEnabled] = useState(true);
  const [optionsTooltipOpen, setOptionsTooltipOpen] = useState(false);
  const [isRulesExecutionPaused, setIsRulesExecutionPaused] = useState(false);
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();
  
  // Get header context for rule counts
  const { headerEntries, isConnected } = useHeader();
  const totalRules = Object.keys(headerEntries).length;
  const enabledRules = Object.values(headerEntries).filter(rule => rule.isEnabled !== false).length;

  // Load preferences and sync with app
  useEffect(() => {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    // Load widget preference from extension storage
    browserAPI.storage.sync.get(['useRecordingWidget', 'isRulesExecutionPaused'], (result) => {
      if (browserAPI.runtime.lastError) {
        console.error('Error loading preferences:', browserAPI.runtime.lastError);
        return;
      }
      if (result.useRecordingWidget !== undefined) {
        setUseWidget(result.useRecordingWidget);
      }
      if (result.isRulesExecutionPaused !== undefined) {
        setIsRulesExecutionPaused(result.isRulesExecutionPaused);
      }
    });

    // Get initial video recording state from the app
    checkVideoRecordingState();
    
    // Get recording hotkey setting from the app
    checkRecordingHotkey();
    
    // Listen for video recording state changes from the app
    const handleVideoRecordingStateChange = (message) => {
      if (message.type === 'videoRecordingStateChanged' && message.enabled !== undefined) {
        setEnableVideoRecording(message.enabled);
      }
      // Also listen for hotkey responses and changes
      if ((message.type === 'recordingHotkeyResponse' || message.type === 'recordingHotkeyChanged')) {
        if (message.hotkey !== undefined) {
          setRecordingHotkey(formatHotkeyForDisplay(message.hotkey));
        }
        if (message.enabled !== undefined) {
          setRecordingHotkeyEnabled(message.enabled);
        }
      }
    };
    
    runtime.onMessage.addListener(handleVideoRecordingStateChange);
    
    return () => {
      runtime.onMessage.removeListener(handleVideoRecordingStateChange);
    };
  }, []);

  // Format hotkey for display (convert CommandOrControl to Cmd/Ctrl)
  const formatHotkeyForDisplay = (hotkey) => {
    if (!hotkey) return 'Not set';
    // Detect platform
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    return hotkey
      .replace('CommandOrControl', isMac ? 'Cmd' : 'Ctrl')
      .replace('Command', 'Cmd')
      .replace('Control', 'Ctrl');
  };

  // Check video recording state from the app
  const checkVideoRecordingState = async () => {
    try {
      const response = await sendMessageSafely({ type: 'getVideoRecordingState' });
      if (response && response.enabled !== undefined) {
        setEnableVideoRecording(response.enabled);
      }
    } catch (error) {
      console.log('Could not get video recording state:', error);
    }
  };

  // Check recording hotkey from the app
  const checkRecordingHotkey = async () => {
    try {
      const response = await sendMessageSafely({ type: 'getRecordingHotkey' });
      if (response) {
        if (response.hotkey) {
          setRecordingHotkey(formatHotkeyForDisplay(response.hotkey));
        }
        if (response.enabled !== undefined) {
          setRecordingHotkeyEnabled(response.enabled);
        }
      }
    } catch (error) {
      console.log('Could not get recording hotkey:', error);
    }
  };

  // Save widget preference
  const handleWidgetToggle = (checked) => {
    setUseWidget(checked);
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    browserAPI.storage.sync.set({ useRecordingWidget: checked }, () => {
      if (browserAPI.runtime.lastError) {
        console.error('Error saving widget preference:', browserAPI.runtime.lastError);
      }
    });
  };


  // Handle opening website
  const handleOpenWebsite = async () => {
    const response = await sendMessageSafely({
      type: 'openTab',
      url: 'https://openheaders.io'
    });
    if (!response.error) {
      window.close();
    }
  };

  // Handle opening record viewer
  const handleOpenRecordViewer = async () => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to view workflows');
      return;
    }
    await appLauncher.launchOrFocus({ tab: 'record-viewer' });
    message.info('Switch to OpenHeaders app to view workflows');
  };

  // Handle video recording toggle
  const handleVideoRecordingToggle = async (checked) => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to change video recording settings');
      return;
    }
    // Always open settings in the app to handle the toggle
    // This ensures proper permission checks are performed
    await appLauncher.launchOrFocus({ 
      tab: 'settings',
      settingsTab: 'workflows',
      action: 'toggleVideoRecording',
      value: checked
    });
    message.info('Switch to OpenHeaders app to change video recording setting');
  };

  // Handle opening settings to edit hotkey
  const handleEditHotkey = async () => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to edit hotkey settings');
      return;
    }
    await appLauncher.launchOrFocus({ 
      tab: 'settings',
      settingsTab: 'workflows',
      action: 'editHotkey'
    });
    message.info('Switch to OpenHeaders app to edit recording hotkey');
  };
  
  // Handle hotkey enable/disable toggle
  const handleHotkeyToggle = async (checked) => {
    if (!isConnected) {
      message.warning('Please connect to the desktop app to change hotkey settings');
      return;
    }
    // Open settings in the app to handle the toggle
    // This ensures proper permission checks and settings persistence
    await appLauncher.launchOrFocus({ 
      tab: 'settings',
      settingsTab: 'workflows',
      action: 'toggleRecordingHotkey',
      value: checked
    });
    message.info('Switch to OpenHeaders app to change hotkey setting');
  };
  
  // Handle global rules pause/resume toggle
  const handleGlobalRulesToggle = async (checked) => {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    
    // Update the pause state in storage
    browserAPI.storage.sync.set({ isRulesExecutionPaused: !checked }, () => {
      if (browserAPI.runtime.lastError) {
        console.error('Error saving pause state:', browserAPI.runtime.lastError);
        message.error('Failed to update rules state');
        return;
      }
      
      // Update local state
      setIsRulesExecutionPaused(!checked);
      
      // Send message to background script to update rules execution
      sendMessageSafely({
        type: 'setRulesExecutionPaused',
        paused: !checked
      });
      
      // Show feedback to user
      message.success(checked ? 'Rules execution resumed' : 'Rules execution paused');
    });
  };

  // Dropdown menu items for options
  const optionsMenuItems = [
    {
      key: 'general-label',
      label: (
        <Text type="secondary" style={{ fontSize: '11px', fontWeight: 600 }}>GENERAL</Text>
      ),
      disabled: true,
    },
    {
      key: 'widget',
      label: (
        <div 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '270px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Display recording widget with a timer (drag to reposition)" placement="top">
            <Space>
              <AppstoreOutlined />
              <span>Show Widget</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <Switch
            size="small"
            checked={useWidget}
            onChange={handleWidgetToggle}
          />
        </div>
      ),
    },
    {
      key: 'hotkey',
      label: (
        <div 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '270px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Global keyboard shortcut to start/stop recording" placement="top">
            <Space>
              <TrademarkCircleTwoTone />
              <span>Hotkey</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {recordingHotkeyEnabled && recordingHotkey !== 'Not set' ? (
              <Space size={4}>
                {recordingHotkey.split('+').map((key, index) => (
                  <Tag key={index} style={{ margin: 0, fontSize: '11px' }}>
                    {key}
                  </Tag>
                ))}
              </Space>
            ) : (
              <Text type="secondary" style={{ fontSize: '12px', fontStyle: 'italic' }}>
                {!recordingHotkeyEnabled ? 'Disabled' : recordingHotkey}
              </Text>
            )}
            <Tooltip title={!isConnected ? "App not connected" : "Edit hotkey in settings"}>
              <Button
                type="text"
                icon={<EditOutlined />}
                size="small"
                disabled={!isConnected}
                onClick={handleEditHotkey}
                style={{ 
                  padding: '0 4px', 
                  height: '20px',
                  minWidth: 'auto'
                }}
              />
            </Tooltip>
            <Switch
              size="small"
              checked={recordingHotkeyEnabled}
              disabled={!isConnected}
              onChange={handleHotkeyToggle}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'divider1',
      type: 'divider',
    },
    {
      key: 'recording-types-label',
      label: (
        <Text type="secondary" style={{ fontSize: '11px', fontWeight: 600 }}>RECORDING TYPES</Text>
      ),
      disabled: true,
    },
    {
      key: 'session',
      label: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '250px' }}>
          <Tooltip title="Record all browser events (DOM, console, network, storage) and interactions (page, mouse, input)" placement="top">
            <Space>
              <FileTextOutlined />
              <span>Session</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <Tooltip title="Session recording is always enabled by default" placement="top">
            <Switch
              size="small"
              checked={true}
              disabled={true}
              style={{ opacity: 0.5 }}
            />
          </Tooltip>
        </div>
      ),
    },
    {
      key: 'video',
      label: (
        <div 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: '270px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Tooltip title="Record current screen in video format (.webm/.mp4)" placement="top">
            <Space>
              <VideoCameraTwoTone />
              <span>Video</span>
              <InfoCircleOutlined style={{ fontSize: '12px', color: token.colorTextSecondary }} />
            </Space>
          </Tooltip>
          <Tooltip title={!isConnected ? "App not connected" : "Video recording might require additional system permissions"} placement="top">
            <Switch
              size="small"
              checked={enableVideoRecording}
              disabled={!isConnected}
              onChange={handleVideoRecordingToggle}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
      <div className="footer" style={{ 
        backgroundColor: token.colorBgContainer,
        borderTop: `1px solid ${token.colorBorderSecondary}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RecordingButton useWidget={useWidget} />
          <Tooltip title={!isConnected ? "App not connected" : "View and manage recorded workflows in desktop app"}>
            <Button
                icon={<PlaySquareOutlined />}
                onClick={handleOpenRecordViewer}
                size="middle"
                disabled={!isConnected}
                style={{
                  height: '36px',
                  padding: '0 20px',
                  fontWeight: 500,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
            >
              View Workflows
            </Button>
          </Tooltip>
          <Dropdown
            menu={{ items: optionsMenuItems }}
            placement="topRight"
            trigger={['click']}
            onOpenChange={(open) => {
              if (open) {
                setOptionsTooltipOpen(false);
              }
            }}
          >
            <Tooltip 
              title="Recording options"
              open={optionsTooltipOpen}
              onOpenChange={setOptionsTooltipOpen}
            >
              <Button
                icon={<SettingOutlined />}
                size="middle"
                style={{
                  height: '36px',
                  padding: '0 10px',
                  fontWeight: 500,
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}>
                Options
              </Button>
            </Tooltip>
          </Dropdown>
          
          {/* Global Rules Toggle */}
          {totalRules > 0 && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px',
              padding: '0 8px',
              borderLeft: `1px solid ${token.colorBorderSecondary}`,
              marginLeft: '8px'
            }}>
              <NodeExpandOutlined style={{ 
                fontSize: '14px', 
                color: isRulesExecutionPaused ? token.colorWarning : token.colorTextSecondary 
              }} />
              <Text style={{ 
                fontSize: '12px', 
                color: isRulesExecutionPaused ? token.colorWarning : token.colorTextSecondary 
              }}>
                Rules
              </Text>
              <Tooltip title={isRulesExecutionPaused 
                ? "Resume rules execution" 
                : "Pause all rules (preserves individual rule settings)"}>
                <Switch
                  size="medium"
                  checked={!isRulesExecutionPaused}
                  onChange={handleGlobalRulesToggle}
                  checkedChildren="Active"
                  unCheckedChildren="Paused"
                />
              </Tooltip>
            </div>
          )}
        </div>

        <div>
          <Space size={8} align="center">
            <Text style={{ fontSize: '11px', color: token.colorTextTertiary }}>v{version}</Text>
            <Button
                type="text"
                icon={<GlobalOutlined />}
                onClick={handleOpenWebsite}
                size="small"
                style={{ padding: '0 4px', height: '20px', minWidth: 'auto' }}
            />
          </Space>
        </div>
      </div>
  );
};

export default Footer;