import React, { useState, useEffect } from 'react';
import { Button, Tooltip, App } from 'antd';
import { VideoCameraOutlined, StopOutlined } from '@ant-design/icons';
import { startRecording, stopRecording, getRecordingState } from '../utils/recording';

const RecordingButton = ({ useWidget = false }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { message } = App.useApp();

    // Check initial recording state and when popup regains focus
    useEffect(() => {
        checkRecordingState();
        
        // Check recording state when popup window gains focus
        const handleFocus = () => {
            checkRecordingState();
        };
        
        window.addEventListener('focus', handleFocus);
        
        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const checkRecordingState = async () => {
        try {
            const state = await getRecordingState();
            setIsRecording(state.isRecording);
        } catch (error) {
            setIsRecording(false);
        }
    };

    const handleToggleRecording = async () => {
        setIsLoading(true);
        
        try {
            if (isRecording) {
                await stopRecording();
                setIsRecording(false);
                // Show notification in popup for 7 seconds
                message.success({
                    content: 'Workflow saved! Open desktop app → Workflows tab',
                    duration: 7,
                    style: {
                        marginTop: '16px'
                    }
                });
            } else {
                const result = await startRecording(useWidget);
                if (result.success || result.preNavigation) {
                    setIsRecording(true); // Immediately update UI
                    if (result.preNavigation) {
                        // Pre-navigation recording started
                        message.info('Recording started! Navigate to a page to begin capturing', 3);
                        // Close popup to let user navigate
                        setTimeout(() => window.close(), 2000);
                    } else {
                        message.success('Recording started', 2);
                        // Close popup to let user navigate
                        setTimeout(() => window.close(), 1000);
                    }
                }
            }
        } catch (error) {
            console.error('Recording error:', error);
            message.error(error.message || 'Failed to start workflow');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Tooltip title={isRecording ? 'Stop Recording' : 'Capture current browser tab activity. Create a demo or debug technical problems.'}>
            <Button
                type={isRecording ? 'primary' : 'default'}
                danger={isRecording}
                size="middle"
                icon={isRecording ? <StopOutlined /> : <VideoCameraOutlined />}
                loading={isLoading}
                onClick={handleToggleRecording}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '36px',
                    padding: '0 20px',
                    fontWeight: 500,
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                }}
            >
                {isRecording ? 'Stop Workflow' : 'Record Workflow'}
            </Button>
        </Tooltip>
    );
};

export default RecordingButton;