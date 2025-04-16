/**
 * Notification system for the popup UI
 */

/**
 * Creates and shows a notification in the popup UI.
 * @param {string} message - The notification message to display
 * @param {boolean} isError - Whether this is an error notification
 * @param {number} timeout - How long to show the notification (ms)
 */
export function showNotification(message, isError = false, timeout = 5000) {
    // Create notification container if it doesn't exist
    let notificationContainer = document.querySelector('.notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.classList.add('notification-container');
        document.body.insertBefore(notificationContainer, document.body.firstChild);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.classList.add('notification');
    if (isError) {
        notification.classList.add('notification-error');
    } else {
        notification.classList.add('notification-info');
    }
    notification.textContent = message;

    // Add close button
    const closeButton = document.createElement('span');
    closeButton.classList.add('notification-close');
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => {
        notification.remove();
    });
    notification.appendChild(closeButton);

    // Add to container
    notificationContainer.appendChild(notification);

    // Auto-remove after timeout
    setTimeout(() => {
        notification.classList.add('notification-fade');
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, timeout);
}