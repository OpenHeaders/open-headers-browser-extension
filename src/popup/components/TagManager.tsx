import React, { useState, useMemo } from 'react';
import { Collapse, Badge, Switch, Space, Typography, Empty, Tag, List, Tooltip, App, Divider } from 'antd';
import { AppstoreOutlined, FolderOutlined, FolderOpenOutlined, CheckCircleOutlined, CloseCircleOutlined, GlobalOutlined, TagsOutlined } from '@ant-design/icons';
import { useHeader } from '../../hooks/useHeader';
import type { HeaderEntry } from '../../context/HeaderContext';

const { Text } = Typography;
const { Panel } = Collapse;

interface RuleWithId extends HeaderEntry { id: string; }

interface GroupData {
  name: string;
  rules: RuleWithId[];
  icon: React.ReactNode;
  color: string;
}

interface GroupStats {
  total: number; enabled: number; disabled: number;
  requestRules: number; responseRules: number;
  allEnabled: boolean; allDisabled: boolean;
}

const TagManager: React.FC = () => {
  const { headerEntries, isConnected } = useHeader();
  const { message } = App.useApp();
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const groupedRules = useMemo((): Array<[string, GroupData]> => {
    const groups: Record<string, GroupData> = {};
    groups['__no_tag__'] = { name: 'Untagged Rules', rules: [], icon: <FolderOutlined />, color: 'default' };

    Object.entries(headerEntries).forEach(([id, rule]) => {
      const tag = rule.tag || '__no_tag__';
      if (tag !== '__no_tag__' && !groups[tag]) {
        groups[tag] = { name: tag, rules: [], icon: <FolderOutlined />, color: 'purple' };
      }
      groups[tag].rules.push({ id, ...rule });
    });

    Object.keys(groups).forEach(key => { if (groups[key].rules.length === 0) delete groups[key]; });

    return Object.entries(groups).sort(([a], [b]) => {
      if (a === '__no_tag__') return 1;
      if (b === '__no_tag__') return -1;
      return a.localeCompare(b);
    });
  }, [headerEntries]);

  const handleEnvironmentToggle = async (groupKey: string, enabled: boolean) => {
    const group = groupedRules.find(([key]) => key === groupKey);
    if (!group) return;
    const [, groupData] = group;
    const ruleIds = groupData.rules.map(r => r.id);

    if (!isConnected) { message.warning('Please connect to the desktop app to toggle rules'); return; }

    const { runtime } = await import('../../utils/browser-api');
    for (const ruleId of ruleIds) {
      runtime.sendMessage({ type: 'toggleRule', ruleId, enabled }, (response: unknown) => {
        if (!(response as { success?: boolean })?.success) console.error(new Date().toISOString(), `ERROR`, `[TagManager]`, `Failed to toggle rule ${ruleId}`);
      });
    }
    message.success(`${enabled ? 'Enabled' : 'Disabled'} ${ruleIds.length} rules in "${groupData.name}"`);
  };

  const getGroupStats = (rules: RuleWithId[]): GroupStats => {
    const total = rules.length;
    const enabled = rules.filter(r => r.isEnabled !== false).length;
    return { total, enabled, disabled: total - enabled, requestRules: rules.filter(r => !r.isResponse).length, responseRules: rules.filter(r => r.isResponse).length, allEnabled: enabled === total && total > 0, allDisabled: enabled === 0 };
  };

  const renderGroupHeader = (groupKey: string, groupData: GroupData) => {
    const stats = getGroupStats(groupData.rules);
    const isExpanded = expandedKeys.includes(groupKey);
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <Space>
          {isExpanded ? <FolderOpenOutlined /> : <FolderOutlined />}
          <Text strong style={{ fontSize: '13px' }}>{groupData.name}</Text>
          <Badge count={stats.total} style={{ backgroundColor: '#1890ff' }} />
          {stats.enabled > 0 && <Tag color="success" style={{ margin: 0, fontSize: '11px' }}>{stats.enabled} active</Tag>}
        </Space>
        <Space onClick={(e: React.MouseEvent) => e.stopPropagation()}>
          <Tooltip title={isConnected ? `${stats.allEnabled ? 'Disable' : 'Enable'} all rules in this group` : 'App not connected'}>
            <Switch size="small" checked={stats.allEnabled} disabled={!isConnected} onChange={(checked) => handleEnvironmentToggle(groupKey, checked)} />
          </Tooltip>
        </Space>
      </div>
    );
  };

  const renderRule = (rule: RuleWithId) => {
    const isEnabled = rule.isEnabled !== false;
    return (
      <List.Item key={rule.id} style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            {isEnabled ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#d9d9d9' }} />}
            <div>
              <Text style={{ fontSize: '13px' }}>{rule.headerName}</Text>
              <div>
                <Tag color={rule.isResponse ? 'blue' : 'green'} style={{ fontSize: '10px' }}>{rule.isResponse ? 'Response' : 'Request'}</Tag>
                {rule.domains && rule.domains.length > 0 ? (
                  <Tag style={{ fontSize: '10px' }}><GlobalOutlined style={{ fontSize: '10px', marginRight: '2px' }} />{rule.domains[0]}{rule.domains.length > 1 && ` +${rule.domains.length - 1}`}</Tag>
                ) : (<Tag style={{ fontSize: '10px' }}>All domains</Tag>)}
              </div>
            </div>
          </Space>
          <Tooltip title={isConnected ? (isEnabled ? 'Disable rule' : 'Enable rule') : 'App not connected'}>
            <Switch size="small" checked={isEnabled} disabled={!isConnected} onChange={async (checked) => {
              if (!isConnected) { message.warning('Please connect to the desktop app to toggle rules'); return; }
              const { runtime } = await import('../../utils/browser-api');
              runtime.sendMessage({ type: 'toggleRule', ruleId: rule.id, enabled: checked }, (response: unknown) => {
                if ((response as { success?: boolean })?.success) message.success(`Rule ${checked ? 'enabled' : 'disabled'}`);
                else message.error('Failed to toggle rule');
              });
            }} />
          </Tooltip>
        </Space>
      </List.Item>
    );
  };

  if (groupedRules.length === 0) {
    return (
      <Empty image={<AppstoreOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />}
        description={<Space direction="vertical" size={4}><Text type="secondary">No rules to organize</Text><Text type="secondary" style={{ fontSize: '12px' }}>Add rules and tag them for better organization</Text></Space>}
        style={{ padding: '40px 0' }} />
    );
  }

  const totalStats = useMemo(() => ({
    totalRules: Object.keys(headerEntries).length,
    tagGroups: groupedRules.length
  }), [headerEntries, groupedRules]);

  return (
    <div className="tag-manager-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <TagsOutlined style={{ fontSize: '14px', color: 'var(--text-secondary)' }} />
        <Text type="secondary" style={{ fontSize: '12px' }}>Toggle entire groups of rules by tags</Text>
        <Divider type="vertical" style={{ margin: '0 4px', height: '14px' }} />
        <Space size={8}>
          <Tag color="blue">{totalStats.tagGroups} tag groups</Tag>
          <Tag color="green">Total {totalStats.totalRules} rules</Tag>
        </Space>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        <Collapse activeKey={expandedKeys} onChange={(keys) => setExpandedKeys(keys as string[])} style={{ border: 'none', background: 'transparent' }}>
          {groupedRules.map(([groupKey, groupData]) => (
            <Panel key={groupKey} header={renderGroupHeader(groupKey, groupData)} style={{ marginBottom: '8px', border: '1px solid var(--border-color)', borderRadius: '4px' }}>
              <List dataSource={groupData.rules} renderItem={renderRule} size="small" style={{ maxHeight: '300px', overflow: 'auto' }} />
            </Panel>
          ))}
        </Collapse>
      </div>
    </div>
  );
};

export default TagManager;
