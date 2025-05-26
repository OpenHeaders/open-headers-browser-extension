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
  App
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
  CodeSandboxOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { normalizeHeaderName } from '../../utils/utils';
import { validateHeaderValue } from '../../utils/header-validator';
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
  
  // Add path
  if (path) {
    display += path;
  } else {
    // Fallback to source ID if no path
    display += `Source ${source.sourceId || source.locationId}`;
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
  
  const { 
    dynamicSources = [], 
    draftValues = {}, 
    editMode = { isEditing: false, entryId: null }, 
    uiState = { formCollapsed: false },
    saveHeaderEntry, 
    cancelEditing, 
    updateDraftValues,
    updateUiState
  } = useHeader();
  
  // Update form values when draft values change
  useEffect(() => {
    if (isUpdatingRef.current) {
      return; // Skip if we're in the middle of a programmatic update
    }
    
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
    
    // Only update fields that have actually changed to avoid focus loss
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
      // Use a microtask to ensure the form update completes before resetting the flag
      Promise.resolve().then(() => {
        isUpdatingRef.current = false;
      });
    }
  }, [draftValues, form]);
  
  // Close collapse when editing ends
  useEffect(() => {
    if (!editMode.isEditing && updateUiState) {
      updateUiState({ formCollapsed: false });
    }
  }, [editMode.isEditing, updateUiState]);
  
  // Handle form submission
  const handleSubmit = (values) => {
    const isResponse = values.headerType === 'response';
    const isDynamic = values.valueType === 'dynamic';
    
    // Validate header value if it's static
    if (!isDynamic) {
      const validation = validateHeaderValue(values.headerValue);
      if (!validation.valid) {
        message.warning(validation.message);
      }
    }
    
    saveHeaderEntry({
      headerName: normalizeHeaderName(values.headerName),
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
      updateUiState && updateUiState({ formCollapsed: false }); // Close collapse after successful save
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
      }
      
      updateDraftValues(transformedValues);
    }
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
        activeKey={editMode.isEditing || uiState?.formCollapsed ? ['add-header'] : []}
        onChange={(keys) => updateUiState && updateUiState({ formCollapsed: keys.includes('add-header') })}
        style={{ marginBottom: 8 }}
        items={[{
          key: 'add-header',
          label: editMode.isEditing ? 'Edit Header Rule' : 'Add New Header Rule',
          children: (
            <>
              {/* Row 1 - Header Name and Direction */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                <Form.Item
                  label="Header Name"
                  name="headerName"
                  rules={[{ required: true, message: 'Please enter a header name' }]}
                  style={{ flex: 2, marginBottom: 0 }}
                >
                  <Input placeholder="e.g. Authorization" size="small" />
                </Form.Item>
                
                <Form.Item
                  label="Direction"
                  name="headerType"
                  style={{ flex: 1, marginBottom: 0 }}
                >
                  <Radio.Group size="small" buttonStyle="solid">
                    <Radio.Button value="request">Request</Radio.Button>
                    <Radio.Button value="response">Response</Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </div>
              
              {/* Row 2 - Value Type and Value/Source */}
              <Form.Item dependencies={['valueType']}>
                {({ getFieldValue }) => (
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                    <Form.Item
                      label="Value Type"
                      name="valueType"
                      style={{ minWidth: 120, marginBottom: 0 }}
                    >
                      <Select size="small">
                        <Option value="static">Static</Option>
                        <Option value="dynamic">Dynamic</Option>
                      </Select>
                    </Form.Item>
                    
                    {getFieldValue('valueType') === 'static' && (
                      <Form.Item
                        label="Header Value"
                        name="headerValue"
                        rules={[{ required: true, message: 'Please enter a header value' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Input placeholder="e.g. Bearer token123" size="small" />
                      </Form.Item>
                    )}
                    
                    {getFieldValue('valueType') === 'dynamic' && (
                      <Form.Item
                        label="Dynamic Source"
                        name="sourceId"
                        rules={[{ required: true, message: 'Please select a dynamic source' }]}
                        style={{ flex: 1, marginBottom: 0 }}
                      >
                        <Select 
                          placeholder="Select a dynamic source"
                          disabled={dynamicSources.length === 0}
                          size="small"
                          suffixIcon={<ApiOutlined />}
                        >
                          {dynamicSources.map(source => (
                            <Option 
                              key={source.sourceId || source.locationId} 
                              value={source.sourceId || source.locationId}
                            >
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                                {getSourceIcon(source)}
                                <span>{formatSourceDisplay(source)}</span>
                              </div>
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    )}
                  </div>
                )}
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
                          >
                            <Input 
                              placeholder="Prefix (optional)" 
                              size="small" 
                              style={{ 
                                borderRadius: '4px 0 0 4px',
                                borderRight: 'none',
                                textAlign: 'right'
                              }}
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
                          >
                            <Input 
                              placeholder="Suffix (optional)" 
                              size="small" 
                              style={{ 
                                borderRadius: '0 4px 4px 0',
                                borderLeft: 'none'
                              }}
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
                    {editMode.isEditing ? 'Create' : 'Save'}
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