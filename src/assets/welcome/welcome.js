document.addEventListener('DOMContentLoaded', function() {
    // Main elements
    const pages = document.querySelectorAll('.page');
    const indicators = document.querySelectorAll('.indicator-dot');

    // Setup step elements
    const stepAppInstall = document.getElementById('step-app-install');
    const stepConnection = document.getElementById('step-connection');

    // Button elements
    const welcomeNext = document.getElementById('welcome-next');
    const setupBack = document.getElementById('setup-back');
    const setupNext = document.getElementById('setup-next');
    const finishBack = document.getElementById('finish-back');
    const finish = document.getElementById('finish');

    // Status and action elements
    const downloadAppButton = document.getElementById('download-app-button');
    const appStatus = document.getElementById('app-status');
    const appStatusText = document.getElementById('app-status-text');
    const connectionStatus = document.getElementById('connection-status');
    const connectionStatusText = document.getElementById('connection-status-text');

    // State variables
    let connectionCheckInterval = null;
    let connectionCheckCount = 0;
    const MAX_CONNECTION_CHECKS = 10;

    // Status flags
    let connectionSuccessful = false;
    let appRunning = false;
    let appCheckInterval = null;
    let appCheckAttempts = 0;

    /**
     * Initialize the welcome page
     */
    function initializePage() {
        console.log(new Date().toISOString(), 'INFO ', '[WelcomePage]', 'Initializing welcome page');

        // Display version from manifest
        const versionEl = document.getElementById('app-version');
        if (versionEl) {
            const messageAPI = typeof browser !== 'undefined' ? browser : chrome;
            const manifest = messageAPI.runtime.getManifest();
            versionEl.textContent = 'v' + (manifest.version_name || manifest.version);
        }

        // Set up event listeners
        setupEventListeners();

        // Check if app is running
        checkAppRunning();
    }

    /**
     * Updates the navigation button states based on the current status
     */
    function updateNavigationButtons() {
        if (setupNext) {
            if (connectionSuccessful) {
                setupNext.textContent = 'Continue';
                setupNext.style.backgroundColor = '#34A853'; // Success color
            } else if (connectionCheckCount >= MAX_CONNECTION_CHECKS) {
                setupNext.textContent = 'Continue Anyway';
            }
        }
    }

    /**
     * Navigates to a specific page
     * @param {number} pageNumber - The page number to show (1-based)
     */
    function showPage(pageNumber) {
        // Update pages
        pages.forEach((page, index) => {
            const pageNum = index + 1;
            page.classList.remove('active', 'prev');

            if (pageNum < pageNumber) {
                page.classList.add('prev');
            } else if (pageNum === pageNumber) {
                page.classList.add('active');
            }
        });

        // Update indicator dots
        indicators.forEach((dot, index) => {
            dot.classList.toggle('active', index + 1 === pageNumber);
        });
    }

    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Navigation buttons
        if (welcomeNext) {
            welcomeNext.addEventListener('click', () => showPage(2));
        }

        if (setupBack) {
            setupBack.addEventListener('click', () => showPage(1));
        }

        if (setupNext) {
            setupNext.addEventListener('click', () => showPage(3));
        }

        if (finishBack) {
            finishBack.addEventListener('click', () => showPage(2));
        }

        if (finish) {
            finish.addEventListener('click', function() {
                // Record setup completion
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                    browser.storage.local.set({
                        setupCompleted: true,
                        setupCompletedTime: Date.now()
                    });
                } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({
                        setupCompleted: true,
                        setupCompletedTime: Date.now()
                    });
                }

                // Close page
                window.close();
            });
        }
    }

    /**
     * Check if the local app is running by asking the background script
     */
    function checkAppRunning() {
        appCheckAttempts++;
        if (appCheckAttempts <= 1) {
            console.log(new Date().toISOString(), 'INFO ', '[WelcomePage]', 'Checking if local app is running via background script...');
        }

        // Use browser messaging to check connection status
        const messageAPI = typeof browser !== 'undefined' ? browser : chrome;

        messageAPI.runtime.sendMessage({ type: 'checkConnection' }, (response) => {
            if (response && response.connected) {
                // App is running and connected
                appRunning = true;

                // Update UI
                if (appStatus) {
                    appStatus.className = 'app-status success';
                    appStatus.querySelector('.loading-spinner').style.display = 'none';
                }
                if (appStatusText) appStatusText.textContent = '✓ App is running';
                if (downloadAppButton) downloadAppButton.style.display = 'none';

                // Mark step as completed
                if (stepAppInstall) {
                    const marker = stepAppInstall.querySelector('.step-marker');
                    if (marker) marker.classList.add('completed');
                }

                // Clear the app check interval if it exists
                if (appCheckInterval) {
                    clearInterval(appCheckInterval);
                    appCheckInterval = null;
                }

                // Go directly to connection verification
                if (stepConnection) stepConnection.classList.add('active');

                // Mark connection as successful immediately
                connectionSuccessful = true;
                if (connectionStatus) connectionStatus.className = 'connection-status status-connected';
                if (connectionStatusText) connectionStatusText.textContent = '✓ Connection successful!';

                // Mark the connection step as completed
                if (stepConnection) {
                    const marker = stepConnection.querySelector('.step-marker');
                    if (marker) marker.classList.add('completed');
                }

                // Update navigation buttons
                updateNavigationButtons();
            } else {
                // App not running
                appRunning = false;

                // Set up automatic retry
                if (!appCheckInterval) {
                    appCheckInterval = setInterval(checkAppRunning, 2000);
                }
            }
        });
    }

    /**
     * Start checking connection
     */
    function startConnectionCheck() {
        // If already confirmed successful, don't start checking again
        if (connectionSuccessful) {
            return;
        }

        // Update UI
        if (stepConnection) stepConnection.classList.add('active');
        if (connectionStatus) connectionStatus.className = 'connection-status status-connecting';
        if (connectionStatusText) connectionStatusText.textContent = 'Checking connection...';

        // Reset counter
        connectionCheckCount = 0;

        // Clear existing interval
        if (connectionCheckInterval) {
            clearInterval(connectionCheckInterval);
        }

        // Set up new interval
        connectionCheckInterval = setInterval(checkConnection, 2000);

        // Do immediate check
        setTimeout(checkConnection, 100);
    }

    /**
     * Check connection using the background script
     */
    function checkConnection() {
        // Skip if already successful or beyond max attempts
        if (connectionSuccessful || connectionCheckCount >= MAX_CONNECTION_CHECKS) {
            return;
        }

        // Update counter
        connectionCheckCount++;
        if (connectionStatusText) {
            connectionStatusText.textContent = `Checking connection (${connectionCheckCount}/${MAX_CONNECTION_CHECKS})...`;
        }

        // Use browser messaging to check connection status
        const messageAPI = typeof browser !== 'undefined' ? browser : chrome;

        messageAPI.runtime.sendMessage({ type: 'checkConnection' }, (response) => {
            if (connectionSuccessful) {
                return; // Already successful, ignore
            }

            if (response && response.connected) {
                // Connection successful - set flag first to prevent races
                connectionSuccessful = true;

                // Clean up interval
                if (connectionCheckInterval) {
                    clearInterval(connectionCheckInterval);
                    connectionCheckInterval = null;
                }

                // Update UI
                if (connectionStatus) connectionStatus.className = 'connection-status status-connected';
                if (connectionStatusText) connectionStatusText.textContent = '✓ Connection successful!';

                // Update navigation buttons
                updateNavigationButtons();

                // Mark the connection step as completed
                if (stepConnection) {
                    const marker = stepConnection.querySelector('.step-marker');
                    if (marker) marker.classList.add('completed');
                }

                // Store connection verification
                if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                    browser.storage.local.set({
                        connectionVerified: true,
                        connectionVerifiedTime: Date.now()
                    });
                } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({
                        connectionVerified: true,
                        connectionVerifiedTime: Date.now()
                    });
                }
            } else {
                handleConnectionProgress();
            }
        });
    }

    /**
     * Handle connection progress/failure
     */
    function handleConnectionProgress() {
        if (connectionSuccessful) return;

        if (connectionCheckCount >= MAX_CONNECTION_CHECKS) {
            // Max attempts reached
            if (connectionCheckInterval) {
                clearInterval(connectionCheckInterval);
                connectionCheckInterval = null;
            }

            // Update UI
            if (connectionStatus) connectionStatus.className = 'connection-status status-error';
            if (connectionStatusText) {
                connectionStatusText.textContent = 'Connection failed. Please make sure the app is running.';
            }

            // Update navigation buttons
            updateNavigationButtons();
        }
    }

    // Initialize the page
    initializePage();
});