import React, { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Switch,
  Tooltip,
  Input,
  Typography,
  Empty,
  App,
  Dropdown
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  FileTextOutlined,
  DisconnectOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
  DownOutlined,
  SwapOutlined,
  ApiOutlined,
  LinkOutlined,
  StopOutlined,
  MoreOutlined,
  FileProtectOutlined,
  SendOutlined,
  CodeOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { getAppLauncher } from '../../utils/app-launcher';

const { Search } = Input;
const { Text, Paragraph } = Typography;

/**
 * Professional table component for displaying header entries
 */
const HeaderTable = () => {
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();

  const {
    headerEntries,
    dynamicSources,
    isConnected,
    rulesFromApp,
    uiState,
    updateUiState
  } = useHeader();

  // Initialize local state from context
  const [searchText, setSearchText] = useState(uiState?.tableState?.searchText || '');
  const [filteredInfo, setFilteredInfo] = useState(uiState?.tableState?.filteredInfo || {});
  const [sortedInfo, setSortedInfo] = useState(uiState?.tableState?.sortedInfo || {});

  // Sync local state with context state when context changes
  useEffect(() => {
    if (uiState?.tableState) {
      setSearchText(uiState.tableState.searchText || '');
      setFilteredInfo(uiState.tableState.filteredInfo || {});
      setSortedInfo(uiState.tableState.sortedInfo || {});
    }
  }, [uiState?.tableState]);

  // Convert header entries object to array for table
  const dataSource = Object.entries(headerEntries).map(([id, entry]) => {
    const dynamicInfo = getDynamicValueInfo(entry, dynamicSources, isConnected);
    return {
      key: id,
      id,
      headerName: entry.headerName,
      headerValue: entry.headerValue,
      domains: entry.domains || [],
      isDynamic: entry.isDynamic,
      sourceId: entry.sourceId,
      prefix: entry.prefix || '',
      suffix: entry.suffix || '',
      isResponse: entry.isResponse,
      isEnabled: entry.isEnabled !== false,
      dynamicValue: dynamicInfo.value,
      sourceInfo: dynamicInfo.sourceInfo,
      sourceTag: dynamicInfo.sourceTag,
      sourceAvailable: dynamicInfo.available,
      sourceConnected: dynamicInfo.connected,
      placeholderType: dynamicInfo.placeholderType,
      actualValue: dynamicInfo.actualValue,
      tag: entry.tag || '' // Add the actual tag from the header rule
    };
  });

  // Filter data based on search
  const filteredData = dataSource.filter(item =>
      item.headerName.toLowerCase().includes(searchText.toLowerCase()) ||
      item.domains.some(domain => domain.toLowerCase().includes(searchText.toLowerCase())) ||
      item.actualValue.toLowerCase().includes(searchText.toLowerCase()) ||
      item.tag.toLowerCase().includes(searchText.toLowerCase())
  );

  // Count enabled rules
  const enabledCount = dataSource.filter(item => item.isEnabled).length;
  const totalCount = dataSource.length;

  // Get dynamic value and source info for an entry
  function getDynamicValueInfo(entry, sources, connected) {
    if (!entry.isDynamic || !entry.sourceId) {
      // Check if this is an empty static value
      if (!entry.headerValue || !entry.headerValue.trim()) {
        return {
          value: entry.headerValue,
          sourceInfo: '',
          sourceTag: '',
          available: true,
          connected: true,
          placeholderType: 'empty_value',
          actualValue: '[EMPTY_VALUE]' // Display placeholder in UI
        };
      }
      
      return {
        value: entry.headerValue,
        sourceInfo: '',
        sourceTag: '',
        available: true,
        connected: true,
        placeholderType: null,
        actualValue: entry.headerValue
      };
    }

    let placeholderType = null;
    let actualValue = '';

    if (!connected) {
      actualValue = '[APP_DISCONNECTED]';
      placeholderType = 'app_disconnected';
      return {
        value: actualValue,
        sourceInfo: 'App disconnected',
        sourceTag: '',
        available: false,
        connected: false,
        placeholderType,
        actualValue
      };
    }

    const source = sources.find(s =>
        (s.sourceId?.toString() === entry.sourceId?.toString()) ||
        (s.locationId?.toString() === entry.sourceId?.toString())
    );

    if (!source) {
      actualValue = `[SOURCE_NOT_FOUND:${entry.sourceId}]`;
      placeholderType = 'source_not_found';
      return {
        value: actualValue,
        sourceInfo: `Source #${entry.sourceId} (removed)`,
        sourceTag: '',
        available: false,
        connected: true,
        placeholderType,
        actualValue
      };
    }

    const content = source.sourceContent || source.locationContent || '';

    if (!content) {
      actualValue = `[EMPTY_SOURCE:${entry.sourceId}]`;
      placeholderType = 'empty_source';
    } else {
      actualValue = `${entry.prefix || ''}${content}${entry.suffix || ''}`;
    }

    // Separate source tag and source path
    const sourceTag = source.sourceTag || source.locationTag || '';
    const sourcePath = source.sourcePath || source.locationPath || source.sourceUrl || source.locationUrl || '';

    // Prefix env variables with $ for clarity
    const sourceType = source.sourceType || source.locationType || '';
    const displayPath = sourceType.toLowerCase().includes('env') && sourcePath && !sourcePath.startsWith('$')
        ? `$${sourcePath}`
        : sourcePath;

    return {
      value: actualValue,
      sourceInfo: displayPath,
      sourceTag,
      available: true,
      connected: true,
      placeholderType,
      actualValue
    };
  }

  // Handle table changes (pagination, filters, sorter)
  const handleChange = (pagination, filters, sorter) => {
    setFilteredInfo(filters);
    setSortedInfo(sorter);

    // Update context state for persistence
    if (updateUiState) {
      updateUiState({
        tableState: {
          searchText,
          filteredInfo: filters,
          sortedInfo: sorter
        }
      });
    }
  };

  // Handle search text changes
  const handleSearchChange = (value) => {
    setSearchText(value);

    // Update context state for persistence
    if (updateUiState) {
      updateUiState({
        tableState: {
          searchText: value,
          filteredInfo,
          sortedInfo
        }
      });
    }
  };

  // Clear all filters and sorting
  const clearAll = () => {
    const clearedState = {
      searchText: '',
      filteredInfo: {},
      sortedInfo: {}
    };

    setSearchText('');
    setFilteredInfo({});
    setSortedInfo({});

    // Update context state for persistence
    if (updateUiState) {
      updateUiState({
        tableState: clearedState
      });
    }
  };

  const columns = [
    {
      title: 'Header Name',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 160,
      fixed: 'left',
      sorter: (a, b) => a.headerName.localeCompare(b.headerName),
      filters: [...new Set(dataSource.map(item => item.headerName))].map(name => ({
        text: name,
        value: name,
      })),
      filteredValue: filteredInfo.headerName || null,
      filterSearch: true,
      onFilter: (value, record) => record.headerName === value,
      sortOrder: sortedInfo.columnKey === 'headerName' ? sortedInfo.order : null,
      render: (text, record) => {
        const hasPlaceholder = record.placeholderType && record.isEnabled;

        return (
            <Space align="center">
              <Text strong style={{ fontSize: '13px' }}>{text}</Text>
              {hasPlaceholder && (
                  <Tooltip title="This header is being sent with a diagnostic placeholder value">
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />
                  </Tooltip>
              )}
            </Space>
        );
      },
    },
    {
      title: 'Value',
      dataIndex: 'actualValue',
      key: 'actualValue',
      width: 200,
      sorter: (a, b) => {
        const valueA = a.actualValue || '';
        const valueB = b.actualValue || '';
        return valueA.localeCompare(valueB);
      },
      sortOrder: sortedInfo.columnKey === 'actualValue' ? sortedInfo.order : null,
      render: (text, record) => {
        const hasPlaceholder = record.placeholderType;

        // Determine tooltip based on placeholder type
        let tooltipMessage = null;
        let textColor = undefined;
        let icon = null;

        if (hasPlaceholder) {
          switch (record.placeholderType) {
            case 'app_disconnected':
              tooltipMessage = "Sending '[APP_DISCONNECTED]' because the local app is not connected";
              textColor = "warning";
              icon = <DisconnectOutlined style={{ marginRight: 4 }} />;
              break;
            case 'source_not_found':
              tooltipMessage = `Sending '[SOURCE_NOT_FOUND:${record.sourceId}]' because the source was deleted`;
              textColor = "danger";
              icon = <WarningOutlined style={{ marginRight: 4 }} />;
              break;
            case 'empty_source':
              tooltipMessage = `Sending '[EMPTY_SOURCE:${record.sourceId}]' because the source value is empty`;
              textColor = "secondary";
              icon = <ExclamationCircleOutlined style={{ marginRight: 4 }} />;
              break;
            case 'empty_value':
              tooltipMessage = "Sending '[EMPTY_VALUE]' because the header value is empty";
              textColor = "secondary";
              icon = <ExclamationCircleOutlined style={{ marginRight: 4 }} />;
              break;
          }
        }

        // Trim long values: show first 10 chars ... last 5 chars
        let displayValue = text || '';
        const shouldTrim = !hasPlaceholder && displayValue.length > 20;
        if (shouldTrim) {
          displayValue = `${displayValue.substring(0, 10)}...${displayValue.substring(displayValue.length - 5)}`;
        }

        // Only show tooltip for placeholder messages
        const tooltipContent = hasPlaceholder ? tooltipMessage : null;

        const content = (
          <Text
              type={textColor}
              style={{
                display: 'block',
                fontSize: '13px',
                fontFamily: hasPlaceholder ? 'monospace' : 'inherit',
                opacity: record.isEnabled ? 1 : 0.5,
                cursor: hasPlaceholder ? 'help' : 'default'
              }}
          >
            {icon}
            {displayValue}
          </Text>
        );

        return tooltipContent ? (
            <Tooltip title={tooltipContent}>
              {content}
            </Tooltip>
        ) : content;
      },
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 140,
      sorter: (a, b) => a.domains.join(',').localeCompare(b.domains.join(',')),
      filters: [...new Set(dataSource.flatMap(item => item.domains))].map(domain => ({
        text: domain,
        value: domain,
      })),
      filteredValue: filteredInfo.domains || null,
      filterSearch: true,
      onFilter: (value, record) => record.domains.includes(value),
      sortOrder: sortedInfo.columnKey === 'domains' ? sortedInfo.order : null,
      render: (domains) => (
          <Space direction="vertical" size={1}>
            {domains.slice(0, 1).map(domain => (
                <Tag key={domain} style={{ fontSize: '12px' }}>
                  {domain.length > 18 ? `${domain.substring(0, 18)}...` : domain}
                </Tag>
            ))}
            {domains.length > 1 && (
                <Tooltip title={domains.slice(1).join(', ')}>
                  <Tag style={{ fontSize: '11px' }}>+{domains.length - 1} more</Tag>
                </Tooltip>
            )}
          </Space>
      ),
    },
    {
      title: 'Tags',
      key: 'tags',
      width: 100,
      align: 'center',
      sorter: (a, b) => {
        const tagA = `${a.isResponse ? 'Response' : 'Request'}${a.tag ? `-${a.tag}` : ''}`;
        const tagB = `${b.isResponse ? 'Response' : 'Request'}${b.tag ? `-${b.tag}` : ''}`;
        return tagA.localeCompare(tagB);
      },
      filters: [
        ...new Set([
          ...dataSource.map(item => item.isResponse ? 'Response' : 'Request'),
          ...dataSource.filter(item => item.tag).map(item => item.tag),
          ...dataSource.filter(item => item.placeholderType).map(item => {
            switch (item.placeholderType) {
              case 'app_disconnected':
                return 'Offline';
              case 'source_not_found':
                return 'Missing';
              case 'empty_source':
                return 'Empty Source';
              case 'empty_value':
                return 'Empty Value';
              default:
                return 'Offline';
            }
          })
        ])
      ].map(tag => ({
        text: tag,
        value: tag,
      })),
      filteredValue: filteredInfo.tags || null,
      filterSearch: true,
      onFilter: (value, record) => {
        const tags = [
          record.isResponse ? 'Response' : 'Request',
          ...(record.tag ? [record.tag] : [])
        ];

        // Add the appropriate placeholder tag based on type
        if (record.placeholderType) {
          switch (record.placeholderType) {
            case 'app_disconnected':
              tags.push('Offline');
              break;
            case 'source_not_found':
              tags.push('Missing');
              break;
            case 'empty_source':
              tags.push('Empty Source');
              break;
            case 'empty_value':
              tags.push('Empty Value');
              break;
          }
        }

        return tags.includes(value);
      },
      sortOrder: sortedInfo.columnKey === 'tags' ? sortedInfo.order : null,
      render: (_, record) => {
        // Determine which tags to show
        const tags = [];

        // Always show Request/Response tag
        tags.push(
            <Tag
                key="type"
                color={record.isResponse ? 'blue' : 'green'}
                size="small"
                style={{ margin: '0 0 2px 0', fontSize: '11px' }}
            >
              {record.isResponse ? 'Response' : 'Request'}
            </Tag>
        );

        // Show custom tag if present
        if (record.tag) {
          tags.push(
              <Tag key="custom-tag" color="purple" size="small" style={{ margin: '0 0 2px 0', fontSize: '11px' }}>
                {record.tag}
              </Tag>
          );
        }

        // Show appropriate tag based on placeholder type or source tag
        if (record.placeholderType) {
          switch (record.placeholderType) {
            case 'app_disconnected':
              tags.push(
                  <Tooltip key="offline" title="Local app is disconnected. Reconnect to use dynamic values.">
                    <Tag
                        color="error"
                        size="small"
                        icon={<DisconnectOutlined />}
                        style={{ cursor: 'help', margin: '0 0 2px 0', fontSize: '11px' }}
                    >
                      Offline
                    </Tag>
                  </Tooltip>
              );
              break;
            case 'source_not_found':
              tags.push(
                  <Tooltip key="missing" title={`Source #${record.sourceId} was removed from the companion app`}>
                    <Tag
                        color="error"
                        size="small"
                        icon={<WarningOutlined />}
                        style={{ cursor: 'help', margin: '0 0 2px 0', fontSize: '11px' }}
                    >
                      Missing
                    </Tag>
                  </Tooltip>
              );
              break;
            case 'empty_source':
              tags.push(
                  <Tooltip key="empty-source" title={`Source #${record.sourceId} exists but has no content`}>
                    <Tag
                        color="warning"
                        size="small"
                        icon={<ExclamationCircleOutlined />}
                        style={{ cursor: 'help', margin: '0 0 2px 0', fontSize: '11px' }}
                    >
                      Empty
                    </Tag>
                  </Tooltip>
              );
              break;
            case 'empty_value':
              tags.push(
                  <Tooltip key="empty-value" title="This header has an empty value">
                    <Tag
                        color="warning"
                        size="small"
                        icon={<ExclamationCircleOutlined />}
                        style={{ cursor: 'help', margin: '0 0 2px 0', fontSize: '11px' }}
                    >
                      Empty
                    </Tag>
                  </Tooltip>
              );
              break;
          }
        }

        return (
            <div style={{ textAlign: 'center' }}>
              {tags}
            </div>
        );
      },
    },
    {
      title: 'Source',
      dataIndex: 'sourceInfo',
      key: 'sourceInfo',
      width: 150,
      sorter: (a, b) => {
        const sourceA = a.isDynamic ? a.sourceInfo : 'Static';
        const sourceB = b.isDynamic ? b.sourceInfo : 'Static';
        return sourceA.localeCompare(sourceB);
      },
      sortOrder: sortedInfo.columnKey === 'sourceInfo' ? sortedInfo.order : null,
      render: (sourceInfo, record) => {
        if (!record.isDynamic) {
          return (
              <Text
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-tertiary)'
                  }}
              >
                Static value
              </Text>
          );
        }

        const hasPlaceholder = record.placeholderType;

        // Determine tooltip based on placeholder type
        let tooltipContent = sourceInfo;
        if (hasPlaceholder) {
          switch (record.placeholderType) {
            case 'app_disconnected':
              tooltipContent = "Local app is disconnected. Reconnect to use dynamic values.";
              break;
            case 'source_not_found':
              tooltipContent = `Source #${record.sourceId} was removed from the companion app`;
              break;
            case 'empty_source':
              tooltipContent = `Source #${record.sourceId} exists but has no content`;
              break;
          }
        }

        return (
            <Tooltip title={tooltipContent}>
              <Text
                  ellipsis
                  type={hasPlaceholder ? "secondary" : undefined}
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontStyle: hasPlaceholder ? 'italic' : 'normal',
                    opacity: hasPlaceholder ? 0.7 : 1,
                    cursor: hasPlaceholder ? 'help' : 'default'
                  }}
              >
                {hasPlaceholder && <ExclamationCircleOutlined style={{ marginRight: 4, color: '#ff7875' }} />}
                {sourceInfo}
              </Text>
            </Tooltip>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      width: 80,
      align: 'center',
      fixed: 'right',
      sorter: (a, b) => Number(b.isEnabled) - Number(a.isEnabled),
      sortOrder: sortedInfo.columnKey === 'isEnabled' ? sortedInfo.order : null,
      render: (enabled, record) => {
        return (
            <Tooltip title="Enable/disable rule">
              <Switch
                  checked={enabled}
                  onChange={async () => {
                    // Send toggle request directly via WebSocket without redirecting
                    const { runtime } = await import('../../utils/browser-api');
                    
                    // Send toggle request to background script
                    runtime.sendMessage({
                      type: 'toggleRule',
                      ruleId: record.id,
                      enabled: !enabled  // Send the new state we want
                    }, (response) => {
                      if (response && response.success) {
                        // Success - the app will send back updated rules via rules-update
                        message.success('Rule toggled');
                      } else {
                        message.error('Failed to toggle rule - app not connected');
                      }
                    });
                  }}
                  size="small"
              />
            </Tooltip>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      align: 'center',
      fixed: 'right',
      render: (_, record) => (
          <Space size={2}>
            <Tooltip title={!isConnected ? "App not connected" : "Edit in desktop app"}>
              <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  disabled={!isConnected}
                  onClick={async () => {
                    if (!isConnected) {
                      message.warning('Please connect to the desktop app to edit rules');
                      return;
                    }
                    await appLauncher.launchOrFocus({ 
                      tab: 'rules', 
                      subTab: 'headers',
                      action: 'edit',
                      itemId: record.id 
                    });
                    message.info('Opening edit dialog in OpenHeaders app');
                  }}
              />
            </Tooltip>

            <Tooltip title={!isConnected ? "App not connected" : "Delete in desktop app"}>
              <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  disabled={!isConnected}
                  onClick={async () => {
                    if (!isConnected) {
                      message.warning('Please connect to the desktop app to delete rules');
                      return;
                    }
                    await appLauncher.launchOrFocus({ 
                      tab: 'rules', 
                      subTab: 'headers',
                      action: 'delete',
                      itemId: record.id 
                    });
                    message.info('Opening delete confirmation in OpenHeaders app');
                  }}
              />
            </Tooltip>
          </Space>
      ),
    },
  ];

  // Dropdown menu items for Add Rule button
  const addRuleMenuItems = [
    {
      key: 'modify-headers',
      icon: <SwapOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Modify Headers (Request/Response)</span>
        </Tooltip>
      ) : 'Modify Headers (Request/Response)',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ 
          tab: 'rules', 
          subTab: 'headers',
          action: 'create'
        });
        message.info('Opening new rule dialog in OpenHeaders app');
      }
    },
    // TODO: Add when cookies support is implemented in the app
    // {
    //   key: 'modify-cookies',
    //   icon: <FileProtectOutlined />,
    //   label: 'Modify Cookies',
    //   onClick: async () => {
    //     await appLauncher.launchOrFocus({ 
    //       tab: 'rules', 
    //       subTab: 'cookies',
    //       action: 'create'
    //     });
    //     message.info('Opening new rule dialog in OpenHeaders app');
    //   }
    // },
    {
      key: 'modify-payload',
      icon: <ApiOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Modify Payload (Request/Response)</span>
        </Tooltip>
      ) : 'Modify Payload (Request/Response)',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ 
          tab: 'rules', 
          subTab: 'payload',
          action: 'create'
        });
        message.info('Opening payload rules in OpenHeaders app');
      }
    },
    {
      key: 'modify-params',
      icon: <LinkOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Modify URL Query Params</span>
        </Tooltip>
      ) : 'Modify URL Query Params',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ 
          tab: 'rules', 
          subTab: 'query-params',
          action: 'create'
        });
        message.info('Opening query params rules in OpenHeaders app');
      }
    },
    {
      key: 'block-requests',
      icon: <StopOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Block Requests</span>
        </Tooltip>
      ) : 'Block Requests',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ 
          tab: 'rules', 
          subTab: 'block',
          action: 'create'
        });
        message.info('Opening block rules in OpenHeaders app');
      }
    },
    {
      key: 'redirect-requests',
      icon: <SendOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Redirect Requests</span>
        </Tooltip>
      ) : 'Redirect Requests',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ 
          tab: 'rules', 
          subTab: 'redirect',
          action: 'create'
        });
        message.info('Opening redirect rules in OpenHeaders app');
      }
    },
    {
      key: 'inject-scripts',
      icon: <CodeOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>Inject Scripts/CSS</span>
        </Tooltip>
      ) : 'Inject Scripts/CSS',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ 
          tab: 'rules', 
          subTab: 'inject',
          action: 'create'
        });
        message.info('Opening inject rules in OpenHeaders app');
      }
    },
    {
      type: 'divider'
    },
    {
      key: 'more-options',
      icon: <MoreOutlined />,
      label: !isConnected ? (
        <Tooltip title="App not connected" placement="right">
          <span>And more inside the app...</span>
        </Tooltip>
      ) : 'And more inside the app...',
      disabled: !isConnected,
      onClick: async () => {
        await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers' });
        message.info('Switch to OpenHeaders app to add rule');
      }
    }
  ];

  return (
      <div className="header-rules-section">
        <div className="header-rules-title">
          <Space align="center" size={8}>
            <Text style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Header Rules
            </Text>
            {totalCount > 0 && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  {enabledCount} of {totalCount} active
                </Text>
            )}
          </Space>
          <Space>
            <Dropdown
              menu={{ items: addRuleMenuItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Button 
                type="primary" 
                size="middle"
                className="add-rule-button"
              >
                <Space>
                  <PlusOutlined />
                  Add Rule
                  <DownOutlined style={{ fontSize: '10px' }} />
                </Space>
              </Button>
            </Dropdown>
            {(searchText || Object.keys(filteredInfo).length > 0 || sortedInfo.columnKey) && (
                <Button onClick={clearAll} size="small">
                  Clear filters and sorting
                </Button>
            )}
            <Search
                placeholder="Search headers, values, domains, or tags..."
                allowClear
                size="small"
                style={{ width: 300 }}
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
            />
          </Space>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
          <Table
              dataSource={filteredData}
              columns={columns}
              pagination={{
                pageSize: 10,
                size: 'small',
                showSizeChanger: false,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
                style: { marginBottom: 0 }
              }}
              size="small"
              scroll={{ x: 1000, y: 270 }}
              onChange={handleChange}
              locale={{
                emptyText: (
                    <Empty
                        image={<FileTextOutlined style={{ fontSize: 28, color: 'var(--text-tertiary)' }} />}
                        description={
                          searchText ? (
                            <Text type="secondary">No matching headers found</Text>
                          ) : (
                            <Space direction="vertical" size={4}>
                              <Text type="secondary">No header rules yet</Text>
                              <Text type="secondary" style={{ fontSize: '12px' }}>
                                Click "Add Rule" above to create rules in the desktop app
                              </Text>
                            </Space>
                          )
                        }
                        style={{ padding: '32px 0' }}
                    />
                )
              }}
              className="header-rules-table"
              style={{ width: '100%', flex: 1 }}
          />
        </div>
      </div>
  );
};

export default HeaderTable;