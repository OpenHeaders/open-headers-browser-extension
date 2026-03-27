import React, { useEffect } from 'react';
import { Layout } from 'antd';
import { HeaderProvider } from '../context/HeaderContext';
import { useTheme } from '../context/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import Header from './components/Header';
import RulesList from './components/RulesList';
import Footer from './components/Footer';
import ConnectionInfo from './components/ConnectionInfo';
import { runtime } from '../utils/browser-api';
import { sendMessage } from '../utils/messaging';
import { getBrowserAPI } from '../types/browser';

const { Content } = Layout;

const AppContent: React.FC = () => {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Establishing connection to background script');

    let port: chrome.runtime.Port | null = null;

    try {
      const browserAPI = getBrowserAPI();
      port = browserAPI.runtime.connect({ name: 'popup' });

      port.onDisconnect.addListener(() => {
        if (browserAPI.runtime.lastError) {
          console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Port disconnected:', browserAPI.runtime.lastError.message);
        }
      });

      runtime.sendMessage({ type: 'popupOpen' }, (response: unknown) => {
        if (browserAPI.runtime.lastError) {
          console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Background script not ready yet:', browserAPI.runtime.lastError.message);
        } else if (response) {
          console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Received response from background');
        }
      });
    } catch (error) {
      console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Error connecting to background:', (error as Error).message);
    }

    return () => {
      console.log(new Date().toISOString(), 'INFO ', '[Popup]', 'Popup: Closing, disconnecting from background');
      if (port) {
        try {
          port.disconnect();
        } catch (error) {
          // Ignore disconnect errors
        }
      }
    };
  }, []);

  const handleOpenSetupGuide = async (): Promise<void> => {
    const response = await sendMessage({ type: 'forceOpenWelcomePage' });
    if (!response.error) {
      window.close();
    }
  };

  return (
      <ErrorBoundary>
        <HeaderProvider>
          <Layout className="app-container" data-theme={isDarkMode ? 'dark' : 'light'}>
            <Header
              onOpenSetupGuide={handleOpenSetupGuide}
            />
            <Content className="content">
              <ConnectionInfo />
              <div className="entries-list">
                <RulesList />
              </div>
            </Content>
            <Footer />
          </Layout>
        </HeaderProvider>
      </ErrorBoundary>
  );
};

export default AppContent;
