/**
 * Recording widget that displays on the page during recording
 * Shows timer and stop button
 */
(function() {
    'use strict';

    let widget = null;
    let timerInterval = null;
    let startTime = Date.now();
    let timerElement = null;

    // Store references to drag handlers for cleanup
    let dragHandlers = null;

    // Create widget HTML
    function createWidget() {
        // Create container to prevent stretching
        const container = document.createElement('div');
        container.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            z-index: 2147483647 !important;
            width: fit-content !important;
            height: auto !important;
            max-width: 300px !important;
            pointer-events: none !important;
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
            outline: none !important;
            box-shadow: none !important;
        `;
        
        // Create widget element 
        widget = document.createElement('div');
        widget.id = 'open-headers-recording-widget';
        widget.style.cssText = `
            background: #2a2a2a !important;
            border-radius: 30px !important;
            padding: 8px 16px !important;
            display: inline-block !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            user-select: none !important;
            cursor: move !important;
            transition: transform 0.2s ease !important;
            white-space: nowrap !important;
            pointer-events: all !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            width: auto !important;
            height: auto !important;
            line-height: normal !important;
            text-align: left !important;
            color: white !important;
            font-size: 14px !important;
        `;
        
        // Create timer element
        timerElement = document.createElement('span');
        timerElement.id = 'open-headers-timer';
        timerElement.style.cssText = `
            color: white !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            display: inline-block !important;
            min-width: 45px !important;
            margin-right: 12px !important;
            vertical-align: middle !important;
            line-height: 32px !important;
        `;
        timerElement.textContent = '00:00';
        
        // Create stop button
        const stopBtn = document.createElement('button');
        stopBtn.id = 'open-headers-stop-btn';
        stopBtn.style.cssText = `
            background: #dc3545 !important;
            color: white !important;
            border: none !important;
            border-radius: 20px !important;
            padding: 8px 16px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            cursor: pointer !important;
            display: inline-block !important;
            transition: background 0.2s ease !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            line-height: 16px !important;
            text-decoration: none !important;
            outline: none !important;
            font-family: inherit !important;
            text-transform: none !important;
            letter-spacing: normal !important;
            text-align: center !important;
            vertical-align: middle !important;
            white-space: nowrap !important;
            -webkit-appearance: none !important;
            -moz-appearance: none !important;
            appearance: none !important;
            width: auto !important;
            height: auto !important;
        `;
        
        // Create icon as span element
        const icon = document.createElement('span');
        icon.style.cssText = `
            display: inline-block !important;
            width: 12px !important;
            height: 12px !important;
            margin-right: 6px !important;
            vertical-align: middle !important;
            background: currentColor !important;
            border-radius: 50% !important;
        `;
        
        // Create text span
        const buttonText = document.createElement('span');
        buttonText.style.cssText = `
            display: inline !important;
            vertical-align: middle !important;
        `;
        buttonText.textContent = 'Stop & Save';
        
        // Assemble button
        stopBtn.appendChild(icon);
        stopBtn.appendChild(buttonText);
        
        // Assemble widget
        widget.appendChild(timerElement);
        widget.appendChild(stopBtn);
        
        // Add widget to container
        container.appendChild(widget);
        document.body.appendChild(container);
        
        // Store container reference
        widget._container = container;
        
        // Add hover effect
        stopBtn.addEventListener('mouseenter', () => {
            stopBtn.style.background = '#c82333';
        });
        stopBtn.addEventListener('mouseleave', () => {
            stopBtn.style.background = '#dc3545';
        });

        // Set initial position to bottom-left with transform
        const initialLeft = 20;
        const initialBottom = 20;
        const viewportHeight = window.innerHeight;
        const widgetHeight = container.offsetHeight;
        const initialTop = viewportHeight - widgetHeight - initialBottom;

        // Make widget draggable
        let isDragging = false;
        let currentX = initialLeft;
        let currentY = initialTop;
        let initialX = 0;
        let initialY = 0;
        let xOffset = initialLeft;
        let yOffset = initialTop;
        
        // Apply initial position
        container.style.transform = `translate(${currentX}px, ${currentY}px)`;

        // Store drag handlers for cleanup
        dragHandlers = {
            dragStart: dragStart,
            drag: drag,
            dragEnd: dragEnd
        };

        widget.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target === stopBtn || stopBtn.contains(e.target)) {
                return;
            }
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            if (widget) {
                widget.style.cursor = 'grabbing';
            }
        }

        function drag(e) {
            if (!isDragging || !container) return;
            e.preventDefault();
            
            // Calculate new position
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            
            // Get widget dimensions (use offsetWidth/Height for accurate dimensions)
            const widgetWidth = container.offsetWidth;
            const widgetHeight = container.offsetHeight;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Calculate boundaries
            const leftBoundary = 0;
            const rightBoundary = viewportWidth - widgetWidth;
            const topBoundary = 0;
            const bottomBoundary = viewportHeight - widgetHeight;
            
            // Constrain position to viewport
            currentX = Math.max(leftBoundary, Math.min(currentX, rightBoundary));
            currentY = Math.max(topBoundary, Math.min(currentY, bottomBoundary));
            
            xOffset = currentX;
            yOffset = currentY;

            container.style.transform = `translate(${currentX}px, ${currentY}px)`;
        }

        function dragEnd() {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
            if (widget) {
                widget.style.cursor = 'move';
            }
        }

        // Add click handler for stop button
        stopBtn.addEventListener('click', handleStopRecording);
    }

    // Update timer display
    function updateTimer() {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        if (timerElement) {
            timerElement.textContent = `${minutes}:${seconds}`;
        }
    }

    // Handle stop recording
    function handleStopRecording() {
        // Send message to content script to stop recording
        window.postMessage({
            type: 'OPEN_HEADERS_RECORDING_WIDGET_STOP',
            source: 'recording-widget'
        }, '*');
    }

    // Start the widget
    function startWidget(existingStartTime) {
        // Check if widget already exists in DOM
        const existingWidget = document.getElementById('open-headers-recording-widget');
        if (existingWidget || widget) {
            console.log('[Recording Widget] Widget already exists, skipping creation');
            return; // Already running
        }

        if (existingStartTime) {
            startTime = existingStartTime;
        } else {
            startTime = Date.now();
        }

        createWidget();
        updateTimer(); // Update immediately
        timerInterval = setInterval(updateTimer, 1000);
    }

    // Stop the widget
    function stopWidget() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        // Remove drag event listeners
        if (dragHandlers) {
            document.removeEventListener('mousemove', dragHandlers.drag);
            document.removeEventListener('mouseup', dragHandlers.dragEnd);
            dragHandlers = null;
        }
        
        if (widget && widget._container) {
            widget._container.remove();
            widget = null;
            timerElement = null;
        }
        
        // Also try to remove by ID in case reference was lost
        const existingWidget = document.getElementById('open-headers-recording-widget');
        if (existingWidget && existingWidget.parentElement) {
            existingWidget.parentElement.remove();
        }
    }

    // Listen for messages from content script
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        // Handle existing message format
        if (event.data && event.data.type === 'OPEN_HEADERS_RECORDING_WIDGET_COMMAND') {
            switch (event.data.action) {
                case 'start':
                    startWidget(event.data.startTime);
                    break;
                case 'stop':
                    stopWidget();
                    break;
            }
        }
        
        // Handle new content script message format
        if (event.data && event.data.source === 'open-headers-content') {
            switch (event.data.action) {
                case 'initWidget':
                    const data = event.data.data;
                    if (data.isPreNav) {
                        // Show pre-navigation state
                        console.log('[Widget] Pre-navigation mode');
                    }
                    startWidget(data.startTime);
                    break;
                case 'updateWidget':
                    const updateData = event.data.data;
                    if (updateData.status === 'recording' && updateData.startTime) {
                        // Update start time for pre-nav transition
                        startTime = updateData.startTime;
                    }
                    break;
                case 'removeWidget':
                    stopWidget();
                    break;
            }
        }
    });

    // Expose API for direct calls if needed
    window.__openHeadersRecordingWidget = {
        start: startWidget,
        stop: stopWidget
    };
})();