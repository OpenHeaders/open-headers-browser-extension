import React, { useState, useRef, useEffect } from 'react';
import { Tag, Input, Tooltip, Space } from 'antd';
import { PlusOutlined, CloseOutlined } from '@ant-design/icons';

/**
 * Professional domain tags component for managing multiple domain patterns
 */
const DomainTags = ({ value = [], onChange }) => {
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
    
    // Remove protocol if present (http://, https://, etc.)
    domain = domain.replace(/^https?:\/\//, '');
    
    // Remove trailing slashes and paths
    domain = domain.split('/')[0];
    
    // Return the domain as-is without auto-adding /*
    return domain;
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
      {/* Always visible help text */}
      <div style={{ 
        fontSize: 12,
        color: '#8c8c8c',
        marginBottom: 8,
        lineHeight: 1
      }}>
        Separate multiple domains with Enter or comma. Use * as wildcard.
      </div>
      
      {/* Domain tags and input */}
      <div style={{ 
        border: '1px solid #d9d9d9',
        borderRadius: 6,
        padding: '8px 12px',
        minHeight: 32,
        background: '#ffffff'
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
                  background: 'rgba(66, 133, 244, 0.08)',
                  border: '1px solid rgba(66, 133, 244, 0.2)',
                  color: '#4285F4',
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
                boxShadow: 'none'
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
                border: '1px dashed rgba(0, 0, 0, 0.3)',
                borderRadius: 4,
                cursor: 'pointer',
                padding: '2px 8px',
                fontSize: 12,
                color: '#6e6e73',
                height: 24,
                lineHeight: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#1890ff';
                e.target.style.color = '#1890ff';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = 'rgba(0, 0, 0, 0.3)';
                e.target.style.color = '#6e6e73';
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