import React, { useState, useEffect } from 'react';
import { Button } from 'antd';

const WelcomeApp = () => {
  const [currentPage, setCurrentPage] = useState(1);

  const nextPage = () => {
    if (currentPage < 3) {
      setCurrentPage(currentPage + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const finishWelcome = () => {
    // Close the welcome page and redirect to popup
    window.close();
  };

  return (
    <div className="welcome-container">
      <div className="page-indicator">
        {[1, 2, 3].map(page => (
          <div 
            key={page}
            className={`indicator-dot ${page === currentPage ? 'active' : ''}`}
          />
        ))}
      </div>

      <div className="onboarding-content">
        {/* Page 1: Welcome */}
        {currentPage === 1 && (
          <div className="page active">
            <img src="images/icon128.png" alt="Open Headers Logo" className="welcome-logo" />
            <h1 className="page-title">Welcome to Open Headers</h1>
            <p className="page-subtitle">Let's get the browser extension ready.</p>

            <div className="welcome-illustration">
              <div className="browser-frame">
                <div className="browser-header">
                  <div className="browser-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="browser-address-bar"></div>
                </div>
                <div className="browser-content">
                  <div className="headers-visual">
                    <div className="header-line">
                      <span className="header-name">Authorization</span>
                      <span className="header-value">Bearer <span className="dynamic-value">***</span></span>
                    </div>
                    <div className="header-line">
                      <span className="header-name">Content-Type</span>
                      <span className="header-value">application/json</span>
                    </div>
                    <div className="header-line">
                      <span className="header-name">Accept</span>
                      <span className="header-value">*/*</span>
                    </div>
                    <div className="header-arrow">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 4L20 12L12 20M4 12H20" stroke="#4285F4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="server-icon">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="4" y="4" width="16" height="6" rx="1" stroke="#34A853" strokeWidth="2"/>
                        <rect x="4" y="14" width="16" height="6" rx="1" stroke="#34A853" strokeWidth="2"/>
                        <circle cx="8" cy="7" r="1" fill="#34A853"/>
                        <circle cx="8" cy="17" r="1" fill="#34A853"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="button-container">
              <Button type="primary" onClick={nextPage} className="button">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Page 2: Setup */}
        {currentPage === 2 && (
          <div className="page active">
            <h1 className="page-title">Quick Setup</h1>
            <p className="page-subtitle">Connect to the companion app</p>

            <div className="setup-container">
              <div className="setup-step">
                <div className="step-marker">
                  <span className="step-number">1</span>
                </div>
                <div className="step-line"></div>
                <div className="step-content">
                  <h3 className="step-title">Install the Companion App</h3>
                  <p className="step-description">
                    Make sure you have the Open Headers companion app installed and running on your computer.
                  </p>
                  <Button type="primary" className="button">
                    <a href="https://github.com/OpenHeaders/open-headers-app/releases" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
                      Download App
                    </a>
                  </Button>
                </div>
              </div>

              <div className="setup-step">
                <div className="step-marker">
                  <span className="step-number">2</span>
                </div>
                <div className="step-content">
                  <h3 className="step-title">Verify Connection</h3>
                  <p className="step-description">
                    We'll verify the connection to the companion app.
                  </p>
                  <div className="connection-status status-connecting">
                    <div className="status-dot"></div>
                    <span>Checking connection...</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="button-container">
              <Button onClick={prevPage} className="button secondary">
                Back
              </Button>
              <Button type="primary" onClick={nextPage} className="button">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Page 3: Pin Extension */}
        {currentPage === 3 && (
          <div className="page active">
            <h1 className="page-title">Ready, set, internet 🎉</h1>
            <p className="page-subtitle">Now you can use Open Headers to manage your HTTP headers.</p>

            <div className="completion-visual">
              <div className="toolbar-visual">
                <div className="browser-toolbar">
                  <div className="address-bar"></div>
                  <div className="toolbar-section">
                    <div className="extension-icons">
                      <div className="icon-placeholder"></div>
                      <div className="icon-placeholder"></div>
                      <div className="extension-icon pulsing">
                        <div className="focus-circle"></div>
                        <svg className="browser-extension-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="3" y="3" width="7" height="7" rx="1" fill="#4285F4"/>
                          <rect x="14" y="3" width="7" height="7" rx="1" fill="#4285F4"/>
                          <rect x="3" y="14" width="7" height="7" rx="1" fill="#4285F4"/>
                          <rect x="14" y="14" width="7" height="7" rx="1" fill="#4285F4"/>
                        </svg>
                      </div>
                      <div className="menu-dots">
                        <span></span><span></span><span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pin-steps">
                <div className="pin-step">
                  <div className="step-circle">1</div>
                  <div className="step-text">
                    <p className="step-label">Click the extensions menu ⋮</p>
                    <p className="step-detail">Open the browser's extensions menu in the toolbar</p>
                  </div>
                </div>

                <div className="pin-step">
                  <div className="step-circle">2</div>
                  <div className="step-text">
                    <p className="step-label">Find Open Headers extension</p>
                    <div className="extension-item">
                      <img src="images/icon16.png" className="ext-icon" alt="Open Headers" />
                      <span className="ext-name">Open Headers</span>
                      <span className="icon-button small">⚙</span>
                    </div>
                  </div>
                </div>

                <div className="pin-step">
                  <div className="step-circle">3</div>
                  <div className="step-text">
                    <p className="step-label">Click "Pin to Toolbar"</p>
                    <div className="pin-action">
                      <div className="pin-icon">📌</div>
                      <div className="pin-text">Pin to toolbar</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="button-container">
              <Button onClick={prevPage} className="button secondary">
                Back
              </Button>
              <Button type="primary" onClick={finishWelcome} className="button">
                Finish
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomeApp;