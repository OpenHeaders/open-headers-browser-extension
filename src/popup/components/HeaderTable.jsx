import React, { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Space,
  Button,
  Switch,
  Tooltip,
  Popconfirm,
  Input,
  Typography,
  Skeleton,
  Empty,
  App,
  Badge
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  FileTextOutlined,
  DisconnectOutlined,
  WarningOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';

const { Search } = Input;
const { Text, Paragraph } = Typography;

/**
 * Professional table component for displaying header entries
 */
const HeaderTable = () => {
  const { message } = App.useApp();

  const {
    headerEntries,
    editMode,
    dynamicSources,
    isConnected,
    uiState,
    updateUiState,
    startEditingEntry,
    deleteHeaderEntry,
    toggleEntryEnabled
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
      actualValue: dynamicInfo.actualValue
    };
  });

  // Filter data based on search
  const filteredData = dataSource.filter(item =>
      item.headerName.toLowerCase().includes(searchText.toLowerCase()) ||
      item.domains.some(domain => domain.toLowerCase().includes(searchText.toLowerCase())) ||
      item.headerValue.toLowerCase().includes(searchText.toLowerCase())
  );

  // Count enabled rules
  const enabledCount = dataSource.filter(item => item.isEnabled).length;
  const totalCount = dataSource.length;

  // Get dynamic value and source info for an entry
  function getDynamicValueInfo(entry, sources, connected) {
    if (!entry.isDynamic || !entry.sourceId) {
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
          }
        }

        return (
            <Tooltip title={tooltipMessage}>
              <Text
                  ellipsis
                  type={textColor}
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontFamily: hasPlaceholder ? 'monospace' : 'inherit',
                    opacity: record.isEnabled ? 1 : 0.5
                  }}
              >
                {icon}
                {text}
              </Text>
            </Tooltip>
        );
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
      width: 70,
      align: 'center',
      sorter: (a, b) => {
        const tagA = `${a.isResponse ? 'Response' : 'Request'}${a.isDynamic ? '-D' : ''}${a.sourceTag ? `-${a.sourceTag}` : ''}`;
        const tagB = `${b.isResponse ? 'Response' : 'Request'}${b.isDynamic ? '-D' : ''}${b.sourceTag ? `-${b.sourceTag}` : ''}`;
        return tagA.localeCompare(tagB);
      },
      filters: [
        ...new Set([
          ...dataSource.map(item => item.isResponse ? 'Response' : 'Request'),
          ...dataSource.filter(item => item.sourceTag).map(item => item.sourceTag),
          ...dataSource.filter(item => item.placeholderType).map(() => 'Offline')
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
          ...(record.sourceTag ? [record.sourceTag] : []),
          ...(record.placeholderType ? ['Offline'] : [])
        ];
        return tags.includes(value);
      },
      sortOrder: sortedInfo.columnKey === 'tags' ? sortedInfo.order : null,
      render: (_, record) => (
          <Space size={3} direction="vertical">
            <Tag color={record.isResponse ? 'blue' : 'green'} size="small">
              {record.isResponse ? 'Response' : 'Request'}
            </Tag>
            {record.sourceTag && !record.placeholderType && (
                <Tag color="orange" size="small">{record.sourceTag}</Tag>
            )}
            {record.placeholderType && (
                <Tooltip title="Local app is disconnected. Reconnect to use dynamic values.">
                  <Tag
                      color="error"
                      size="small"
                      icon={<DisconnectOutlined />}
                      style={{ cursor: 'help' }}
                  >
                    Offline
                  </Tag>
                </Tooltip>
            )}
          </Space>
      ),
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
            <Switch
                checked={enabled}
                onChange={(checked) => toggleEntryEnabled(record.id, checked)}
                disabled={editMode.entryId === record.id}
                size="small"
            />
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
            <Tooltip title="Edit">
              <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => startEditingEntry(record.id)}
              />
            </Tooltip>

            <Popconfirm
                title="Delete this header?"
                description="This action cannot be undone."
                onConfirm={() => deleteHeaderEntry(record.id, (successMsg) => message.success(successMsg))}
                okText="Yes"
                cancelText="No"
            >
              <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
              />
            </Popconfirm>
          </Space>
      ),
    },
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
            {(searchText || Object.keys(filteredInfo).length > 0 || sortedInfo.columnKey) && (
                <Button onClick={clearAll} size="small">
                  Clear filters and sorting
                </Button>
            )}
            <Search
                placeholder="Search headers, values, or domains..."
                allowClear
                size="small"
                style={{ width: 300 }}
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
            />
          </Space>
        </div>

        <div style={{ flex: 1, minHeight: 200, maxHeight: 350, overflow: 'hidden' }}>
          <Table
              dataSource={filteredData}
              columns={columns}
              pagination={false}
              size="small"
              scroll={{ x: 1000, y: 270 }}
              onChange={handleChange}
              locale={{
                emptyText: (
                    <Empty
                        image={<FileTextOutlined style={{ fontSize: 28, color: 'var(--text-tertiary)' }} />}
                        description={
                          <Text type="secondary">
                            {searchText ? 'No matching headers found' : 'No header rules yet'}
                          </Text>
                        }
                        style={{ padding: '32px 0' }}
                    />
                )
              }}
              rowClassName={(record) =>
                  editMode.entryId === record.id ? 'ant-table-row-selected' : ''
              }
              className="header-rules-table"
              style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
  );
};

export default HeaderTable;