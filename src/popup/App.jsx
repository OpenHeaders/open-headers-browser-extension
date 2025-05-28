import React, { useEffect } from 'react';
import { Layout } from 'antd';
import { HeaderProvider } from '../context/HeaderContext';
import ErrorBoundary from '../components/ErrorBoundary';
import Header from './components/Header';
import HeaderForm from './components/HeaderForm';
import HeaderList from './components/HeaderList';
import Footer from './components/Footer';
import ConnectionInfo from './components/ConnectionInfo';
import { runtime } from '../utils/browser-api';

const { Content } = Layout;

/**
 * Main App component for the popup
 */
const App = () => {
  // Notify background script when popup opens/closes
  useEffect(() => {
    console.log('Popup: Establishing connection to background script');

    // Create a connection port to notify background when popup is open
    let port = null;

    try {
      // Use the browser API wrapper
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      port = browserAPI.runtime.connect({ name: 'popup' });

      // Handle disconnect events
      port.onDisconnect.addListener(() => {
        if (browserAPI.runtime.lastError) {
          console.log('Popup: Port disconnected:', browserAPI.runtime.lastError.message);
        }
      });

      // Also send the popupOpen message with error handling
      runtime.sendMessage({ type: 'popupOpen' }, (response) => {
        // Check for errors
        if (browserAPI.runtime.lastError) {
          // This is expected if background script is still initializing
          console.log('Popup: Background script not ready yet:', browserAPI.runtime.lastError.message);
        } else if (response) {
          console.log('Popup: Received response from background');
        }
      });
    } catch (error) {
      console.log('Popup: Error connecting to background:', error.message);
    }

    // Cleanup function - this runs when popup closes
    return () => {
      console.log('Popup: Closing, disconnecting from background');
      if (port) {
        try {
          port.disconnect();
        } catch (error) {
          // Ignore disconnect errors
        }
      }
    };
  }, []);

  return (
      <ErrorBoundary>
        <HeaderProvider>
          <Layout className="app-container">
            <Header />

            <Content className="content">
              <div className="form-container">
                <HeaderForm />
              </div>

              <ConnectionInfo />

              <div className="entries-list">
                <HeaderList />
              </div>
            </Content>

            <Footer />
          </Layout>
        </HeaderProvider>
      </ErrorBoundary>
  );
};

export default App;