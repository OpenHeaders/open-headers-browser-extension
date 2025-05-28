// export.js - Handles export success page with countdown

document.addEventListener('DOMContentLoaded', function() {
    // Get URL parameters
    const urlParams = new URLSearchParams(window.location.search);

    // Update displayed values
    const filename = urlParams.get('filename') || 'open-headers-config.json';
    const ruleCount = urlParams.get('rules') || '0';
    const sourceCount = urlParams.get('sources') || '0';
    const fileSize = urlParams.get('size') || '0';

    // Update DOM elements
    document.getElementById('filename').textContent = filename;
    document.getElementById('ruleCount').textContent = ruleCount;
    document.getElementById('sourceCount').textContent = sourceCount;
    document.getElementById('filesize').textContent = fileSize;

    // Format current time
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    document.getElementById('exportTime').textContent = timeString;

    // Countdown functionality
    let countdownInterval;
    let remaining = 5; // Start at 5 seconds

    const startCountdown = () => {
        const countdownEl = document.getElementById('countdownNumber');

        countdownInterval = setInterval(() => {
            remaining--;

            if (remaining > 0) {
                countdownEl.textContent = remaining;
            } else {
                clearInterval(countdownInterval);
                window.close();
            }
        }, 1000);
    };

    // Start countdown immediately
    startCountdown();

    // Handle close button
    document.getElementById('closeButton').addEventListener('click', function() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        window.close();
    });
});