import React, { useState, useEffect } from 'react';
import {
  Table, Tag, Space, Button, Switch, Tooltip, Input, Typography, Empty, App, Dropdown
} from 'antd';
import {
  EditOutlined, DeleteOutlined, FileTextOutlined, ExclamationCircleOutlined,
  PlusOutlined, DownOutlined, SwapOutlined, ApiOutlined, LinkOutlined,
  StopOutlined, MoreOutlined, SendOutlined, CodeOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import { getAppLauncher } from '../../utils/app-launcher';
import type { HeaderEntry, DynamicSource } from '../../context/HeaderContext';
import type { ColumnsType } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';

const { Search } = Input;
const { Text } = Typography;

type PlaceholderType = 'source_not_found' | 'empty_source' | 'empty_value' | null;

interface TableRecord {
  key: string;
  id: string;
  headerName: string;
  headerValue: string;
  domains: string[];
  isDynamic: boolean | undefined;
  sourceId: string | number | null | undefined;
  prefix: string;
  suffix: string;
  isResponse: boolean | undefined;
  isEnabled: boolean;
  sourceInfo: string;
  sourceTag: string;
  placeholderType: PlaceholderType;
  actualValue: string;
  tag: string;
  isCachedValue: boolean;
}

interface DynamicValueInfo {
  sourceInfo: string;
  sourceTag: string;
  placeholderType: PlaceholderType;
  actualValue: string;
  isCachedValue: boolean;
}

const HeaderTable: React.FC = () => {
  const { message } = App.useApp();
  const appLauncher = getAppLauncher();

  const {
    headerEntries, dynamicSources, isConnected, uiState, updateUiState
  } = useHeader();

  const [searchText, setSearchText] = useState(uiState?.tableState?.searchText || '');
  const [filteredInfo, setFilteredInfo] = useState<Record<string, FilterValue | null>>(
    (uiState?.tableState?.filteredInfo as Record<string, FilterValue | null>) || {}
  );
  const [sortedInfo, setSortedInfo] = useState<SorterResult<TableRecord>>(
    (uiState?.tableState?.sortedInfo as SorterResult<TableRecord>) || {}
  );

  useEffect(() => {
    if (uiState?.tableState) {
      setSearchText((uiState.tableState.searchText as string) || '');
      setFilteredInfo((uiState.tableState.filteredInfo as Record<string, FilterValue | null>) || {});
      setSortedInfo((uiState.tableState.sortedInfo as SorterResult<TableRecord>) || {});
    }
  }, [uiState?.tableState]);

  function getDynamicValueInfo(entry: HeaderEntry, sources: DynamicSource[], connected: boolean): DynamicValueInfo {
    if (!entry.isDynamic || !entry.sourceId) {
      if (!entry.headerValue || !entry.headerValue.trim()) {
        return { sourceInfo: '', sourceTag: '', placeholderType: 'empty_value', actualValue: '', isCachedValue: false };
      }
      return { sourceInfo: '', sourceTag: '', placeholderType: null, actualValue: entry.headerValue, isCachedValue: false };
    }

    const source = sources.find(s =>
        (s.sourceId?.toString() === entry.sourceId?.toString()) ||
        (s.locationId?.toString() === entry.sourceId?.toString())
    );

    const sourceTag = source ? (source.sourceTag || source.locationTag || '') : '';
    const sourcePath = source ? (source.sourcePath || source.locationPath || source.sourceUrl || source.locationUrl || '') : '';
    const sourceType = source ? (source.sourceType || source.locationType || '') : '';
    const displayPath = sourceType.toLowerCase().includes('env') && sourcePath && !sourcePath.startsWith('$')
        ? `$${sourcePath}` : sourcePath;
    const sourceInfo = displayPath || `Source #${entry.sourceId}`;
    const content = source ? (source.sourceContent || source.locationContent || '') : '';
    const actualValue = content ? `${entry.prefix || ''}${content}${entry.suffix || ''}` : '';

    if (!source) {
      return { sourceInfo, sourceTag, placeholderType: 'source_not_found', actualValue: '', isCachedValue: false };
    }

    if (!content) {
      return { sourceInfo, sourceTag, placeholderType: 'empty_source', actualValue: '', isCachedValue: false };
    }

    return { sourceInfo, sourceTag, placeholderType: null, actualValue, isCachedValue: !connected };
  }

  const dataSource: TableRecord[] = Object.entries(headerEntries).map(([id, entry]) => {
    const dynamicInfo = getDynamicValueInfo(entry, dynamicSources, isConnected);
    return {
      key: id, id, headerName: entry.headerName, headerValue: entry.headerValue,
      domains: entry.domains || [], isDynamic: entry.isDynamic, sourceId: entry.sourceId,
      prefix: entry.prefix || '', suffix: entry.suffix || '', isResponse: entry.isResponse,
      isEnabled: entry.isEnabled !== false,
      sourceInfo: dynamicInfo.sourceInfo, sourceTag: dynamicInfo.sourceTag,
      placeholderType: dynamicInfo.placeholderType, actualValue: dynamicInfo.actualValue,
      isCachedValue: dynamicInfo.isCachedValue, tag: entry.tag || ''
    };
  });

  const filteredData = dataSource.filter(item =>
      item.headerName.toLowerCase().includes(searchText.toLowerCase()) ||
      item.domains.some(domain => domain.toLowerCase().includes(searchText.toLowerCase())) ||
      item.actualValue.toLowerCase().includes(searchText.toLowerCase()) ||
      item.tag.toLowerCase().includes(searchText.toLowerCase())
  );

  const enabledCount = dataSource.filter(item => item.isEnabled).length;
  const injectingCount = dataSource.filter(item => item.isEnabled && !item.placeholderType).length;
  const totalCount = dataSource.length;

  const handleChange = (_pagination: unknown, filters: Record<string, FilterValue | null>, sorter: SorterResult<TableRecord> | SorterResult<TableRecord>[]) => {
    setFilteredInfo(filters);
    const singleSorter = Array.isArray(sorter) ? sorter[0] : sorter;
    setSortedInfo(singleSorter);
    if (updateUiState) {
      updateUiState({ tableState: { searchText, filteredInfo: filters, sortedInfo: singleSorter as unknown as Record<string, unknown> } });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    if (updateUiState) {
      updateUiState({ tableState: { searchText: value, filteredInfo, sortedInfo: sortedInfo as unknown as Record<string, unknown> } });
    }
  };

  const clearAll = () => {
    setSearchText('');
    setFilteredInfo({});
    setSortedInfo({});
    if (updateUiState) {
      updateUiState({ tableState: { searchText: '', filteredInfo: {}, sortedInfo: {} as unknown as Record<string, unknown> } });
    }
  };

  const TAG_COLORS = ['blue', 'volcano', 'green', 'purple', 'orange', 'cyan', 'magenta', 'gold', 'geekblue', 'red'] as const;

  function getTagColor(tag: string): string {
    let hash = 5381;
    for (let i = 0; i < tag.length; i++) {
      hash = ((hash * 33) ^ tag.charCodeAt(i)) >>> 0;
    }
    return TAG_COLORS[hash % TAG_COLORS.length];
  }

  function getPlaceholderTooltip(type: PlaceholderType, sourceId?: string | number | null): string {
    switch (type) {
      case 'source_not_found': return `Not injecting — source #${sourceId} was deleted. Recreate to resume.`;
      case 'empty_source': return `Not injecting — source #${sourceId} is empty. Will resume when it has content.`;
      case 'empty_value': return 'Not injecting — header value is empty. Set a value to activate.';
      default: return '';
    }
  }

  const columns: ColumnsType<TableRecord> = [
    {
      title: 'Header Name', dataIndex: 'headerName', key: 'headerName', width: 160, fixed: 'left',
      sorter: (a, b) => a.headerName.localeCompare(b.headerName),
      filters: [...new Set(dataSource.map(item => item.headerName))].map(name => ({ text: name, value: name })),
      filteredValue: filteredInfo.headerName || null,
      filterSearch: true,
      onFilter: (value, record) => record.headerName === value,
      sortOrder: sortedInfo.columnKey === 'headerName' ? sortedInfo.order : null,
      render: (text: string, record: TableRecord) => {
        const hasPlaceholder = record.placeholderType && record.isEnabled;
        const tooltipMessage = hasPlaceholder ? getPlaceholderTooltip(record.placeholderType, record.sourceId) : '';
        return (
            <Space align="center">
              <Text strong style={{ fontSize: '13px' }}>{text}</Text>
              {hasPlaceholder && (
                  <Tooltip title={tooltipMessage}>
                    <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: '12px' }} />
                  </Tooltip>
              )}
            </Space>
        );
      },
    },
    {
      title: 'Value', dataIndex: 'actualValue', key: 'actualValue', width: 150,
      sorter: (a, b) => (a.actualValue || '').localeCompare(b.actualValue || ''),
      sortOrder: sortedInfo.columnKey === 'actualValue' ? sortedInfo.order : null,
      render: (text: string, record: TableRecord) => {
        let displayValue = text || '';
        if (displayValue.length > 20) {
          displayValue = `${displayValue.substring(0, 10)}...${displayValue.substring(displayValue.length - 5)}`;
        }

        return (
          <Text style={{ display: 'block', fontSize: '13px', opacity: record.isEnabled ? 1 : 0.5 }}>
            {displayValue}
          </Text>
        );
      },
    },
    {
      title: 'Domains', dataIndex: 'domains', key: 'domains', width: 140,
      sorter: (a, b) => a.domains.join(',').localeCompare(b.domains.join(',')),
      filters: [...new Set(dataSource.flatMap(item => item.domains))].map(domain => ({ text: domain, value: domain })),
      filteredValue: filteredInfo.domains || null, filterSearch: true,
      onFilter: (value, record) => record.domains.includes(value as string),
      sortOrder: sortedInfo.columnKey === 'domains' ? sortedInfo.order : null,
      render: (domains: string[]) => {
        if (domains.length === 0) return null;
        const first = domains[0].length > 18 ? `${domains[0].substring(0, 18)}...` : domains[0];
        const label = domains.length === 1 ? first : `${first} +${domains.length - 1}`;
        return (
          <Tooltip title={
            <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
              {domains.map((d, i) => <div key={i}><span style={{ opacity: 0.6 }}>{i + 1}. </span>{d}</div>)}
            </div>
          } styles={{ root: { maxWidth: 500 } }}>
            <Tag style={{ fontSize: '12px', cursor: 'default' }}>{label}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Tags', key: 'tags', width: 150, align: 'center',
      sorter: (a, b) => {
        const tagA = `${a.isResponse ? 'Response' : 'Request'}${a.tag ? `-${a.tag}` : ''}`;
        const tagB = `${b.isResponse ? 'Response' : 'Request'}${b.tag ? `-${b.tag}` : ''}`;
        return tagA.localeCompare(tagB);
      },
      filters: [...new Set([
        ...dataSource.map(item => item.isResponse ? 'Response' : 'Request'),
        ...dataSource.filter(item => item.tag).map(item => item.tag),
        ...dataSource.filter(item => item.isCachedValue).map(() => 'Cached'),
        ...dataSource.filter(item => item.placeholderType).map(item => {
          switch (item.placeholderType) {
            case 'source_not_found': return 'Missing';
            case 'empty_source': return 'Empty Source';
            case 'empty_value': return 'Empty Value';
            default: return '';
          }
        }).filter(Boolean)
      ])].map(tag => ({ text: tag, value: tag })),
      filteredValue: filteredInfo.tags || null, filterSearch: true,
      onFilter: (value, record) => {
        const tags = [record.isResponse ? 'Response' : 'Request', ...(record.tag ? [record.tag] : [])];
        if (record.isCachedValue) tags.push('Cached');
        if (record.placeholderType) {
          switch (record.placeholderType) {
            case 'source_not_found': tags.push('Missing'); break;
            case 'empty_source': tags.push('Empty Source'); break;
            case 'empty_value': tags.push('Empty Value'); break;
          }
        }
        return tags.includes(value as string);
      },
      sortOrder: sortedInfo.columnKey === 'tags' ? sortedInfo.order : null,
      render: (_: unknown, record: TableRecord) => {
        const tagStyle = { margin: '0 0 2px 0', fontSize: '11px' };
        const tags: React.ReactNode[] = [];
        if (record.tag) {
          tags.push(<Tag key="custom-tag" color={getTagColor(record.tag)} style={tagStyle}>{record.tag}</Tag>);
        }
        tags.push(<Tooltip key="type" title={record.isResponse ? 'Response' : 'Request'}><Tag style={tagStyle}>{record.isResponse ? 'Res' : 'Req'}</Tag></Tooltip>);
        if (record.placeholderType) {
          const tip = getPlaceholderTooltip(record.placeholderType, record.sourceId);
          const placeholderLabel = record.placeholderType === 'source_not_found' ? 'Missing' : 'Empty';
          const placeholderColor = record.placeholderType === 'source_not_found' ? 'error' : 'warning';
          tags.push(<Tooltip key="placeholder" title={tip} styles={{ root: { maxWidth: 300 } }}><Tag color={placeholderColor} style={{ ...tagStyle, cursor: 'help' }}>{placeholderLabel}</Tag></Tooltip>);
        }
        if (!record.placeholderType && record.isCachedValue && record.isEnabled) {
          tags.push(<Tooltip key="cached" title="Using cached value — app disconnected, source may be outdated" styles={{ root: { maxWidth: 300 } }}><Tag color="warning" style={{ ...tagStyle, cursor: 'help' }}>Cached</Tag></Tooltip>);
        }
        return <Space size={2} wrap>{tags}</Space>;
      },
    },
    {
      title: 'Source', dataIndex: 'sourceInfo', key: 'sourceInfo', width: 150,
      sorter: (a, b) => (a.isDynamic ? a.sourceInfo : 'Static').localeCompare(b.isDynamic ? b.sourceInfo : 'Static'),
      sortOrder: sortedInfo.columnKey === 'sourceInfo' ? sortedInfo.order : null,
      render: (sourceInfo: string, record: TableRecord) => {
        if (!record.isDynamic) {
          return <Text style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Static value</Text>;
        }
        return (
            <Tooltip title={sourceInfo}>
              <Text ellipsis style={{ display: 'block', fontSize: '12px' }}>{sourceInfo}</Text>
            </Tooltip>
        );
      },
    },
    {
      title: 'Status', dataIndex: 'isEnabled', key: 'isEnabled', width: 80, align: 'center', fixed: 'right',
      sorter: (a, b) => Number(b.isEnabled) - Number(a.isEnabled),
      sortOrder: sortedInfo.columnKey === 'isEnabled' ? sortedInfo.order : null,
      render: (enabled: boolean, record: TableRecord) => (
          <Tooltip title={isConnected ? "Enable/disable rule" : "App not connected"}>
            <Switch checked={enabled} disabled={!isConnected} onChange={async () => {
              const { runtime } = await import('../../utils/browser-api');
              runtime.sendMessage({ type: 'toggleRule', ruleId: record.id, enabled: !enabled }, (response: unknown) => {
                const resp = response as { success?: boolean } | undefined;
                if (resp && resp.success) { message.success('Rule toggled'); }
                else { message.error('Failed to toggle rule'); }
              });
            }} size="small" />
          </Tooltip>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 90, align: 'center', fixed: 'right',
      render: (_: unknown, record: TableRecord) => (
          <Space size={2}>
            <Tooltip title={!isConnected ? "App not connected" : "Edit in desktop app"}>
              <Button type="text" icon={<EditOutlined />} size="small" disabled={!isConnected}
                onClick={async () => {
                  if (!isConnected) { message.warning('Please connect to the desktop app to edit rules'); return; }
                  await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'edit', itemId: record.id });
                  message.info('Opening edit dialog in OpenHeaders app');
                }} />
            </Tooltip>
            <Tooltip title={!isConnected ? "App not connected" : "Delete in desktop app"}>
              <Button type="text" danger icon={<DeleteOutlined />} size="small" disabled={!isConnected}
                onClick={async () => {
                  if (!isConnected) { message.warning('Please connect to the desktop app to delete rules'); return; }
                  await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'delete', itemId: record.id });
                  message.info('Opening delete confirmation in OpenHeaders app');
                }} />
            </Tooltip>
          </Space>
      ),
    },
  ];

  const addRuleMenuItems = [
    { key: 'modify-headers', icon: <SwapOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>Modify Headers (Request/Response)</span></Tooltip> : 'Modify Headers (Request/Response)', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers', action: 'create' }); message.info('Opening new rule dialog in OpenHeaders app'); } },
    { key: 'modify-payload', icon: <ApiOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>Modify Payload (Request/Response)</span></Tooltip> : 'Modify Payload (Request/Response)', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'payload', action: 'create' }); message.info('Opening payload rules in OpenHeaders app'); } },
    { key: 'modify-params', icon: <LinkOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>Modify URL Query Params</span></Tooltip> : 'Modify URL Query Params', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'query-params', action: 'create' }); message.info('Opening query params rules in OpenHeaders app'); } },
    { key: 'block-requests', icon: <StopOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>Block Requests</span></Tooltip> : 'Block Requests', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'block', action: 'create' }); message.info('Opening block rules in OpenHeaders app'); } },
    { key: 'redirect-requests', icon: <SendOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>Redirect Requests</span></Tooltip> : 'Redirect Requests', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'redirect', action: 'create' }); message.info('Opening redirect rules in OpenHeaders app'); } },
    { key: 'inject-scripts', icon: <CodeOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>Inject Scripts/CSS</span></Tooltip> : 'Inject Scripts/CSS', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'inject', action: 'create' }); message.info('Opening inject rules in OpenHeaders app'); } },
    { type: 'divider' as const },
    { key: 'more-options', icon: <MoreOutlined />, label: !isConnected ? <Tooltip title="App not connected" placement="right"><span>And more inside the app...</span></Tooltip> : 'And more inside the app...', disabled: !isConnected, onClick: async () => { await appLauncher.launchOrFocus({ tab: 'rules', subTab: 'headers' }); message.info('Switch to OpenHeaders app to add rule'); } }
  ];

  return (
      <div className="header-rules-section">
        <div className="header-rules-title">
          <Space align="center" size={8}>
            <Text style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Header Rules</Text>
            {totalCount > 0 && <Text type="secondary" style={{ fontSize: '12px' }}>{injectingCount} of {totalCount} active{injectingCount < enabledCount ? `, ${enabledCount - injectingCount} unresolved` : ''}</Text>}
          </Space>
          <Space>
            <Dropdown menu={{ items: addRuleMenuItems }} placement="bottomRight" trigger={['click']}>
              <Button type="primary" size="middle" className="add-rule-button">
                <Space><PlusOutlined />Add Rule<DownOutlined style={{ fontSize: '10px' }} /></Space>
              </Button>
            </Dropdown>
            <div>
              <Search placeholder="Search anything..." allowClear size="small" style={{ width: 300 }} value={searchText} onChange={(e) => handleSearchChange(e.target.value)} />
              {(searchText || Object.keys(filteredInfo).length > 0 || sortedInfo.columnKey) && (
                  <div style={{ textAlign: 'right', marginTop: 2 }}>
                    <Button onClick={clearAll} type="link" size="small" style={{ fontSize: '11px', padding: 0, height: 'auto' }}>Clear filters and sorting</Button>
                  </div>
              )}
            </div>
          </Space>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, paddingBottom: '8px' }}>
          <Table
              dataSource={filteredData} columns={columns}
              pagination={{ pageSize: 10, size: 'small', showSizeChanger: false, showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`, style: { marginBottom: 0, marginTop: 4 } }}
              size="small" scroll={{ x: 920, y: 290 }} onChange={handleChange}
              rowClassName={(record: TableRecord) => record.isEnabled && record.placeholderType ? 'row-not-injecting' : ''}
              locale={{ emptyText: (
                <Empty image={<FileTextOutlined style={{ fontSize: 28, color: 'var(--text-tertiary)' }} />}
                  description={searchText ? <Text type="secondary">No matching headers found</Text> : (
                    <Space direction="vertical" size={4}>
                      <Text type="secondary">No header rules yet</Text>
                      <Text type="secondary" style={{ fontSize: '12px' }}>Click "Add Rule" above to create rules in the desktop app</Text>
                    </Space>
                  )} style={{ padding: '32px 0' }} />
              ) }}
              className="header-rules-table" style={{ width: '100%', flex: 1 }}
          />
        </div>
      </div>
  );
};

export default HeaderTable;
