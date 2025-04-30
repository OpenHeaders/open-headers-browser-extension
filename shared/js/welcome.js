/**
 * Welcome page JavaScript
 * Handles browser detection and browser-specific setup flows
 */

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const step0 = document.getElementById('step0');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');
    const finalStepNumber = document.getElementById('finalStepNumber');
    const downloadAppButton = document.getElementById('downloadAppButton');
    const appStatus = document.getElementById('appStatus');
    const appStatusText = document.getElementById('appStatusText');
    const openCertButton = document.getElementById('openCertButton');
    const connectionStatus = document.getElementById('connectionStatus');
    const statusText = document.getElementById('statusText');
    const completionButtons = document.getElementById('completionButtons');
    const finishButton = document.getElementById('finishButton');
    const retryButton = document.getElementById('retryButton');

    // Hide the completion buttons initially
    if (completionButtons) {
        completionButtons.style.display = 'none';
    }

    // State variables
    let certWindowReference = null;
    let connectionCheckInterval = null;
    let connectionCheckCount = 0;
    const MAX_CONNECTION_CHECKS = 10;

    // Flag to track if we've already detected a successful connection
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
                el.style.display = el.classList.contains('step') ? 'flex' : 'block';
            });

            // Set the final step number
            if (finalStepNumber) {
                finalStepNumber.textContent = '4';
            }
        } else {
            // For non-Firefox browsers, show non-Firefox elements
            document.querySelectorAll('.non-firefox').forEach(el => {
                el.style.display = el.classList.contains('step') ? 'flex' : 'block';
            });

            // Set the final step number
            if (finalStepNumber) {
                finalStepNumber.textContent = '2';
            }
        }

        // Show browser-specific info boxes
        if (currentBrowser && document.querySelector(`.${currentBrowser}-only`)) {
            document.querySelectorAll(`.${currentBrowser}-only`).forEach(el => {
                if (!el.classList.contains('step')) {
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
     * Set up event listeners
     */
    function setupEventListeners() {
        // For Firefox - certificate button
        if (currentBrowser === 'firefox' && openCertButton) {
            openCertButton.addEventListener('click', function() {
                // Open certificate page
                certWindowReference = window.open('https://127.0.0.1:59211/accept-cert', '_blank');

                // Mark step as completed and proceed
                if (step1) step1.classList.add('completed');
                if (step2) step2.classList.add('active');

                // Start connection check after delay
                setTimeout(startConnectionCheck, 5000);
            });
        }

        // Finish button
        if (finishButton) {
            finishButton.addEventListener('click', function(e) {
                e.preventDefault();

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

        // Retry button
        if (retryButton) {
            retryButton.addEventListener('click', function(e) {
                e.preventDefault();

                if (currentBrowser === 'firefox') {
                    // For Firefox, open certificate page again
                    certWindowReference = window.open('https://127.0.0.1:59211/accept-cert', '_blank');
                }

                // Restart connection check
                startConnectionCheck();
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
                    if (appStatus) appStatus.className = 'app-status success';
                    if (appStatusText) appStatusText.textContent = 'App is running';
                    if (downloadAppButton) downloadAppButton.style.display = 'none';

                    // Mark step as completed
                    if (step0) step0.classList.add('completed');

                    // Clear the app check interval if it exists
                    if (appCheckInterval) {
                        clearInterval(appCheckInterval);
                        appCheckInterval = null;
                    }

                    // For Firefox, proceed to step 1
                    // For others, proceed to connection check
                    if (currentBrowser === 'firefox') {
                        if (step1) step1.classList.add('active');
                    } else {
                        if (step3) step3.classList.add('active');
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
        if (step3) step3.classList.add('active');
        if (connectionStatus) connectionStatus.className = 'status-indicator status-connecting';
        if (statusText) statusText.textContent = 'Checking connection...';

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
        if (statusText) {
            statusText.textContent = `Checking connection (${connectionCheckCount}/${MAX_CONNECTION_CHECKS})...`;
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
                if (connectionStatus) connectionStatus.className = 'status-indicator status-connected';
                if (statusText) statusText.textContent = 'Connection successful!';

                // Complete steps
                if (currentBrowser === 'firefox') {
                    if (step2) step2.classList.add('completed');
                    if (step3) step3.classList.add('completed');

                    // Store certificate acceptance
                    if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
                        browser.storage.local.set({
                            certificateAccepted: true,
                            certificateAcceptedTime: Date.now(),
                            setupCompleted: true,
                            setupCompletedTime: Date.now()
                        });
                    }
                } else {
                    if (step3) step3.classList.add('completed');

                    // Store setup completion for non-Firefox browsers too
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.set({
                            setupCompleted: true,
                            setupCompletedTime: Date.now()
                        });
                    }
                }

                // Show completion buttons
                if (completionButtons) completionButtons.style.display = 'flex';
                if (retryButton) retryButton.style.display = 'none';
                if (finishButton) finishButton.textContent = 'Continue';

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
            if (connectionStatus) connectionStatus.className = 'status-indicator status-error';
            if (statusText) {
                statusText.textContent = currentBrowser === 'firefox'
                    ? 'Connection failed. Please make sure you accepted the certificate.'
                    : 'Connection failed. Please make sure the app is running.';
            }

            // Configure retry button
            if (retryButton && currentBrowser === 'firefox') {
                retryButton.href = 'https://127.0.0.1:59211/accept-cert';
                retryButton.target = '_blank';
            } else if (retryButton) {
                retryButton.href = '#';
                retryButton.target = '';
            }

            // Show buttons
            if (completionButtons) completionButtons.style.display = 'flex';
            if (retryButton) retryButton.style.display = 'inline-block';
            if (finishButton) finishButton.textContent = 'Continue Anyway';
        }
    }

    // Initialize the page
    initializePage();
});