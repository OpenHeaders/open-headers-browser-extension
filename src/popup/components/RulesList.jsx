import React, { useState, useEffect, useMemo } from 'react';
import { Tabs, Badge } from 'antd';
import {
  TagsTwoTone,
  AppstoreTwoTone,
  ThunderboltTwoTone
} from '@ant-design/icons';
import HeaderTable from './HeaderTable';
import ActiveRules from './ActiveRules';
import TagManager from './TagManager';
import { useHeader } from '../../hooks/useHeader';

/**
 * Component that renders tabs for different rule views
 */
const RulesList = () => {
  const [activeTab, setActiveTab] = useState(null);
  const [currentTabDomain, setCurrentTabDomain] = useState(null);
  const { headerEntries } = useHeader();
  
  // Get current browser tab domain
  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            setCurrentTabDomain(url.hostname);
          } catch (e) {
            // Invalid URL (like chrome:// pages)
            setCurrentTabDomain(null);
          }
        }
      } catch (error) {
        console.error('Error getting current tab:', error);
      }
    };

    getCurrentTab();

    // Listen for tab changes
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    const handleTabUpdate = (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        getCurrentTab();
      }
    };
    const handleTabActivated = () => {
      getCurrentTab();
    };

    browserAPI.tabs.onUpdated.addListener(handleTabUpdate);
    browserAPI.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      browserAPI.tabs.onUpdated.removeListener(handleTabUpdate);
      browserAPI.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, []);
  
  // Load saved tab preference on mount
  useEffect(() => {
    const loadSavedTab = async () => {
      try {
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        const result = await browserAPI.storage.local.get('activeRulesTab');
        setActiveTab(result.activeRulesTab || 'all-rules');
      } catch (error) {
        // Fallback to localStorage
        const saved = localStorage.getItem('activeRulesTab');
        setActiveTab(saved || 'all-rules');
      }
    };
    loadSavedTab();
  }, []);

  // Save tab preference when it changes
  const handleTabChange = async (key) => {
    setActiveTab(key);
    try {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      await browserAPI.storage.local.set({ activeRulesTab: key });
    } catch (error) {
      // Fallback to localStorage
      localStorage.setItem('activeRulesTab', key);
    }
  };

  // Calculate stats for badges
  const stats = useMemo(() => {
    const total = Object.keys(headerEntries).length;
    const enabled = Object.values(headerEntries).filter(r => r.isEnabled !== false).length;
    
    // Count unique tags
    const tags = new Set();
    Object.values(headerEntries).forEach(rule => {
      if (rule.tag) tags.add(rule.tag);
    });
    const tagCount = tags.size + (Object.values(headerEntries).some(r => !r.tag) ? 1 : 0);
    
    // Calculate active rules for current browser tab
    let activeOnCurrentTab = 0;
    if (currentTabDomain) {
      activeOnCurrentTab = Object.values(headerEntries).filter(rule => {
        // Check if rule is enabled
        if (rule.isEnabled === false) return false;

        // Check if domains match
        if (!rule.domains || rule.domains.length === 0) {
          // Rule applies to all domains
          return true;
        }

        // Check if current domain matches any of the rule's domains
        return rule.domains.some(domain => {
          // Handle wildcard domains
          if (domain === '*') return true;
          if (domain.startsWith('*.')) {
            const baseDomain = domain.substring(2);
            return currentTabDomain.endsWith(baseDomain);
          }
          return currentTabDomain === domain || currentTabDomain.endsWith('.' + domain);
        });
      }).length;
    }
    
    return { total, enabled, tagCount, activeOnCurrentTab };
  }, [headerEntries, currentTabDomain]);

  const items = [
    {
      key: 'active-rules',
      label: 'Active',
      children: <ActiveRules />,
      icon: <ThunderboltTwoTone />
    },
    {
      key: 'all-rules',
      label: 'Rules',
      children: <HeaderTable />,
      icon: <AppstoreTwoTone />
    },
    {
      key: 'tag-manager',
      label: 'Tags',
      children: <TagManager />,
      icon: <TagsTwoTone />
    },
  ];

  // Don't render until tab preference is loaded to prevent flash
  if (activeTab === null) {
    return null;
  }

  return (
    <Tabs
      activeKey={activeTab}
      onChange={handleTabChange}
      items={items}
      type="card"
      size="medium"
      animated
      className="header-rules-tabs"
      style={{
        height: '100%'
      }}
      tabBarStyle={{
        marginBottom: 8,
        paddingLeft: 8,
        paddingRight: 8
      }}
      tabBarGutter={4}
    />
  );
};

export default RulesList;