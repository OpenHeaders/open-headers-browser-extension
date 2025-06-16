import React, { useState, useEffect } from 'react';
import { Button, Tooltip, App } from 'antd';
import { VideoCameraOutlined, StopOutlined } from '@ant-design/icons';
import { startRecording, stopRecording, getRecordingState } from '../utils/recording';

const RecordingButton = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const { message } = App.useApp();

    // Check initial recording state
    useEffect(() => {
        checkRecordingState();
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
                    content: 'Recording saved! Open in the Open Headers desktop app → Records tab',
                    duration: 7,
                    style: {
                        marginTop: '16px'
                    }
                });
            } else {
                await startRecording();
                setIsRecording(true);
            }
        } catch (error) {
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Tooltip title={isRecording ? 'Stop recording' : 'Start recording the current tab and share it with someone'}>
            <Button
                type={isRecording ? 'primary' : 'default'}
                danger={isRecording}
                size="small"
                icon={isRecording ? <StopOutlined /> : <VideoCameraOutlined />}
                loading={isLoading}
                onClick={handleToggleRecording}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                }}
            >
                {isRecording ? 'Stop recording' : 'Start recording'}
            </Button>
        </Tooltip>
    );
};

export default RecordingButton;