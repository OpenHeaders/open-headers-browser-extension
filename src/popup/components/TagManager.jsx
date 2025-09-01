import React, { useState, useMemo } from 'react';
import {
  Collapse,
  Badge,
  Switch,
  Space,
  Typography,
  Empty,
  Tag,
  List,
  Tooltip,
  Button,
  App,
  Divider
} from 'antd';
import {
  AppstoreOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  GlobalOutlined,
  TagsOutlined
} from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';

const { Text } = Typography;
const { Panel } = Collapse;

/**
 * Component that groups rules by tags for bulk operations
 */
const TagManager = () => {
  const { headerEntries, isConnected } = useHeader();
  const { message } = App.useApp();
  const [expandedKeys, setExpandedKeys] = useState([]);

  // Group rules by tags
  const groupedRules = useMemo(() => {
    const groups = {};
    
    // Create "No Tag" group for rules without tags
    groups['__no_tag__'] = {
      name: 'Untagged Rules',
      rules: [],
      icon: <FolderOutlined />,
      color: 'default'
    };

    Object.entries(headerEntries).forEach(([id, rule]) => {
      const tag = rule.tag || '__no_tag__';
      
      if (tag !== '__no_tag__' && !groups[tag]) {
        groups[tag] = {
          name: tag,
          rules: [],
          icon: <FolderOutlined />,
          color: 'purple'
        };
      }

      groups[tag].rules.push({
        id,
        ...rule
      });
    });

    // Remove empty groups
    Object.keys(groups).forEach(key => {
      if (groups[key].rules.length === 0) {
        delete groups[key];
      }
    });

    // Sort groups - tagged ones first, then "No Tag"
    const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
      if (a === '__no_tag__') return 1;
      if (b === '__no_tag__') return -1;
      return a.localeCompare(b);
    });

    return sortedGroups;
  }, [headerEntries]);

  // Handle bulk toggle for an environment
  const handleEnvironmentToggle = async (groupKey, enabled) => {
    const group = groupedRules.find(([key]) => key === groupKey);
    if (!group) return;

    const [, groupData] = group;
    const ruleIds = groupData.rules.map(r => r.id);

    if (!isConnected) {
      message.warning('Please connect to the desktop app to toggle rules');
      return;
    }

    // Send bulk toggle message
    const { runtime } = await import('../../utils/browser-api');
    
    for (const ruleId of ruleIds) {
      runtime.sendMessage({
        type: 'toggleRule',
        ruleId: ruleId,
        enabled: enabled
      }, (response) => {
        if (!response || !response.success) {
          console.error(`Failed to toggle rule ${ruleId}`);
        }
      });
    }

    message.success(`${enabled ? 'Enabled' : 'Disabled'} ${ruleIds.length} rules in "${groupData.name}"`);
  };

  // Calculate stats for each group
  const getGroupStats = (rules) => {
    const total = rules.length;
    const enabled = rules.filter(r => r.isEnabled !== false).length;
    const requestRules = rules.filter(r => !r.isResponse).length;
    const responseRules = rules.filter(r => r.isResponse).length;
    
    return {
      total,
      enabled,
      disabled: total - enabled,
      requestRules,
      responseRules,
      allEnabled: enabled === total && total > 0,
      allDisabled: enabled === 0
    };
  };

  const renderGroupHeader = (groupKey, groupData) => {
    const stats = getGroupStats(groupData.rules);
    const isExpanded = expandedKeys.includes(groupKey);

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <Space>
          {isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />}
          <Text strong style={{ fontSize: '13px' }}>
            {groupData.name}
          </Text>
          <Badge count={stats.total} style={{ backgroundColor: '#1890ff' }} />
          {stats.enabled > 0 && (
            <Tag color="success" style={{ margin: 0, fontSize: '11px' }}>
              {stats.enabled} active
            </Tag>
          )}
        </Space>
        <Space onClick={e => e.stopPropagation()}>
          <Tooltip title={`${stats.allEnabled ? 'Disable' : 'Enable'} all rules in this group`}>
            <Switch
              size="small"
              checked={stats.allEnabled}
              disabled={!isConnected}
              onChange={(checked) => handleEnvironmentToggle(groupKey, checked)}
            />
          </Tooltip>
        </Space>
      </div>
    );
  };

  const renderRule = (rule) => {
    const isEnabled = rule.isEnabled !== false;
    
    return (
      <List.Item
        key={rule.id}
        style={{ 
          padding: '8px 12px',
          borderBottom: '1px solid var(--border-color)'
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            {isEnabled ? (
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
            ) : (
              <CloseCircleOutlined style={{ color: '#d9d9d9' }} />
            )}
            <div>
              <Text style={{ fontSize: '13px' }}>
                {rule.headerName}
              </Text>
              <div>
                <Tag color={rule.isResponse ? 'blue' : 'green'} size="small" style={{ fontSize: '10px' }}>
                  {rule.isResponse ? 'Response' : 'Request'}
                </Tag>
                {rule.domains && rule.domains.length > 0 ? (
                  <Tag size="small" style={{ fontSize: '10px' }}>
                    <GlobalOutlined style={{ fontSize: '10px', marginRight: '2px' }} />
                    {rule.domains[0]}
                    {rule.domains.length > 1 && ` +${rule.domains.length - 1}`}
                  </Tag>
                ) : (
                  <Tag size="small" style={{ fontSize: '10px' }}>All domains</Tag>
                )}
              </div>
            </div>
          </Space>
          <Tooltip title={isEnabled ? 'Disable rule' : 'Enable rule'}>
            <Switch
              size="small"
              checked={isEnabled}
              disabled={!isConnected}
              onChange={async (checked) => {
                if (!isConnected) {
                  message.warning('Please connect to the desktop app to toggle rules');
                  return;
                }
                
                const { runtime } = await import('../../utils/browser-api');
                runtime.sendMessage({
                  type: 'toggleRule',
                  ruleId: rule.id,
                  enabled: checked
                }, (response) => {
                  if (response && response.success) {
                    message.success(`Rule ${checked ? 'enabled' : 'disabled'}`);
                  } else {
                    message.error('Failed to toggle rule');
                  }
                });
              }}
            />
          </Tooltip>
        </Space>
      </List.Item>
    );
  };

  if (groupedRules.length === 0) {
    return (
      <Empty
        image={<AppstoreOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />}
        description={
          <Space direction="vertical" size={4}>
            <Text type="secondary">No rules to organize</Text>
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Add rules and tag them for better organization
            </Text>
          </Space>
        }
        style={{ padding: '40px 0' }}
      />
    );
  }

  // Calculate total stats
  const totalStats = useMemo(() => {
    const totalRules = Object.keys(headerEntries).length;
    const tagGroups = groupedRules.length;
    return { totalRules, tagGroups };
  }, [headerEntries, groupedRules]);

  return (
    <div className="tag-manager-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Streamlined inline header */}
      <div style={{ 
        padding: '8px 16px', 
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px'
      }}>
        <TagsOutlined style={{ fontSize: '14px', color: 'var(--text-secondary)' }} />
        <Text type="secondary" style={{ fontSize: '12px' }}>
          Toggle entire groups of rules by tags
        </Text>
        <Divider type="vertical" style={{ margin: '0 4px', height: '14px' }} />
        <Space size={8}>
          <Tag color="blue" size="small">
            {totalStats.tagGroups} tag groups
          </Tag>
          <Tag color="green" size="small">
            Total {totalStats.totalRules} rules
          </Tag>
        </Space>
      </div>

      {/* Collapsible groups */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <Collapse
          activeKey={expandedKeys}
          onChange={setExpandedKeys}
          style={{ 
            border: 'none',
            background: 'transparent'
          }}
        >
          {groupedRules.map(([groupKey, groupData]) => {
            const stats = getGroupStats(groupData.rules);
            
            return (
              <Panel
                key={groupKey}
                header={renderGroupHeader(groupKey, groupData)}
                style={{
                  marginBottom: '8px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px'
                }}
              >
                <List
                  dataSource={groupData.rules}
                  renderItem={renderRule}
                  size="small"
                  style={{ maxHeight: '300px', overflow: 'auto' }}
                />
              </Panel>
            );
          })}
        </Collapse>
      </div>
    </div>
  );
};

export default TagManager;