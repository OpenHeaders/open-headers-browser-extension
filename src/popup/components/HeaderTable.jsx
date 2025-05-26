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
  App
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  FileTextOutlined,
  DisconnectOutlined,
  WarningOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';

const { Search } = Input;
const { Text } = Typography;

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
      sourceConnected: dynamicInfo.connected
    };
  });

  // Filter data based on search
  const filteredData = dataSource.filter(item =>
      item.headerName.toLowerCase().includes(searchText.toLowerCase()) ||
      item.domains.some(domain => domain.toLowerCase().includes(searchText.toLowerCase())) ||
      item.headerValue.toLowerCase().includes(searchText.toLowerCase())
  );

  // Get dynamic value and source info for an entry
  function getDynamicValueInfo(entry, sources, connected) {
    if (!entry.isDynamic || !entry.sourceId) {
      return { value: '', sourceInfo: '', sourceTag: '', available: true, connected: true };
    }

    if (!connected) {
      return {
        value: 'App disconnected',
        sourceInfo: 'App disconnected',
        sourceTag: '',
        available: false,
        connected: false
      };
    }

    const source = sources.find(s =>
        (s.sourceId?.toString() === entry.sourceId?.toString()) ||
        (s.locationId?.toString() === entry.sourceId?.toString())
    );

    if (!source) {
      return {
        value: `Source #${entry.sourceId} (removed)`,
        sourceInfo: `Source #${entry.sourceId} (removed)`,
        sourceTag: '',
        available: false,
        connected: true
      };
    }

    const content = source.sourceContent || source.locationContent || '';
    const value = `${entry.prefix || ''}${content}${entry.suffix || ''}`;

    // Separate source tag and source path
    const sourceTag = source.sourceTag || source.locationTag || '';
    const sourcePath = source.sourcePath || source.locationPath || source.sourceUrl || source.locationUrl || '';

    // Prefix env variables with $ for clarity
    const sourceType = source.sourceType || source.locationType || '';
    const displayPath = sourceType.toLowerCase().includes('env') && sourcePath && !sourcePath.startsWith('$')
        ? `$${sourcePath}`
        : sourcePath;

    return { value, sourceInfo: displayPath, sourceTag, available: true, connected: true };
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
      render: (text) => (
          <Text strong style={{ fontSize: '13px' }}>{text}</Text>
      ),
    },
    {
      title: 'Value',
      dataIndex: 'headerValue',
      key: 'headerValue',
      width: 170,
      sorter: (a, b) => {
        const valueA = a.isDynamic ? a.dynamicValue : a.headerValue;
        const valueB = b.isDynamic ? b.dynamicValue : b.headerValue;
        return valueA.localeCompare(valueB);
      },
      sortOrder: sortedInfo.columnKey === 'headerValue' ? sortedInfo.order : null,
      render: (text, record) => {
        const displayValue = record.isDynamic ? record.dynamicValue : text;
        const hasIssue = record.isDynamic && (!record.sourceAvailable || !record.sourceConnected);

        // Determine the tooltip message
        let tooltipMessage = null;
        if (hasIssue) {
          if (!record.sourceConnected) {
            tooltipMessage = "Value is empty because the local app is disconnected";
          } else {
            tooltipMessage = "Value is empty because the source no longer exists";
          }
        }

        return (
            <Tooltip title={tooltipMessage}>
              <Text
                  ellipsis
                  type={hasIssue ? "secondary" : undefined}
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontStyle: hasIssue ? 'italic' : 'normal',
                    opacity: hasIssue ? 0.7 : 1
                  }}
              >
                {hasIssue && (
                    <WarningOutlined style={{ marginRight: 4, color: '#ff7875' }} />
                )}
                {displayValue}
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
      width: 80,
      align: 'center',
      sorter: (a, b) => {
        const tagA = `${a.isResponse ? 'Resp' : 'Req'}${a.isDynamic ? '-D' : ''}${a.sourceTag ? `-${a.sourceTag}` : ''}`;
        const tagB = `${b.isResponse ? 'Resp' : 'Req'}${b.isDynamic ? '-D' : ''}${b.sourceTag ? `-${b.sourceTag}` : ''}`;
        return tagA.localeCompare(tagB);
      },
      filters: [
        ...new Set([
          ...dataSource.map(item => item.isResponse ? 'Response' : 'Request'),
          ...dataSource.filter(item => item.sourceTag).map(item => item.sourceTag),
          ...dataSource.filter(item => item.isDynamic && !item.sourceAvailable).map(() => 'Unavailable')
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
          ...(record.isDynamic && !record.sourceAvailable ? ['Unavailable'] : [])
        ];
        return tags.includes(value);
      },
      sortOrder: sortedInfo.columnKey === 'tags' ? sortedInfo.order : null,
      render: (_, record) => (
          <Space size={3} direction="vertical">
            <Tag color={record.isResponse ? 'blue' : 'green'} size="small">
              {record.isResponse ? 'Resp' : 'Req'}
            </Tag>
            {record.sourceTag && record.sourceAvailable && (
                <Tag color="orange" size="small">{record.sourceTag}</Tag>
            )}
            {record.isDynamic && !record.sourceAvailable && (
                <Tooltip
                    title={
                      record.sourceConnected
                          ? "Dynamic source not found. The configured source no longer exists."
                          : "Local app is offline. Dynamic value will be empty until reconnected."
                    }
                >
                  <Tag
                      color="error"
                      size="small"
                      icon={<DisconnectOutlined />}
                      style={{ cursor: 'help' }}
                  >
                    {!record.sourceConnected ? 'Offline' : 'Missing'}
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
                    color: '#bfbfbf'
                  }}
              >
                Static value
              </Text>
          );
        }

        const hasIssue = !record.sourceAvailable || !record.sourceConnected;

        // Determine tooltip based on connection state
        let tooltipContent = sourceInfo;
        if (hasIssue) {
          if (!record.sourceConnected) {
            tooltipContent = "Local app is disconnected. Reconnect to use dynamic values.";
          } else {
            tooltipContent = `Source #${record.sourceId} was removed from the companion app`;
          }
        }

        return (
            <Tooltip title={tooltipContent}>
              <Text
                  ellipsis
                  type={hasIssue ? "secondary" : undefined}
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontStyle: hasIssue ? 'italic' : 'normal',
                    opacity: hasIssue ? 0.7 : 1,
                    cursor: hasIssue ? 'help' : 'default'
                  }}
              >
                {hasIssue && <WarningOutlined style={{ marginRight: 4, color: '#ff7875' }} />}
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
      width: 70,
      align: 'center',
      fixed: 'right',
      sorter: (a, b) => Number(b.isEnabled) - Number(a.isEnabled),
      sortOrder: sortedInfo.columnKey === 'isEnabled' ? sortedInfo.order : null,
      render: (enabled, record) => (
          <Switch
              checked={enabled}
              onChange={(checked) => toggleEntryEnabled(record.id, checked)}
              disabled={editMode.entryId === record.id}
              size="small"
          />
      ),
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
      <div>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong>Header Rules</Text>
          <Space>
            <Button onClick={clearAll} size="small">
              Clear filters and sorting
            </Button>
            <Search
                placeholder="Search headers, values, or domains..."
                allowClear
                size="small"
                style={{ width: 350 }}
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
                        image={<FileTextOutlined style={{ fontSize: 24, color: '#bfbfbf' }} />}
                        description={
                          searchText ? 'No matching headers found' : 'No header rules yet'
                        }
                        style={{ padding: '20px 0' }}
                    />
                )
              }}
              rowClassName={(record) =>
                  editMode.entryId === record.id ? 'ant-table-row-selected' : ''
              }
              style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>
  );
};

export default HeaderTable;