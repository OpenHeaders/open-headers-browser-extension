import React, { useState, useEffect } from 'react';
import { Table, Tag, Space, Empty, Typography, Tooltip, Spin, Alert, Divider } from 'antd';
import { FileTextOutlined, GlobalOutlined, CheckCircleOutlined, CloseCircleOutlined, ExclamationCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import type { ColumnsType } from 'antd/es/table';

declare const browser: typeof chrome | undefined;

const { Text } = Typography;

interface ActiveRule {
  id?: string;
  headerName: string;
  headerValue?: string;
  isResponse?: boolean;
  isEnabled?: boolean;
  domains?: string[];
  tag?: string;
  matchType?: string;
  [key: string]: unknown;
}

interface CurrentTabInfo {
  id: number;
  url: string;
  domain: string;
  title: string;
}

interface TableRecord extends ActiveRule { key: string | number; }

const ActiveRules: React.FC = () => {
  const { isConnected } = useHeader();
  const [currentTab, setCurrentTab] = useState<CurrentTabInfo | null>(null);
  const [activeRules, setActiveRules] = useState<ActiveRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchActiveRules = async () => {
      try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]) {
          const tab = tabs[0];
          const url = new URL(tab.url!);
          const response = await new Promise<{ activeRules?: ActiveRule[] }>((resolve) => {
            browserAPI.runtime.sendMessage({ type: 'getActiveRulesForTab', tabId: tab.id, tabUrl: tab.url }, (resp) => {
              resolve((resp as { activeRules?: ActiveRule[] }) || { activeRules: [] });
            });
          });
          setCurrentTab({ id: tab.id!, url: tab.url!, domain: url.hostname, title: tab.title || '' });
          setActiveRules(response.activeRules || []);
        }
      } catch (error) { console.error(new Date().toISOString(), 'ERROR', '[ActiveRules]', 'Error getting active rules:', error); setActiveRules([]); }
      finally { setLoading(false); }
    };

    fetchActiveRules();

    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    const handleTabUpdate = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (changeInfo.status === 'complete' && tab.active) fetchActiveRules();
    };
    browserAPI.tabs.onUpdated.addListener(handleTabUpdate);
    browserAPI.tabs.onActivated.addListener(fetchActiveRules);
    const handleStorageChange = () => { fetchActiveRules(); };
    browserAPI.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browserAPI.tabs.onUpdated.removeListener(handleTabUpdate);
      browserAPI.tabs.onActivated.removeListener(fetchActiveRules);
      browserAPI.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const columns: ColumnsType<TableRecord> = [
    { title: 'Header', dataIndex: 'headerName', key: 'headerName', width: 180,
      render: (text: string, record: TableRecord) => {
        let displayValue = record.headerValue || '[Dynamic]';
        if (displayValue !== '[Dynamic]' && displayValue.length > 20) displayValue = `${displayValue.substring(0, 10)}...${displayValue.substring(displayValue.length - 5)}`;
        return <Space direction="vertical" size={0}><Text strong style={{ fontSize: '13px' }}>{text}</Text><Text type="secondary" style={{ fontSize: '11px' }}>{displayValue}</Text></Space>;
      },
    },
    { title: 'Type', key: 'type', width: 100, align: 'center',
      render: (_: unknown, record: TableRecord) => <Tag color={record.isResponse ? 'blue' : 'green'}>{record.isResponse ? 'Response' : 'Request'}</Tag>,
    },
    { title: 'Tags', dataIndex: 'tag', key: 'tag', width: 120,
      render: (tag: string) => tag ? <Tag color="purple">{tag}</Tag> : null,
    },
    { title: 'Domains', dataIndex: 'domains', key: 'domains', width: 150,
      render: (domains: string[], record: TableRecord) => {
        if (!domains || domains.length === 0) return <Tag color="default">All domains</Tag>;
        const matchIcon = record.matchType === 'indirect' ? <Tooltip title="Applied to resources loaded by this page"><LinkOutlined style={{ fontSize: '10px', marginRight: '4px', color: '#1890ff' }} /></Tooltip> : null;
        const first = domains[0].length > 18 ? `${domains[0].substring(0, 18)}...` : domains[0];
        const label = domains.length === 1 ? first : `${first} +${domains.length - 1}`;
        return (
          <Space size={1}>
            {matchIcon}
            <Tooltip title={
              <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {domains.map((d, i) => <div key={i}><span style={{ opacity: 0.6 }}>{i + 1}. </span>{d}</div>)}
              </div>
            } overlayStyle={{ maxWidth: 500 }}>
              <Tag style={{ fontSize: '12px', cursor: 'default' }}>{label}</Tag>
            </Tooltip>
          </Space>
        );
      },
    },
    { title: 'Status', key: 'status', width: 80, align: 'center',
      render: (_: unknown, record: TableRecord) => {
        const isActive = record.isEnabled !== false;
        return <Tooltip title={isActive ? 'Rule is active' : 'Rule is disabled'}>{isActive ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} /> : <CloseCircleOutlined style={{ color: '#d9d9d9', fontSize: '16px' }} />}</Tooltip>;
      },
    },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}><Spin size="large" /><Text type="secondary" style={{ display: 'block', marginTop: '16px' }}>Loading current tab information...</Text></div>;
  if (!currentTab) return <Empty image={<ExclamationCircleOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />} description="Unable to get current tab information" style={{ padding: '40px 0' }} />;
  if (!currentTab.domain || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('edge://')) return <div style={{ padding: '20px' }}><Alert message="System Page" description="Header rules do not apply to browser system pages" type="info" showIcon /></div>;

  const directMatches = activeRules.filter(r => r.matchType === 'direct').length;
  const indirectMatches = activeRules.filter(r => r.matchType === 'indirect').length;

  return (
    <div className="active-rules-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <GlobalOutlined style={{ fontSize: '14px', color: 'var(--text-secondary)' }} />
        <Tooltip title={currentTab.domain.length > 30 ? currentTab.domain : undefined}>
          <Text strong style={{ fontSize: '13px' }}>
            {currentTab.domain.length > 30 ? `${currentTab.domain.substring(0, 20)}...${currentTab.domain.substring(currentTab.domain.length - 7)}` : currentTab.domain}
          </Text>
        </Tooltip>
        <Divider type="vertical" style={{ margin: '0 4px', height: '14px' }} />
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {activeRules.length} rule{activeRules.length !== 1 ? 's' : ''} active
          {indirectMatches > 0 && ` (${directMatches} direct, ${indirectMatches} via resources)`}
        </Text>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <Table
          dataSource={activeRules.map((rule, index) => ({ ...rule, key: rule.id || index }))}
          columns={columns} pagination={false} size="small" scroll={{ y: 320 }}
          locale={{ emptyText: <Empty image={<FileTextOutlined style={{ fontSize: 24, color: 'var(--text-tertiary)' }} />} description={<Space direction="vertical" size={4}><Text type="secondary">No rules active on this page</Text><Text type="secondary" style={{ fontSize: '11px' }}>Rules may be disabled or configured for other domains</Text></Space>} style={{ padding: '24px 0' }} /> }}
          className="active-rules-table"
        />
      </div>
    </div>
  );
};

export default ActiveRules;
