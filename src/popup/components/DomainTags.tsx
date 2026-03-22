import React, { useState, useRef, useEffect } from 'react';
import { Tag, Input, Tooltip, Space, App, Button } from 'antd';
import { PlusOutlined, CloseOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { validateDomain } from '../../utils/header-validator';
import type { InputRef } from 'antd';

interface DomainTagsProps {
  value?: string[];
  onChange?: (tags: string[]) => void;
}

const DomainTags: React.FC<DomainTagsProps> = ({ value = [], onChange }) => {
  const { message } = App.useApp();
  const [inputVisible, setInputVisible] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [editInputIndex, setEditInputIndex] = useState(-1);
  const [editInputValue, setEditInputValue] = useState('');

  const inputRef = useRef<InputRef>(null);
  const editInputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (inputVisible) {
      inputRef.current?.focus();
    }
  }, [inputVisible]);

  useEffect(() => {
    if (editInputIndex > -1) {
      editInputRef.current?.focus();
    }
  }, [editInputIndex]);

  const handleClose = (removedTag: string): void => {
    const newTags = value.filter(tag => tag !== removedTag);
    onChange?.(newTags);
  };

  const handleCopyDomains = async (): Promise<void> => {
    if (value.length === 0) {
      message.warning('No domains to copy');
      return;
    }

    const domainsText = value.join(',');

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(domainsText);
        message.success(`Copied ${value.length} domain${value.length > 1 ? 's' : ''} to clipboard`);
      } else {
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

  const handleDeleteAllDomains = (): void => {
    if (value.length === 0) {
      message.warning('No domains to delete');
      return;
    }

    onChange?.([]);
    message.success(`Deleted ${value.length} domain${value.length > 1 ? 's' : ''}`);
  };

  const showInput = (): void => {
    setInputVisible(true);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>): void => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');

    if (pastedText.includes(',')) {
      const parts = pastedText.split(',').map(part => part.trim()).filter(Boolean);
      const domains: string[] = [];

      for (const part of parts) {
        const domain = processSingleDomain(part);
        if (domain) {
          domains.push(domain);
        }
      }

      if (domains.length > 0) {
        const newTags = [...new Set([...value, ...domains])];
        onChange?.(newTags);
      }

      setInputValue('');

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setInputValue(inputValue + pastedText);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const val = e.target.value;

    if (val.includes(',')) {
      const parts = val.split(',');
      const domains: string[] = [];

      for (let i = 0; i < parts.length - 1; i++) {
        const domain = processSingleDomain(parts[i]);
        if (domain) {
          domains.push(domain);
        }
      }

      if (domains.length > 0) {
        const newTags = [...new Set([...value, ...domains])];
        onChange?.(newTags);
      }

      const remainingValue = parts[parts.length - 1];
      setInputValue(remainingValue);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    } else {
      setInputValue(val);
    }
  };

  const processSingleDomain = (input: string): string => {
    if (!input) return '';

    let domain = input.trim().replace(/^["']|["']$/g, '');

    const validation = validateDomain(domain);
    if (!validation.valid) {
      message.error(validation.message);
      return '';
    }

    if (validation.warning) {
      message.warning(validation.warning);
    }

    return validation.sanitized || domain;
  };

  const handleInputConfirm = (): void => {
    const domain = processSingleDomain(inputValue);

    if (domain) {
      const newTags = [...new Set([...value, domain])];
      onChange?.(newTags);
    }

    setInputVisible(false);
    setInputValue('');
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setEditInputValue(e.target.value);
  };

  const handleEditInputConfirm = (): void => {
    const newTags = [...value];
    newTags[editInputIndex] = editInputValue;

    onChange?.(newTags.filter(Boolean));
    setEditInputIndex(-1);
    setEditInputValue('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleInputConfirm();
    } else if (e.key === 'Escape') {
      setInputVisible(false);
      setInputValue('');
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      e.preventDefault();
      const removedDomain = value[value.length - 1];
      const newTags = value.slice(0, -1);
      onChange?.(newTags);

      message.info(`Removed domain: ${removedDomain}`, 1);

      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleEditKeyPress = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleEditInputConfirm();
    } else if (e.key === 'Escape') {
      setEditInputIndex(-1);
      setEditInputValue('');
    }
  };

  return (
      <div className="professional-domain-tags">
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
            Examples: localhost:3001 &bull; example.com &bull; *.example.com &bull; *://example.com/* &bull; 192.168.1.1
          </div>
          {value.length > 0 && (
            <Space size={4}>
              <Tooltip title="Copy all domains as comma-separated values">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopyDomains}
                  style={{ fontSize: 11, height: 22, marginLeft: 8 }}
                >
                  Copy all
                </Button>
              </Tooltip>
              <Tooltip title="Delete all domains">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleDeleteAllDomains}
                  style={{ fontSize: 11, height: 22 }}
                >
                  Delete all
                </Button>
              </Tooltip>
            </Space>
          )}
        </div>

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
                      onClose={(e: React.MouseEvent) => {
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
                    onClick={(e: React.MouseEvent) => {
                      setEditInputIndex(index);
                      setEditInputValue(tag);
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    title="Click to edit"
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
                    placeholder="Type domain and press Enter or comma ,"
                    style={{
                      width: 280,
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
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#1890ff';
                      (e.currentTarget as HTMLButtonElement).style.color = '#1890ff';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-color)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
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
