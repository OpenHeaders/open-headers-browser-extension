document.addEventListener('DOMContentLoaded', function() {
    // Main elements
    const pages = document.querySelectorAll('.page');
    const indicators = document.querySelectorAll('.indicator-dot');

    // Setup step elements
    const stepAppInstall = document.getElementById('step-app-install');
    const stepCertificate = document.getElementById('step-certificate');
    const stepCertVerify = document.getElementById('step-cert-verify');
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
    const certButton = document.getElementById('cert-button');
    const connectionStatus = document.getElementById('connection-status');
    const connectionStatusText = document.getElementById('connection-status-text');
    const connectionStepNumber = document.getElementById('connection-step-number');

    // State variables
    let certWindowReference = null;
    let connectionCheckInterval = null;
    let connectionCheckCount = 0;
    const MAX_CONNECTION_CHECKS = 10;

    // Status flags
    let connectionSuccessful = false;
    let appRunning = false;
    let appCheckInterval = null;
    let currentBrowser = 'unknown';

    /**
     * Detects the current browser
     * @returns {string} - The detected browser ('firefox', 'chrome', 'edge', 'safari', or 'unknown')
     */
    function detectBrowser() {
        const userAgent = navigator.userAgent.toLowerCase();

        if (userAgent.indexOf('firefox') !== -1) {
            return 'firefox';
        } else if (userAgent.indexOf('edg') !== -1) {
            return 'edge';
        } else if (userAgent.indexOf('chrome') !== -1) {
            return 'chrome';
        } else if (userAgent.indexOf('safari') !== -1) {
            return 'safari';
        }

        return 'unknown';
    }

    /**
     * Shows elements specific to the detected browser
     */
    function showBrowserSpecificElements() {
        // For Firefox, show Firefox-specific elements and update step numbers
        if (currentBrowser === 'firefox') {
            // Force Firefox steps to be visible
            document.querySelectorAll('.firefox-only').forEach(el => {
                el.style.display = el.classList.contains('setup-step') ? 'flex' : 'block';
            });

            // Set the connection step number for Firefox
            if (connectionStepNumber) {
                connectionStepNumber.textContent = '4';
            }
        } else {
            // For non-Firefox browsers, show non-Firefox elements
            document.querySelectorAll('.non-firefox').forEach(el => {
                el.style.display = el.classList.contains('setup-step') ? 'flex' : 'block';
            });

            // Set the connection step number for non-Firefox
            if (connectionStepNumber) {
                connectionStepNumber.textContent = '2';
            }

            // Make sure Firefox steps are hidden for other browsers
            document.querySelectorAll('.firefox-only').forEach(el => {
                el.style.display = 'none';
            });

            // Add proper connecting lines for non-Firefox browsers
            const stepAppInstall = document.getElementById('step-app-install');
            const stepConnection = document.getElementById('step-connection');

            if (stepAppInstall) {
                const stepLine = stepAppInstall.querySelector('.step-line');
                if (stepLine) {
                    stepLine.style.height = '40px'; // Adjust line height to connect to step 4
                }
            }
        }

        // Show browser-specific info boxes
        if (currentBrowser && document.querySelector(`.${currentBrowser}-only`)) {
            document.querySelectorAll(`.${currentBrowser}-only`).forEach(el => {
                if (!el.classList.contains('setup-step')) {
                    el.style.display = 'block';
                }
            });
        }
    }

    /**
     * Initialize the welcome page
     */
    function initializePage() {
        // Detect browser
        currentBrowser = detectBrowser();
        console.log('Detected browser:', currentBrowser);

        // Show browser-specific elements
        showBrowserSpecificElements();

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
                        setupCompletedTime: Date.now(),
                        certificateAccepted: currentBrowser === 'firefox' ? connectionSuccessful : undefined
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

        // For Firefox - certificate button
        if (currentBrowser === 'firefox' && certButton) {
            certButton.addEventListener('click', function() {
                // Open certificate page
                certWindowReference = window.open('https://127.0.0.1:59211/accept-cert', '_blank');

                // Mark step as completed and proceed
                if (stepCertificate) {
                    const marker = stepCertificate.querySelector('.step-marker');
                    if (marker) marker.classList.add('completed');
                }
                if (stepCertVerify) stepCertVerify.classList.add('active');

                // Start connection check after delay
                setTimeout(startConnectionCheck, 5000);
            });
        }
    }

    /**
     * Check if the companion app is running
     */
    function checkAppRunning() {
        console.log('Checking if companion app is running...');

        const xhr = new XMLHttpRequest();
        xhr.timeout = 2000;

        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status === 200 || xhr.status === 426) {
                    // App is running
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

                    // For Firefox, proceed to certificate step
                    // For others, proceed to connection check
                    if (currentBrowser === 'firefox') {
                        if (stepCertificate) stepCertificate.classList.add('active');
                    } else {
                        if (stepConnection) stepConnection.classList.add('active');
                        startConnectionCheck();
                    }
                } else {
                    // App not running
                    appRunning = false;

                    // Set up automatic retry
                    if (!appCheckInterval) {
                        appCheckInterval = setInterval(checkAppRunning, 2000);
                    }
                }
            }
        };

        xhr.ontimeout = function() { appRunning = false; };
        xhr.onerror = function() { appRunning = false; };

        try {
            xhr.open('HEAD', 'http://127.0.0.1:59210/ping', true);
            xhr.send();
        } catch (e) {
            appRunning = false;
        }
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
     * Check connection
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

        // Choose appropriate endpoint based on browser
        const endpoint = currentBrowser === 'firefox'
            ? 'https://127.0.0.1:59211/ping'
            : 'http://127.0.0.1:59210/ping';

        const xhr = new XMLHttpRequest();
        xhr.timeout = 2000;

        xhr.onreadystatechange = function() {
            if (connectionSuccessful || xhr.readyState !== 4) {
                return;
            }

            if (xhr.status === 200 || xhr.status === 426) {
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

                // Complete Firefox-specific steps if needed
                if (currentBrowser === 'firefox') {
                    if (stepCertVerify) {
                        const marker = stepCertVerify.querySelector('.step-marker');
                        if (marker) marker.classList.add('completed');
                    }

                    // Store certificate acceptance
                    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                        browser.storage.local.set({
                            certificateAccepted: true,
                            certificateAcceptedTime: Date.now()
                        });
                    }
                } else {
                    // Store connection verification for non-Firefox browsers too
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({
                            connectionVerified: true,
                            connectionVerifiedTime: Date.now()
                        });
                    }
                }

                // Close certificate window if still open
                if (certWindowReference && !certWindowReference.closed) {
                    certWindowReference.close();
                }
            }
        };

        xhr.ontimeout = handleConnectionProgress;
        xhr.onerror = handleConnectionProgress;

        try {
            xhr.open('GET', endpoint + '?t=' + Date.now(), true);
            xhr.send();
        } catch (e) {
            handleConnectionProgress();
        }
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
                connectionStatusText.textContent = currentBrowser === 'firefox'
                    ? 'Connection failed. Please make sure you accepted the certificate.'
                    : 'Connection failed. Please make sure the app is running.';
            }

            // Update navigation buttons
            updateNavigationButtons();
        }
    }

    // Initialize the page
    initializePage();
});