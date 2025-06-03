import React, { useState, useRef, useEffect } from 'react';
import { Tag, Input, Tooltip, Space, App, Button } from 'antd';
import { PlusOutlined, CloseOutlined, CopyOutlined } from '@ant-design/icons';
import { validateDomain } from '../../utils/header-validator';

/**
 * Professional domain tags component for managing multiple domain patterns
 */
const DomainTags = ({ value = [], onChange }) => {
  const { message } = App.useApp();
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [editInputIndex, setEditInputIndex] = useState(-1);
  const [editInputValue, setEditInputValue] = useState('');

  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  // Focus the input when it becomes visible
  useEffect(() => {
    if (inputVisible) {
      inputRef.current?.focus();
    }
  }, [inputVisible]);

  // Focus the edit input when editing a tag
  useEffect(() => {
    if (editInputIndex > -1) {
      editInputRef.current?.focus();
    }
  }, [editInputIndex]);

  // Handle removing a tag
  const handleClose = (removedTag) => {
    const newTags = value.filter(tag => tag !== removedTag);
    onChange?.(newTags);
  };

  // Handle copying all domains
  const handleCopyDomains = async () => {
    if (value.length === 0) {
      message.warning('No domains to copy');
      return;
    }
    
    const domainsText = value.join(',');
    
    try {
      // Check if clipboard API is available (requires HTTPS in most browsers)
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(domainsText);
        message.success(`Copied ${value.length} domain${value.length > 1 ? 's' : ''} to clipboard`);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = domainsText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
          message.success(`Copied ${value.length} domain${value.length > 1 ? 's' : ''} to clipboard`);
        } catch (err) {
          message.error('Failed to copy domains');
        } finally {
          textArea.remove();
        }
      }
    } catch (err) {
      message.error('Failed to copy domains');
    }
  };

  // Show the input for adding a new tag
  const showInput = () => {
    setInputVisible(true);
  };

  // Handle paste events specifically 
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.includes(',')) {
      // Split by comma and process ALL parts for paste
      const parts = pastedText.split(',').map(part => part.trim()).filter(Boolean);
      const domains = [];

      // Process ALL parts when pasting
      for (const part of parts) {
        const domain = processSingleDomain(part);
        if (domain) {
          domains.push(domain);
        }
      }

      // Add all domains to the list
      if (domains.length > 0) {
        const newTags = [...new Set([...value, ...domains])];
        onChange?.(newTags);
      }

      // Clear the input completely after paste
      setInputValue('');

      // Ensure input stays focused
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      // Single domain paste - append to current input value
      setInputValue(inputValue + pastedText);
    }
  };

  // Handle input change with immediate comma detection (for typing)
  const handleInputChange = (e) => {
    const inputValue = e.target.value;

    // Check if user typed a comma (not paste)
    if (inputValue.includes(',')) {
      // Split by comma and process each part
      const parts = inputValue.split(',');
      const domains = [];

      // Process all parts except the last one (which might be incomplete)
      for (let i = 0; i < parts.length - 1; i++) {
        const domain = processSingleDomain(parts[i]);
        if (domain) {
          domains.push(domain);
        }
      }

      // Add valid domains to the list
      if (domains.length > 0) {
        const newTags = [...new Set([...value, ...domains])];
        onChange?.(newTags);
      }

      // Keep the last part as the new input value
      const remainingValue = parts[parts.length - 1];
      setInputValue(remainingValue);

      // Ensure input stays focused after adding domains
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setInputValue(inputValue);
    }
  };

  // Process an input value into one domain (single domain processing)
  const processSingleDomain = (input) => {
    if (!input) return '';

    // Remove leading/trailing whitespace and quotes
    let domain = input.trim().replace(/^["']|["']$/g, '');

    // Validate the domain
    const validation = validateDomain(domain);
    if (!validation.valid) {
      message.error(validation.message);
      return '';
    }

    if (validation.warning) {
      message.warning(validation.warning);
    }

    // Return the sanitized domain
    return validation.sanitized || domain;
  };

  // Handle input confirm (when Enter is pressed or input loses focus)
  const handleInputConfirm = () => {
    // Process the current input value as a single domain
    const domain = processSingleDomain(inputValue);

    if (domain) {
      // Add the new domain to the existing ones (without duplicates)
      const newTags = [...new Set([...value, domain])];
      onChange?.(newTags);
    }

    // Reset the input
    setInputVisible(false);
    setInputValue('');
  };

  // Handle editing a tag
  const handleEditInputChange = (e) => {
    setEditInputValue(e.target.value);
  };

  // Handle edit confirm (when Enter is pressed or input loses focus)
  const handleEditInputConfirm = () => {
    const newTags = [...value];
    newTags[editInputIndex] = editInputValue;

    onChange?.(newTags.filter(Boolean)); // Remove empty values
    setEditInputIndex(-1);
    setEditInputValue('');
  };

  // Handle key press events
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleInputConfirm();
    } else if (e.key === 'Escape') {
      setInputVisible(false);
      setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      // If backspace is pressed and input is empty, remove the last domain
      e.preventDefault(); // Prevent default backspace behavior
      const removedDomain = value[value.length - 1];
      const newTags = value.slice(0, -1);
      onChange?.(newTags);
      
      // Show a subtle message about the deletion
      message.info(`Removed domain: ${removedDomain}`, 1);
      
      // Keep the input focused
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleEditKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleEditInputConfirm();
    } else if (e.key === 'Escape') {
      setEditInputIndex(-1);
      setEditInputValue('');
    }
  };

  return (
      <div className="professional-domain-tags">
        {/* Always visible help text and copy button */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8
        }}>
          <div style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            lineHeight: 1.4,
            flex: 1
          }}>
            Separate multiple domains with Enter or comma. Use * as wildcard. Press Backspace to delete last domain.<br/>
            Examples: localhost:3001 • example.com • *.example.com • *://example.com/* • 192.168.1.1
          </div>
          {value.length > 0 && (
            <Tooltip title="Copy all domains as comma-separated values">
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleCopyDomains}
                style={{
                  fontSize: 11,
                  height: 22,
                  marginLeft: 8
                }}
              >
                Copy
              </Button>
            </Tooltip>
          )}
        </div>

        {/* Domain tags and input */}
        <div style={{
          border: '1px solid var(--border-color)',
          borderRadius: 6,
          padding: '8px 12px',
          minHeight: 32,
          background: 'var(--bg-input)'
        }}>
          <Space wrap size={[8, 8]} style={{ width: '100%' }}>
            {value.map((tag, index) => {
              if (editInputIndex === index) {
                return (
                    <Input
                        ref={editInputRef}
                        key={`edit-${tag}`}
                        size="small"
                        style={{
                          width: Math.max(80, tag.length * 8 + 20),
                          height: 24,
                          borderRadius: 4
                        }}
                        value={editInputValue}
                        onChange={handleEditInputChange}
                        onBlur={handleEditInputConfirm}
                        onKeyDown={handleEditKeyPress}
                    />
                );
              }

              const isLongTag = tag.length > 24;
              const displayTag = isLongTag ? `${tag.slice(0, 24)}...` : tag;

              const tagElement = (
                  <Tag
                      key={tag}
                      closable
                      closeIcon={<CloseOutlined style={{ fontSize: 10 }} />}
                      onClose={(e) => {
                        e.preventDefault();
                        handleClose(tag);
                      }}
                      style={{
                        userSelect: 'none',
                        margin: 0,
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 12,
                        cursor: 'pointer',
                        height: 24,
                        lineHeight: '20px'
                      }}
                  >
                <span
                    onDoubleClick={(e) => {
                      setEditInputIndex(index);
                      setEditInputValue(tag);
                      e.preventDefault();
                    }}
                    title="Double-click to edit"
                >
                  {displayTag}
                </span>
                  </Tag>
              );

              return isLongTag ? (
                  <Tooltip title={tag} key={tag}>
                    {tagElement}
                  </Tooltip>
              ) : (
                  tagElement
              );
            })}

            {inputVisible ? (
                <Input
                    ref={inputRef}
                    type="text"
                    size="small"
                    placeholder="Type domain and press Enter or comma"
                    style={{
                      width: 200,
                      height: 24,
                      borderRadius: 4,
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)'
                    }}
                    value={inputValue}
                    onChange={handleInputChange}
                    onPaste={handlePaste}
                    onBlur={handleInputConfirm}
                    onKeyDown={handleKeyPress}
                />
            ) : (
                <button
                    onClick={showInput}
                    style={{
                      background: 'none',
                      border: '1px dashed var(--border-color)',
                      borderRadius: 4,
                      cursor: 'pointer',
                      padding: '2px 8px',
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      height: 24,
                      lineHeight: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#1890ff';
                      e.currentTarget.style.color = '#1890ff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                >
                  <PlusOutlined style={{ fontSize: 10 }} />
                  Add Domain
                </button>
            )}
          </Space>
        </div>
      </div>
  );
};

export default DomainTags;