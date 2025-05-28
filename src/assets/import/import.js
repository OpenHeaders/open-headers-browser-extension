// import.js - Handles import logic on dedicated import page

// Get browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Helper function for safe message sending
const sendMessage = (message) => {
    return new Promise((resolve) => {
        browserAPI.runtime.sendMessage(message, (response) => {
            if (browserAPI.runtime.lastError) {
                console.error('Message error:', browserAPI.runtime.lastError.message);
                resolve({ error: browserAPI.runtime.lastError.message });
            } else {
                resolve(response || {});
            }
        });
    });
};

// Show status message
const showStatus = (message, type) => {
    const statusEl = document.getElementById('statusMessage');
    const countdownEl = document.getElementById('countdown');

    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';

    // Hide countdown for non-success messages
    if (type !== 'success') {
        countdownEl.classList.remove('visible');
    }
};

// Show countdown and auto-close
const showCountdownAndClose = (seconds = 3) => {
    const countdownEl = document.getElementById('countdown');
    const countdownNumberEl = document.getElementById('countdownNumber');

    // Show countdown
    countdownEl.classList.add('visible');

    let remaining = seconds;
    countdownNumberEl.textContent = remaining;

    const countdownInterval = setInterval(() => {
        remaining--;

        if (remaining > 0) {
            countdownNumberEl.textContent = remaining;
        } else {
            clearInterval(countdownInterval);
            window.close();
        }
    }, 1000);
};

// Handle file selection
const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log('File selected:', file.name);
    showStatus('Reading configuration file...', 'loading');

    try {
        // Read file content
        const fileContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });

        // Parse JSON
        let config;
        try {
            config = JSON.parse(fileContent);
        } catch (parseError) {
            console.error('Parse error:', parseError);
            showStatus('Failed to parse configuration file. Please ensure it\'s a valid JSON file.', 'error');
            return;
        }

        // Validate configuration
        if (!config.savedData) {
            showStatus('Invalid configuration file: savedData is missing.', 'error');
            return;
        }

        showStatus('Importing configuration...', 'loading');

        // Send to background script
        const response = await sendMessage({
            type: 'importConfiguration',
            config: config
        });

        if (response.error) {
            showStatus(`Import failed: ${response.error}`, 'error');
        } else if (response.success) {
            const ruleCount = Object.keys(config.savedData).length;
            const sourceCount = config.dynamicSources ? config.dynamicSources.length : 0;

            let successMessage = `✓ Successfully imported ${ruleCount} rule${ruleCount !== 1 ? 's' : ''}`;
            if (sourceCount > 0) {
                successMessage += ` and ${sourceCount} dynamic source${sourceCount !== 1 ? 's' : ''}`;
            }

            showStatus(successMessage, 'success');

            // Show countdown and auto-close
            showCountdownAndClose(3);
        } else {
            showStatus('Import failed: Unknown error', 'error');
        }

    } catch (error) {
        console.error('Import error:', error);
        showStatus(`Import failed: ${error.message}`, 'error');
    }

    // Reset file input
    event.target.value = '';
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const chooseFileButton = document.getElementById('chooseFileButton');
    const closeButton = document.getElementById('closeButton');

    // Handle file input change
    fileInput.addEventListener('change', handleFileSelect);

    // Handle choose file button click
    chooseFileButton.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle close button click
    closeButton.addEventListener('click', () => {
        window.close();
    });
});