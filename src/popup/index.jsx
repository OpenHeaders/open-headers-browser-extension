import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import App from './App';
import './styles/popup.less';

// Create the theme configuration for Ant Design 5
const themeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
};

// Initialize React app
const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <ConfigProvider theme={themeConfig} componentSize="small">
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>
);