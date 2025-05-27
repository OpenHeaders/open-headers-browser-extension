import React, { useEffect, useRef, useState } from 'react';
import {
    Form,
    Input,
    Select,
    Button,
    Radio,
    Space,
    Divider,
    Collapse,
    App,
    Alert,
    AutoComplete
} from 'antd';
import {
    SaveOutlined,
    CloseOutlined,
    PlusOutlined,
    SettingOutlined,
    CodeOutlined,
    KeyOutlined,
    ApiOutlined,
    SwapOutlined,
    LinkOutlined,
    LeftOutlined,
    RightOutlined,
    GlobalOutlined,
    FileTextOutlined,
    CodeSandboxOutlined,
    DisconnectOutlined,
    WarningOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { normalizeHeaderName } from '../../utils/utils';
import {
    validateHeaderName,
    validateHeaderValue,
    validateDomains,
    getSuggestedHeaders
} from '../../utils/header-validator';
import { storage } from '../../utils/browser-api';
import DomainTags from './DomainTags';

const { Option } = Select;

/**
 * Get icon for source type
 */
const getSourceIcon = (source) => {
    const sourceType = source.sourceType || source.locationType || '';

    if (sourceType.toLowerCase().includes('http')) {
        return <GlobalOutlined style={{ marginRight: 4 }} />;
    } else if (sourceType.toLowerCase().includes('file')) {
        return <FileTextOutlined style={{ marginRight: 4 }} />;
    } else if (sourceType.toLowerCase().includes('env')) {
        return <CodeSandboxOutlined style={{ marginRight: 4 }} />;
    }

    return <ApiOutlined style={{ marginRight: 4 }} />;
};

/**
 * Format source display with icon, tag, and path
 */
const formatSourceDisplay = (source) => {
    const tag = source.sourceTag || source.locationTag || '';
    const path = source.sourcePath || source.locationPath || '';
    const type = source.sourceType || source.locationType || '';

    // Build display string
    let display = '';

    // Add tag if exists
    if (tag) {
        display = `[${tag}] `;
    }

    // Add path with $ prefix for env variables
    if (path) {
        // Prefix env variables with $ for clarity
        const displayPath = type.toLowerCase().includes('env') && !path.startsWith('$')
            ? `$${path}`
            : path;
        display += displayPath;
    } else {
        // Fallback to source ID if no path
        display += `Source #${source.sourceId || source.locationId}`;
    }

    return display;
};

/**
 * Form for adding or editing headers
 */
const HeaderForm = () => {
    const [form] = Form.useForm();
    const { message } = App.useApp();
    const isUpdatingRef = useRef(false);
    const prevEditModeRef = useRef(null);
    const [dynamicSourceAlertDismissed, setDynamicSourceAlertDismissed] = useState(false);
    const [lastConnectionState, setLastConnectionState] = useState(null);
    const [headerSuggestions, setHeaderSuggestions] = useState([]);

    const {
        dynamicSources = [],
        draftValues = {},
        editMode = { isEditing: false, entryId: null },
        uiState = { formCollapsed: false },
        isConnected = false,
        saveHeaderEntry,
        cancelEditing,
        updateDraftValues,
        updateUiState
    } = useHeader();

    // Check if the current source is still available
    const isCurrentSourceAvailable = () => {
        if (!draftValues.sourceId) return true;
        return dynamicSources.some(s =>
            (s.sourceId || s.locationId) === draftValues.sourceId
        );
    };

    // Update form values when draft values change
    useEffect(() => {
        if (isUpdatingRef.current) {
            return; // Skip if we're in the middle of a programmatic update
        }

        // Check if we just entered edit mode
        const justEnteredEditMode = editMode.isEditing &&
            (!prevEditModeRef.current || !prevEditModeRef.current.isEditing);

        const values = {
            headerName: draftValues.headerName || '',
            headerValue: draftValues.headerValue || '',
            domains: draftValues.domains || [],
            valueType: draftValues.valueType || 'static',
            sourceId: draftValues.sourceId || '',
            prefix: draftValues.prefix || '',
            suffix: draftValues.suffix || '',
            headerType: draftValues.isResponse ? 'response' : 'request'
        };

        if (justEnteredEditMode) {
            // When entering edit mode, reset the entire form
            isUpdatingRef.current = true;
            form.resetFields();
            form.setFieldsValue(values);

            // Force a re-render after setting values
            setTimeout(() => {
                form.validateFields(['valueType']).catch(() => {});
                isUpdatingRef.current = false;
            }, 0);
        } else {
            // Normal update - only update changed fields
            const currentValues = form.getFieldsValue();
            const fieldsToUpdate = {};

            Object.keys(values).forEach(key => {
                if (JSON.stringify(currentValues[key]) !== JSON.stringify(values[key])) {
                    fieldsToUpdate[key] = values[key];
                }
            });

            if (Object.keys(fieldsToUpdate).length > 0) {
                isUpdatingRef.current = true;
                form.setFieldsValue(fieldsToUpdate);

                // Force form to re-render when valueType changes
                if ('valueType' in fieldsToUpdate) {
                    form.validateFields(['valueType']).catch(() => {});
                }

                // Use a microtask to ensure the form update completes before resetting the flag
                Promise.resolve().then(() => {
                    isUpdatingRef.current = false;
                });
            }
        }

        // Update the ref for next render
        prevEditModeRef.current = { ...editMode };
    }, [draftValues, form, editMode]);

    // Load dismissal state from storage
    useEffect(() => {
        storage.local.get(['dynamicSourceAlertDismissed'], (result) => {
            if (result.dynamicSourceAlertDismissed) {
                setDynamicSourceAlertDismissed(true);
            }
        });
    }, []);

    // Monitor connection state changes for alert dismissal
    useEffect(() => {
        // Initialize lastConnectionState on first render
        if (lastConnectionState === null) {
            setLastConnectionState(isConnected);
            return;
        }

        // If connection state changed from disconnected to connected
        if (!lastConnectionState && isConnected) {
            // Clear dismissal state when reconnected
            setDynamicSourceAlertDismissed(false);
            storage.local.remove(['dynamicSourceAlertDismissed']);
        }

        setLastConnectionState(isConnected);
    }, [isConnected, lastConnectionState]);

    // Handle form submission
    const handleSubmit = (values) => {
        const isResponse = values.headerType === 'response';
        const isDynamic = values.valueType === 'dynamic';

        // Validate header name - only check for errors, not warnings
        const headerNameValidation = validateHeaderName(values.headerName, isResponse);
        if (!headerNameValidation.valid) {
            message.error(headerNameValidation.message);
            return;
        }
        // Don't show warning here - already shown during typing

        // Use the sanitized header name
        const headerName = headerNameValidation.sanitized || normalizeHeaderName(values.headerName);

        // Validate domains - only check for errors, not warnings
        const domainsValidation = validateDomains(values.domains);
        if (!domainsValidation.valid) {
            message.error(domainsValidation.message);
            return;
        }
        // Don't show warning here - already shown during typing

        // Validate header value if it's static - only check for errors, not warnings
        if (!isDynamic) {
            const validation = validateHeaderValue(values.headerValue, headerName);
            if (!validation.valid) {
                message.error(validation.message);
                return;
            }
            // Don't show warning here - already shown during typing
        } else {
            // For dynamic values, validate the current concatenated result if available
            if (isConnected && values.sourceId) {
                const source = dynamicSources.find(s =>
                    (s.sourceId || s.locationId) === values.sourceId
                );
                if (source) {
                    const dynamicContent = source.sourceContent || source.locationContent || '';
                    const fullValue = `${values.prefix || ''}${dynamicContent}${values.suffix || ''}`;
                    const validation = validateHeaderValue(fullValue, headerName);
                    if (!validation.valid) {
                        message.error(`Dynamic value validation failed: ${validation.message}`);
                        return;
                    }
                    // Don't show warning here - already shown during typing
                }
            }
        }

        // Only show this warning since it's specific to the save action
        if (isDynamic && !isConnected) {
            message.warning('Dynamic source saved but local app is not connected. The value will be empty until reconnected.');
        }

        saveHeaderEntry({
                headerName: headerName,
                headerValue: values.headerValue,
                domains: values.domains,
                isDynamic,
                sourceId: isDynamic ? values.sourceId : null,
                prefix: isDynamic ? values.prefix : '',
                suffix: isDynamic ? values.suffix : '',
                isResponse
            },
            (successMsg) => {
                message.success(successMsg);
            },
            (errorMsg) => message.error(errorMsg)
        );
    };

    // Handle form field changes
    const handleValuesChange = (changedValues) => {
        // Only update draft values if we're not in the middle of a programmatic update
        if (!isUpdatingRef.current && Object.keys(changedValues).length > 0) {
            const transformedValues = { ...changedValues };

            // Transform headerType to isResponse while preserving the original field for form state
            if ('headerType' in changedValues) {
                transformedValues.isResponse = changedValues.headerType === 'response';
                // Don't delete headerType - keep it for form control

                // Update header suggestions when type changes
                const currentHeaderName = form.getFieldValue('headerName');
                if (currentHeaderName) {
                    const isResponse = changedValues.headerType === 'response';
                    const suggestions = getSuggestedHeaders(currentHeaderName, isResponse);
                    setHeaderSuggestions(suggestions);
                }
            }

            updateDraftValues(transformedValues);
        }
    };

    // Handle dynamic source alert dismissal
    const handleDynamicSourceAlertDismiss = () => {
        setDynamicSourceAlertDismissed(true);
        // Save dismissal state to storage
        storage.local.set({ dynamicSourceAlertDismissed: true });
    };

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            onValuesChange={handleValuesChange}
            initialValues={{
                headerName: '',
                headerValue: '',
                domains: [],
                valueType: 'static',
                sourceId: '',
                prefix: '',
                suffix: '',
                headerType: 'request'
            }}
        >
            <Collapse
                size="small"
                activeKey={(editMode.isEditing && editMode.entryId) || uiState?.formCollapsed ? ['add-header'] : []}
                onChange={(keys) => updateUiState && updateUiState({ formCollapsed: keys.includes('add-header') })}
                style={{ marginBottom: 8 }}
                items={[{
                    key: 'add-header',
                    label: editMode.isEditing ? 'Edit Header Rule' : 'Add New Header Rule',
                    children: (
                        <>
                            {/* Show warning if editing a header with unavailable dynamic source */}
                            {editMode.isEditing && draftValues.valueType === 'dynamic' &&
                                (!isConnected || !isCurrentSourceAvailable()) &&
                                !dynamicSourceAlertDismissed && (
                                    <Alert
                                        message="Dynamic Source Unavailable"
                                        description={
                                            !isConnected
                                                ? "The local app is not connected. This header's dynamic value will be empty until the app is reconnected."
                                                : "The selected dynamic source is no longer available. Please select a different source or change to static value."
                                        }
                                        type="warning"
                                        icon={<DisconnectOutlined />}
                                        showIcon
                                        style={{ marginBottom: 12 }}
                                        closable
                                        onClose={handleDynamicSourceAlertDismiss}
                                    />
                                )}

                            {/* Row 1 - Header Name and Direction */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                <Form.Item
                                    label="Header Name"
                                    name="headerName"
                                    rules={[
                                        { required: true, message: 'Please enter a header name' },
                                        {
                                            validator: async (_, value) => {
                                                if (!value) return;

                                                const isResponse = form.getFieldValue('headerType') === 'response';
                                                const validation = validateHeaderName(value, isResponse);

                                                if (!validation.valid) {
                                                    throw new Error(validation.message);
                                                }

                                                if (validation.warning) {
                                                    // Store warning to show after field validation
                                                    setTimeout(() => message.warning(validation.warning), 0);
                                                }
                                            }
                                        }
                                    ]}
                                    style={{ flex: 2, marginBottom: 0 }}
                                    extra={
                                        <span style={{ fontSize: '11px', color: '#8c8c8c' }}>
                                            {draftValues.isResponse
                                                ? 'Examples: Access-Control-Allow-Origin • Set-Cookie • X-Custom-Header'
                                                : 'Examples: Authorization • X-API-Key • X-Custom-Header'
                                            }
                                        </span>
                                    }
                                >
                                    <AutoComplete
                                        options={headerSuggestions.map(h => ({ value: h }))}
                                        onSearch={(value) => {
                                            const isResponse = form.getFieldValue('headerType') === 'response';
                                            const suggestions = getSuggestedHeaders(value, isResponse);
                                            setHeaderSuggestions(suggestions);
                                        }}
                                        placeholder={draftValues.isResponse
                                            ? 'example: X-Custom-Header'
                                            : 'example: Authorization'
                                        }
                                        size="small"
                                        filterOption={false}
                                    />
                                </Form.Item>

                                <Form.Item
                                    label="Direction"
                                    style={{ flex: 1, marginBottom: 0 }}
                                    dependencies={['headerName']}
                                >
                                    {({ getFieldValue }) => {
                                        const headerName = getFieldValue('headerName');
                                        const currentType = getFieldValue('headerType');

                                        // Check if changing direction would make the header invalid
                                        let warningMessage = null;
                                        if (headerName) {
                                            const requestValidation = validateHeaderName(headerName, false);
                                            const responseValidation = validateHeaderName(headerName, true);

                                            if (currentType === 'request' && requestValidation.valid && !responseValidation.valid) {
                                                warningMessage = 'This header cannot be used as a response header';
                                            } else if (currentType === 'response' && responseValidation.valid && !requestValidation.valid) {
                                                warningMessage = 'This header cannot be used as a request header';
                                            }
                                        }

                                        return (
                                            <>
                                                <Form.Item
                                                    name="headerType"
                                                    noStyle
                                                >
                                                    <Radio.Group
                                                        size="small"
                                                        buttonStyle="solid"
                                                        onChange={(e) => {
                                                            // Re-validate header name when direction changes
                                                            if (headerName) {
                                                                form.validateFields(['headerName']);
                                                            }
                                                        }}
                                                    >
                                                        <Radio.Button value="request">Request</Radio.Button>
                                                        <Radio.Button value="response">Response</Radio.Button>
                                                    </Radio.Group>
                                                </Form.Item>
                                                {warningMessage && (
                                                    <div style={{ fontSize: '11px', color: '#ff7875', marginTop: 4 }}>
                                                        {warningMessage}
                                                    </div>
                                                )}
                                            </>
                                        );
                                    }}
                                </Form.Item>
                            </div>

                            {/* Row 2 - Value Type and Value/Source */}
                            <Form.Item dependencies={['valueType']} noStyle>
                                {({ getFieldValue }) => {
                                    const currentValueType = getFieldValue('valueType');

                                    return (
                                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                                            <Form.Item
                                                label="Value Type"
                                                name="valueType"
                                                style={{ minWidth: 195, marginBottom: 0 }}
                                            >
                                                <Select size="small">
                                                    <Option value="static">Static</Option>
                                                    <Option value="dynamic" disabled={!isConnected && !editMode.isEditing}>
                                                        Dynamic {!isConnected && !editMode.isEditing && "(Disconnected)"}
                                                    </Option>
                                                </Select>
                                            </Form.Item>

                                            {currentValueType === 'static' && (
                                                <Form.Item
                                                    label="Header Value"
                                                    name="headerValue"
                                                    rules={[
                                                        {
                                                            required: true,
                                                            message: 'Please enter a header value'
                                                        },
                                                        {
                                                            validator: async (_, value) => {
                                                                if (!value) return; // Let required rule handle empty values

                                                                const headerName = form.getFieldValue('headerName');
                                                                const validation = validateHeaderValue(value, headerName);

                                                                if (!validation.valid) {
                                                                    throw new Error(validation.message);
                                                                }

                                                                if (validation.warning) {
                                                                    // Only show warning for actual issues, not empty values
                                                                    setTimeout(() => message.warning(validation.warning), 0);
                                                                }
                                                            }
                                                        }
                                                    ]}
                                                    style={{ flex: 1, marginBottom: 0 }}
                                                >
                                                    <Input
                                                        placeholder="example: Bearer token123"
                                                        size="small"
                                                        autoComplete="off"
                                                        maxLength={8192}
                                                    />
                                                </Form.Item>
                                            )}

                                            {currentValueType === 'dynamic' && (
                                                <Form.Item
                                                    label="Dynamic Source"
                                                    name="sourceId"
                                                    rules={[{ required: true, message: 'Please select a dynamic source' }]}
                                                    style={{ flex: 1, marginBottom: 0 }}
                                                >
                                                    <Select
                                                        placeholder={
                                                            !isConnected
                                                                ? "No sources available - app disconnected"
                                                                : dynamicSources.length === 0
                                                                    ? "No dynamic sources available"
                                                                    : "Select a dynamic source"
                                                        }
                                                        disabled={!isConnected || dynamicSources.length === 0}
                                                        size="small"
                                                        suffixIcon={!isConnected ? <DisconnectOutlined /> : <ApiOutlined />}
                                                        notFoundContent={
                                                            !isConnected
                                                                ? "Local app is disconnected"
                                                                : "No dynamic sources available"
                                                        }
                                                        optionLabelProp="label"
                                                    >
                                                        {/* Render available sources when connected */}
                                                        {isConnected && dynamicSources.map(source => {
                                                            const displayText = formatSourceDisplay(source);
                                                            return (
                                                                <Option
                                                                    key={source.sourceId || source.locationId}
                                                                    value={source.sourceId || source.locationId}
                                                                    label={displayText}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                        {getSourceIcon(source)}
                                                                        <span>{displayText}</span>
                                                                    </div>
                                                                </Option>
                                                            );
                                                        })}
                                                        {/* Always show an option for the current value when editing */}
                                                        {editMode.isEditing && draftValues.sourceId && (() => {
                                                            const sourceExists = dynamicSources.some(s =>
                                                                (s.sourceId || s.locationId) === draftValues.sourceId
                                                            );

                                                            // Determine the label based on connection state and source availability
                                                            let label = '';
                                                            let displayText = '';

                                                            if (!isConnected) {
                                                                // When disconnected, we can't know if source exists
                                                                label = 'App disconnected';
                                                                displayText = 'App disconnected';
                                                            } else if (!sourceExists) {
                                                                // Connected but source doesn't exist
                                                                label = `Source #${draftValues.sourceId} (removed)`;
                                                                displayText = `Source #${draftValues.sourceId} (removed)`;
                                                            } else {
                                                                // Connected and source exists - no need for special option
                                                                return null;
                                                            }

                                                            return (
                                                                <Option
                                                                    key={draftValues.sourceId}
                                                                    value={draftValues.sourceId}
                                                                    disabled
                                                                    label={label}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', color: '#ff4d4f' }}>
                                                                        {!isConnected ?
                                                                            <DisconnectOutlined style={{ marginRight: 4 }} /> :
                                                                            <WarningOutlined style={{ marginRight: 4 }} />
                                                                        }
                                                                        <span>{displayText}</span>
                                                                    </div>
                                                                </Option>
                                                            );
                                                        })()}
                                                    </Select>
                                                </Form.Item>
                                            )}
                                        </div>
                                    );
                                }}
                            </Form.Item>

                            {/* Row 3 - Value Format (only for dynamic) */}
                            <Form.Item dependencies={['valueType']} noStyle>
                                {({ getFieldValue }) =>
                                    getFieldValue('valueType') === 'dynamic' && (
                                        <div style={{ marginBottom: 8 }}>
                                            <Form.Item
                                                label="Value Format"
                                                style={{ marginBottom: 4 }}
                                            >
                                                <div style={{
                                                    fontSize: '12px',
                                                    color: '#8c8c8c',
                                                    marginBottom: '8px',
                                                    lineHeight: '1.5'
                                                }}>
                                                    Final value is concatenated directly: prefix+source_value+suffix<br />
                                                    Example: for "Bearer token123", type "Bearer " (with space) in prefix
                                                    {!isConnected && (
                                                        <div style={{ color: '#ff7875', marginTop: 4 }}>
                                                            <WarningOutlined /> Dynamic value will be empty until local app is connected
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    backgroundColor: '#f5f5f5',
                                                    borderRadius: '6px',
                                                    padding: '4px',
                                                    border: '1px solid #e8e9ea'
                                                }}>
                                                    <Form.Item
                                                        name="prefix"
                                                        style={{ flex: 1, marginBottom: 0, marginRight: -1 }}
                                                        rules={[
                                                            {
                                                                validator: async (_, value) => {
                                                                    if (!value) return; // Prefix is optional

                                                                    // Check for null bytes
                                                                    if (value.includes('\0')) {
                                                                        throw new Error('Prefix cannot contain null bytes');
                                                                    }

                                                                    // Check for line breaks
                                                                    if (/[\r\n]/.test(value)) {
                                                                        throw new Error('Prefix cannot contain line breaks');
                                                                    }

                                                                    // Check for control characters (except tab)
                                                                    if (/[\x00-\x08\x0A-\x1F\x7F]/.test(value)) {
                                                                        throw new Error('Prefix contains invalid control characters');
                                                                    }

                                                                    if (value.length > 1000) {
                                                                        throw new Error('Prefix is too long (max 1000 characters)');
                                                                    }

                                                                    // Warn about non-ASCII characters
                                                                    if (/[\x80-\xFF]/.test(value)) {
                                                                        setTimeout(() => message.warning('Prefix contains non-ASCII characters that may cause compatibility issues'), 0);
                                                                    }
                                                                }
                                                            }
                                                        ]}
                                                    >
                                                        <Input
                                                            placeholder="Prefix (optional)"
                                                            size="small"
                                                            style={{
                                                                borderRadius: '4px 0 0 4px',
                                                                borderRight: 'none',
                                                                textAlign: 'right'
                                                            }}
                                                            maxLength={1000}
                                                        />
                                                    </Form.Item>

                                                    <div style={{
                                                        padding: '4px 12px',
                                                        backgroundColor: '#f0f0f0',
                                                        border: '1px solid #d9d9d9',
                                                        color: '#8c8c8c',
                                                        fontSize: '13px',
                                                        fontWeight: 500,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        height: '32px',
                                                        boxSizing: 'border-box',
                                                        zIndex: 1,
                                                        fontStyle: 'italic'
                                                    }}>
                                                        {'{source_value}'}
                                                    </div>

                                                    <Form.Item
                                                        name="suffix"
                                                        style={{ flex: 1, marginBottom: 0, marginLeft: -1 }}
                                                        rules={[
                                                            {
                                                                validator: async (_, value) => {
                                                                    if (!value) return; // Suffix is optional

                                                                    // Check for null bytes
                                                                    if (value.includes('\0')) {
                                                                        throw new Error('Suffix cannot contain null bytes');
                                                                    }

                                                                    // Check for line breaks
                                                                    if (/[\r\n]/.test(value)) {
                                                                        throw new Error('Suffix cannot contain line breaks');
                                                                    }

                                                                    // Check for control characters (except tab)
                                                                    if (/[\x00-\x08\x0A-\x1F\x7F]/.test(value)) {
                                                                        throw new Error('Suffix contains invalid control characters');
                                                                    }

                                                                    if (value.length > 1000) {
                                                                        throw new Error('Suffix is too long (max 1000 characters)');
                                                                    }

                                                                    // Warn about non-ASCII characters
                                                                    if (/[\x80-\xFF]/.test(value)) {
                                                                        setTimeout(() => message.warning('Suffix contains non-ASCII characters that may cause compatibility issues'), 0);
                                                                    }
                                                                }
                                                            }
                                                        ]}
                                                    >
                                                        <Input
                                                            placeholder="Suffix (optional)"
                                                            size="small"
                                                            style={{
                                                                borderRadius: '0 4px 4px 0',
                                                                borderLeft: 'none'
                                                            }}
                                                            maxLength={1000}
                                                        />
                                                    </Form.Item>
                                                </div>
                                            </Form.Item>
                                        </div>
                                    )
                                }
                            </Form.Item>

                            {/* Row 4 - Domains */}
                            <Form.Item
                                label="Domains"
                                name="domains"
                                rules={[{
                                    required: true,
                                    validator: (_, value) => {
                                        if (!value || value.length === 0) {
                                            return Promise.reject('Please add at least one domain pattern');
                                        }
                                        return Promise.resolve();
                                    }
                                }]}
                                style={{ marginBottom: 12, marginTop: 4 }}
                            >
                                <DomainTags />
                            </Form.Item>

                            {/* Row 5 - Action Buttons */}
                            <Form.Item style={{ marginBottom: 0 }}>
                                <Space style={{ width: '100%', justifyContent: 'center' }}>
                                    {editMode.isEditing && (
                                        <Button
                                            onClick={cancelEditing}
                                            icon={<CloseOutlined />}
                                            size="small"
                                            style={{ minWidth: 100 }}
                                        >
                                            Cancel
                                        </Button>
                                    )}

                                    <Button
                                        type="primary"
                                        htmlType="submit"
                                        icon={<SaveOutlined />}
                                        size="small"
                                        style={{ minWidth: 100 }}
                                    >
                                        {editMode.isEditing ? 'Update' : 'Create'}
                                    </Button>
                                </Space>
                            </Form.Item>
                        </>
                    )
                }]}
            />
        </Form>
    );
};

export default HeaderForm;