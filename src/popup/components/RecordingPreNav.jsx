import React, { useState } from 'react';
import { Button, Tooltip, Input, Space, App } from 'antd';
import { PlusCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { startRecordingNewTab, startRecordingCurrentTabWithReload } from '../utils/recording-pre-nav';

const RecordingPreNav = () => {
    const [newTabUrl, setNewTabUrl] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { message } = App.useApp();

    const handleRecordNewTab = async () => {
        if (!newTabUrl.trim()) {
            message.warning('Please enter a URL');
            return;
        }

        setIsLoading(true);
        try {
            let url = newTabUrl.trim();
            // Add protocol if missing
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            await startRecordingNewTab(url);
            setNewTabUrl(''); // Clear input after success
            message.success('Recording started in new tab');
            // Close popup
            window.close();
        } catch (error) {
            message.error('Failed to start recording: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecordWithReload = async () => {
        setIsLoading(true);
        try {
            await startRecordingCurrentTabWithReload();
            message.success('Recording started - page will reload');
            // Close popup
            window.close();
        } catch (error) {
            message.error('Failed to start workflow: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ marginTop: '12px' }}>
            <div style={{ marginBottom: '8px', fontSize: '12px', color: '#666' }}>
                Advanced Workflow Options:
            </div>
            
            {/* Record current tab with reload */}
            <Tooltip title="Reload current page and record from the beginning to capture all initial requests">
                <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={handleRecordWithReload}
                    loading={isLoading}
                    block
                    style={{ marginBottom: '8px' }}
                >
                    Record with page reload
                </Button>
            </Tooltip>

            {/* Record new tab */}
            <Space.Compact style={{ width: '100%' }}>
                <Input
                    size="small"
                    placeholder="Enter URL to record"
                    value={newTabUrl}
                    onChange={(e) => setNewTabUrl(e.target.value)}
                    onPressEnter={handleRecordNewTab}
                    disabled={isLoading}
                />
                <Tooltip title="Open URL in new tab and start recording from page load">
                    <Button
                        size="small"
                        type="primary"
                        icon={<PlusCircleOutlined />}
                        onClick={handleRecordNewTab}
                        loading={isLoading}
                    >
                        New tab
                    </Button>
                </Tooltip>
            </Space.Compact>
        </div>
    );
};

export default RecordingPreNav;