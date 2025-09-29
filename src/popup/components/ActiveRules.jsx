import React, { useState, useEffect } from 'react';
import {
  Table,
  Tag,
  Space,
  Empty,
  Typography,
  Tooltip,
  Spin,
  Alert,
  Divider
} from 'antd';
import {
  FileTextOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  LinkOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';

const { Text } = Typography;

/**
 * Component that shows rules actively being executed on the current browser tab
 * Uses centralized logic from background script for consistency with badge
 */
const ActiveRules = () => {
  const { isConnected } = useHeader();
  const [currentTab, setCurrentTab] = useState(null);
  const [activeRules, setActiveRules] = useState([]);
  const [loading, setLoading] = useState(true);

  // Get current tab info and active rules from background script
  useEffect(() => {
    const fetchActiveRules = async () => {
      try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        
        if (tabs[0]) {
          const tab = tabs[0];
          const url = new URL(tab.url);
          
          // Get active rules from background script (centralized logic)
          const response = await new Promise((resolve) => {
            browserAPI.runtime.sendMessage(
              { 
                type: 'getActiveRulesForTab', 
                tabId: tab.id,
                tabUrl: tab.url 
              },
              (response) => {
                resolve(response || { activeRules: [] });
              }
            );
          });
          
          setCurrentTab({
            id: tab.id,
            url: tab.url,
            domain: url.hostname,
            title: tab.title
          });
          
          setActiveRules(response.activeRules || []);
        }
      } catch (error) {
        console.error('Error getting active rules:', error);
        setActiveRules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActiveRules();

    // Listen for tab updates
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    const handleTabUpdate = (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        fetchActiveRules();
      }
    };

    browserAPI.tabs.onUpdated.addListener(handleTabUpdate);
    browserAPI.tabs.onActivated.addListener(fetchActiveRules);

    // Also listen for storage changes (rule updates)
    const handleStorageChange = () => {
      fetchActiveRules();
    };
    browserAPI.storage.onChanged.addListener(handleStorageChange);

    return () => {
      browserAPI.tabs.onUpdated.removeListener(handleTabUpdate);
      browserAPI.tabs.onActivated.removeListener(fetchActiveRules);
      browserAPI.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  const columns = [
    {
      title: 'Header',
      dataIndex: 'headerName',
      key: 'headerName',
      width: 180,
      render: (text, record) => {
        let displayValue = record.headerValue || '[Dynamic]';
        
        // Trim long values: show first 10 chars ... last 5 chars
        if (displayValue !== '[Dynamic]' && displayValue.length > 20) {
          displayValue = `${displayValue.substring(0, 10)}...${displayValue.substring(displayValue.length - 5)}`;
        }
        
        return (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: '13px' }}>{text}</Text>
            <Text type="secondary" style={{ fontSize: '11px' }}>
              {displayValue}
            </Text>
          </Space>
        );
      },
    },
    {
      title: 'Type',
      key: 'type',
      width: 100,
      align: 'center',
      render: (_, record) => (
        <Tag color={record.isResponse ? 'blue' : 'green'} size="small">
          {record.isResponse ? 'Response' : 'Request'}
        </Tag>
      ),
    },
    {
      title: 'Tags',
      dataIndex: 'tag',
      key: 'tag',
      width: 120,
      render: (tag) => tag ? (
        <Tag color="purple" size="small">{tag}</Tag>
      ) : null,
    },
    {
      title: 'Domains',
      dataIndex: 'domains',
      key: 'domains',
      width: 150,
      render: (domains, record) => {
        if (!domains || domains.length === 0) {
          return <Tag color="default" size="small">All domains</Tag>;
        }
        
        // Show icon if this is an indirect match (resource request)
        const matchIcon = record.matchType === 'indirect' ? (
          <Tooltip title="Applied to resources loaded by this page">
            <LinkOutlined style={{ fontSize: '10px', marginRight: '4px', color: '#1890ff' }} />
          </Tooltip>
        ) : null;
        
        return (
          <Space size={1} wrap>
            {matchIcon}
            {domains.slice(0, 2).map(domain => (
              <Tag key={domain} size="small">
                {domain.length > 15 ? `${domain.substring(0, 15)}...` : domain}
              </Tag>
            ))}
            {domains.length > 2 && (
              <Tooltip title={domains.slice(2).join(', ')}>
                <Tag size="small">+{domains.length - 2}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      align: 'center',
      render: (_, record) => {
        const isActive = record.isEnabled !== false;
        return (
          <Tooltip title={isActive ? 'Rule is active' : 'Rule is disabled'}>
            {isActive ? (
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
            ) : (
              <CloseCircleOutlined style={{ color: '#d9d9d9', fontSize: '16px' }} />
            )}
          </Tooltip>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <Spin size="large" />
        <Text type="secondary" style={{ display: 'block', marginTop: '16px' }}>
          Loading current tab information...
        </Text>
      </div>
    );
  }

  if (!currentTab) {
    return (
      <Empty
        image={<ExclamationCircleOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />}
        description="Unable to get current tab information"
        style={{ padding: '40px 0' }}
      />
    );
  }

  if (!currentTab.domain || currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('edge://')) {
    return (
      <div style={{ padding: '20px' }}>
        <Alert
          message="System Page"
          description="Header rules do not apply to browser system pages"
          type="info"
          showIcon
        />
      </div>
    );
  }

  // Count direct vs indirect matches
  const directMatches = activeRules.filter(r => r.matchType === 'direct').length;
  const indirectMatches = activeRules.filter(r => r.matchType === 'indirect').length;

  return (
    <div className="active-rules-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Inline header with domain info */}
      <div style={{ 
        padding: '8px 16px', 
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px'
      }}>
        <GlobalOutlined style={{ fontSize: '14px', color: 'var(--text-secondary)' }} />
        <Tooltip title={currentTab.domain.length > 30 ? currentTab.domain : null}>
          <Text strong style={{ fontSize: '13px' }}>
            {currentTab.domain.length > 30 
              ? `${currentTab.domain.substring(0, 20)}...${currentTab.domain.substring(currentTab.domain.length - 7)}`
              : currentTab.domain}
          </Text>
        </Tooltip>
        <Divider type="vertical" style={{ margin: '0 4px', height: '14px' }} />
        <Text type="secondary" style={{ fontSize: '12px' }}>
          {activeRules.length} rule{activeRules.length !== 1 ? 's' : ''} active
          {indirectMatches > 0 && ` (${directMatches} direct, ${indirectMatches} via resources)`}
        </Text>
      </div>

      {/* Rules Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <Table
          dataSource={activeRules.map((rule, index) => ({ ...rule, key: rule.id || index }))}
          columns={columns}
          pagination={false}
          size="small"
          scroll={{ y: 320 }}
          locale={{
            emptyText: (
              <Empty
                image={<FileTextOutlined style={{ fontSize: 24, color: 'var(--text-tertiary)' }} />}
                description={
                  <Space direction="vertical" size={4}>
                    <Text type="secondary">No rules active on this page</Text>
                    <Text type="secondary" style={{ fontSize: '11px' }}>
                      Rules may be disabled or configured for other domains
                    </Text>
                  </Space>
                }
                style={{ padding: '24px 0' }}
              />
            )
          }}
          className="active-rules-table"
        />
      </div>

    </div>
  );
};

export default ActiveRules;