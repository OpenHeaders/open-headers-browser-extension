import React, { useState, useEffect, useMemo } from 'react';
import { Tabs } from 'antd';
import { TagsTwoTone, AppstoreTwoTone, ThunderboltTwoTone } from '@ant-design/icons';
import HeaderTable from './HeaderTable';
import ActiveRules from './ActiveRules';
import TagManager from './TagManager';
import { useHeader } from '../../hooks/useHeader';
import { getBrowserAPI } from '../../types/browser';

const RulesList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [currentTabDomain, setCurrentTabDomain] = useState<string | null>(null);
  const { headerEntries } = useHeader();

  useEffect(() => {
    const browserAPI = getBrowserAPI();

    const getCurrentTab = async () => {
      try {
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            setCurrentTabDomain(url.hostname);
          } catch (e) {
            setCurrentTabDomain(null);
          }
        }
      } catch (error) {
        console.error(new Date().toISOString(), 'ERROR', '[RulesList]', 'Error getting current tab:', error);
      }
    };

    getCurrentTab();

    const handleTabUpdate = (_tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
      if (changeInfo.status === 'complete' && tab.active) getCurrentTab();
    };
    const handleTabActivated = () => { getCurrentTab(); };

    browserAPI.tabs.onUpdated.addListener(handleTabUpdate);
    browserAPI.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      browserAPI.tabs.onUpdated.removeListener(handleTabUpdate);
      browserAPI.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, []);

  useEffect(() => {
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.get(['activeRulesTab'], (result: Record<string, unknown>) => {
      setActiveTab((result.activeRulesTab as string) || 'all-rules');
    });
  }, []);

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    const browserAPI = getBrowserAPI();
    browserAPI.storage.local.set({ activeRulesTab: key });
  };

  const stats = useMemo(() => {
    const total = Object.keys(headerEntries).length;
    const enabled = Object.values(headerEntries).filter(r => r.isEnabled !== false).length;
    const tags = new Set<string>();
    Object.values(headerEntries).forEach(rule => { if (rule.tag) tags.add(rule.tag); });
    const tagCount = tags.size + (Object.values(headerEntries).some(r => !r.tag) ? 1 : 0);

    let activeOnCurrentTab = 0;
    if (currentTabDomain) {
      activeOnCurrentTab = Object.values(headerEntries).filter(rule => {
        if (rule.isEnabled === false) return false;
        if (!rule.domains || rule.domains.length === 0) return true;
        return rule.domains.some(domain => {
          if (domain === '*') return true;
          if (domain.startsWith('*.')) {
            const baseDomain = domain.substring(2);
            return currentTabDomain!.endsWith(baseDomain);
          }
          return currentTabDomain === domain || currentTabDomain!.endsWith('.' + domain);
        });
      }).length;
    }

    return { total, enabled, tagCount, activeOnCurrentTab };
  }, [headerEntries, currentTabDomain]);

  const items = [
    { key: 'active-rules', label: 'Active', children: <ActiveRules />, icon: <ThunderboltTwoTone /> },
    { key: 'all-rules', label: 'Rules', children: <HeaderTable />, icon: <AppstoreTwoTone /> },
    { key: 'tag-manager', label: 'Tags', children: <TagManager />, icon: <TagsTwoTone /> },
  ];

  if (activeTab === null) return null;

  return (
    <Tabs
      activeKey={activeTab}
      onChange={handleTabChange}
      items={items}
      type="card"
      size="middle"
      animated={{ inkBar: true, tabPane: false }}
      destroyInactiveTabPane={false}
      className="header-rules-tabs"
      style={{ height: '100%' }}
      tabBarStyle={{ marginBottom: 8, paddingLeft: 8, paddingRight: 8 }}
      tabBarGutter={4}
    />
  );
};

export default RulesList;
