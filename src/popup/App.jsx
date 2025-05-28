import React, { useEffect } from 'react';
import { Layout } from 'antd';
import { HeaderProvider } from '../context/HeaderContext';
import ErrorBoundary from '../components/ErrorBoundary';
import Header from './components/Header';
import HeaderForm from './components/HeaderForm';
import HeaderList from './components/HeaderList';
import Footer from './components/Footer';
import ConnectionInfo from './components/ConnectionInfo';

const { Content } = Layout;

/**
 * Main App component for the popup
 */
const App = () => {
  // Notify background script when popup opens/closes
  useEffect(() => {
    console.log('Popup: Establishing connection to background script');

    // Create a connection port to notify background when popup is open
    const port = chrome.runtime.connect({ name: 'popup' });

    // Cleanup function - this runs when popup closes
    return () => {
      console.log('Popup: Closing, disconnecting from background');
      port.disconnect();
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