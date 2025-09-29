/**
 * Unified recording state management with flow support and performance optimization
 */
export class RecordingState {
  constructor(recordId, startTime = Date.now()) {
    this.recordId = recordId;
    this.startTime = startTime;
    this.originalStartTime = startTime;
    this.isRecording = true;
    this.useWidget = false;
    this.tabId = null;
    this.currentUrl = null;
    
    // Flow type tracking
    this.flowType = null; // 'pre-nav', 'nav', or 'oauth-redirect'
    this.isPreNav = false;
    this.hasNavigated = false;
    this.firstPageNavigationTime = null; // Track when first real page loads
    
    // Performance optimization - limit accumulated data
    this.accumulated = {
      events: [],
      console: [],
      network: [],
      storage: [],
      storageState: {
        localStorage: {},
        sessionStorage: {},
        cookies: {}
      },
      // Performance metrics
      eventCount: 0,
      lastCleanup: Date.now()
    };
    
    // Navigation tracking
    this.navigationHistory = [];
    this.redirectChain = [];
    
    // Performance settings
    this.performance = {
      maxEventsPerPage: 10000, // Limit events to prevent memory issues
      maxAccumulatedEvents: 50000, // Total limit across all pages
      cleanupInterval: 60000 // Cleanup every minute
    };
  }
  
  /**
   * Check if URL is a real page (not a browser internal page)
   */
  isRealPageUrl(url) {
    return url && 
           url !== '' && 
           url !== 'about:blank' && 
           !url.startsWith('chrome://') && 
           !url.startsWith('edge://') && 
           !url.startsWith('about:') &&
           !url.startsWith('chrome-extension://');
  }
  
  /**
   * Detect and set flow type based on URL and navigation
   */
  detectFlowType(url) {
    if (!url || url === '' || url === 'about:blank' || url === 'chrome://newtab/' || 
        url === 'edge://newtab/' || url === 'about:newtab') {
      this.flowType = 'pre-nav';
      this.isPreNav = true;
    } else if (this.redirectChain.length > 0 || url.includes('callback') || 
               url.includes('oauth') || url.includes('auth')) {
      this.flowType = 'oauth-redirect';
    } else {
      this.flowType = 'nav';
    }
  }
  
  /**
   * Add navigation to history
   */
  addNavigation(url, timestamp = Date.now()) {
    this.navigationHistory.push({
      url: url,
      timestamp: timestamp
    });
    
    // Update flow type if transitioning from pre-nav
    if (this.isPreNav && this.isRealPageUrl(url)) {
      this.isPreNav = false;
      this.hasNavigated = true;
      this.firstPageNavigationTime = timestamp;
      this.flowType = 'nav';
    }
  }
  
  /**
   * Serialize state for passing between pages (optimized)
   */
  serialize() {
    // For performance, only serialize essential data
    const essentialData = {
      recordId: this.recordId,
      startTime: this.startTime,
      originalStartTime: this.originalStartTime,
      isRecording: this.isRecording,
      useWidget: this.useWidget,
      tabId: this.tabId,
      currentUrl: this.currentUrl,
      flowType: this.flowType,
      isPreNav: this.isPreNav,
      hasNavigated: this.hasNavigated,
      firstPageNavigationTime: this.firstPageNavigationTime,
      navigationHistory: this.navigationHistory.slice(-10), // Keep last 10 navigations
      redirectChain: this.redirectChain.slice(-10), // Keep last 10 redirects
      // Accumulated data summary for size management
      accumulated: {
        eventCount: this.accumulated.events.length,
        consoleCount: this.accumulated.console.length,
        networkCount: this.accumulated.network.length,
        storageCount: this.accumulated.storage.length,
        storageState: this.accumulated.storageState
      }
    };
    
    return JSON.stringify(essentialData);
  }
  
  /**
   * Serialize full state including accumulated data (for final save)
   */
  serializeFull() {
    return JSON.stringify(this);
  }
  
  /**
   * Deserialize state from string
   */
  static deserialize(serialized) {
    const data = JSON.parse(serialized);
    const state = new RecordingState(data.recordId, data.startTime);
    
    // Restore essential properties
    state.originalStartTime = data.originalStartTime;
    state.isRecording = data.isRecording;
    state.useWidget = data.useWidget;
    state.tabId = data.tabId;
    state.currentUrl = data.currentUrl;
    state.flowType = data.flowType;
    state.isPreNav = data.isPreNav;
    state.hasNavigated = data.hasNavigated;
    state.firstPageNavigationTime = data.firstPageNavigationTime;
    state.navigationHistory = data.navigationHistory || [];
    state.redirectChain = data.redirectChain || [];
    
    // Note: Accumulated data needs to be restored separately
    return state;
  }
  
  /**
   * Add navigation event (with flow detection)
   */
  addNavigation(url, timestamp = Date.now()) {
    // Update flow type if transitioning from pre-nav
    if (this.isPreNav && url && this.isRealPageUrl(url)) {
      this.hasNavigated = true;
      this.detectFlowType(url);
      
      // Record when first real page loads in pre-nav flow
      if (!this.firstPageNavigationTime) {
        this.firstPageNavigationTime = timestamp;
        console.log('[RecordingState] Set firstPageNavigationTime:', timestamp, 'for URL:', url);
      }
    }
    
    this.navigationHistory.push({
      url,
      timestamp,
      relativeTime: timestamp - this.startTime,
      flowType: this.flowType
    });
    this.currentUrl = url;
  }
  
  /**
   * Add redirect (OAuth flow detection)
   */
  addRedirect(from, to, statusCode) {
    this.redirectChain.push({
      from,
      to,
      statusCode,
      timestamp: Date.now() - this.startTime
    });
    
    // Update flow type if OAuth pattern detected
    if (to.includes('callback') || to.includes('oauth') || to.includes('auth')) {
      this.flowType = 'oauth-redirect';
    }
  }
  
  /**
   * Accumulate page data with performance optimization
   */
  accumulatePageData(pageData) {
    // Check if cleanup is needed
    this.performCleanupIfNeeded();
    
    // Accumulate with limits
    if (pageData.events && this.accumulated.events.length < this.performance.maxAccumulatedEvents) {
      const eventsToAdd = pageData.events.slice(0, 
        this.performance.maxAccumulatedEvents - this.accumulated.events.length
      );
      this.accumulated.events.push(...eventsToAdd);
      this.accumulated.eventCount = this.accumulated.events.length;
    }
    
    if (pageData.console) {
      // Keep last 1000 console logs
      this.accumulated.console = [
        ...this.accumulated.console.slice(-900),
        ...pageData.console.slice(-100)
      ];
    }
    
    if (pageData.network) {
      // Keep all network requests (usually not too many)
      this.accumulated.network.push(...pageData.network);
    }
    
    if (pageData.storage) {
      // Deduplicate storage events
      this.accumulated.storage = this.deduplicateStorageEvents([
        ...this.accumulated.storage,
        ...pageData.storage
      ]);
    }
    
    if (pageData.storageState) {
      Object.assign(this.accumulated.storageState, pageData.storageState);
    }
  }
  
  /**
   * Performance cleanup - remove old/redundant data
   */
  performCleanupIfNeeded() {
    const now = Date.now();
    if (now - this.accumulated.lastCleanup < this.performance.cleanupInterval) {
      return;
    }
    
    this.accumulated.lastCleanup = now;
    
    // Only compress events if we're way over the limit (2x)
    if (this.accumulated.events.length > this.performance.maxEventsPerPage * 2) {
      // Keep all full snapshots and more recent events
      const snapshots = this.accumulated.events.filter(e => e.type === 2);
      const nonSnapshots = this.accumulated.events.filter(e => e.type !== 2);
      const recentNonSnapshots = nonSnapshots.slice(-this.performance.maxEventsPerPage);
      
      this.accumulated.events = [...snapshots, ...recentNonSnapshots];
      console.log('[RecordingState] Cleaned up events:', this.accumulated.events.length);
    }
    
    // Clean up old console logs
    if (this.accumulated.console.length > 1000) {
      this.accumulated.console = this.accumulated.console.slice(-1000);
    }
  }
  
  /**
   * Deduplicate storage events for performance
   */
  deduplicateStorageEvents(events) {
    const seen = new Map();
    const deduplicated = [];
    
    // Process in reverse to keep latest events
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      const key = `${event.type}-${event.name}-${event.action}`;
      
      if (!seen.has(key) || event.timestamp > seen.get(key).timestamp) {
        seen.set(key, event);
      }
    }
    
    // Return in chronological order
    return Array.from(seen.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
  
  /**
   * Get optimized data for replay
   */
  getOptimizedReplayData() {
    // Return data optimized for smooth replay
    return {
      events: this.compressEventsForReplay(this.accumulated.events),
      console: this.accumulated.console.slice(-500), // Limit console logs
      network: this.accumulated.network,
      storage: this.deduplicateStorageEvents(this.accumulated.storage),
      metadata: {
        recordId: this.recordId,
        startTime: this.startTime,
        duration: Date.now() - this.startTime,
        flowType: this.flowType,
        navigationCount: this.navigationHistory.length,
        redirectCount: this.redirectChain.length
      }
    };
  }
  
  /**
   * Compress events for smooth replay
   */
  compressEventsForReplay(events) {
    // Re-enable smart compression that preserves full snapshots
    if (!events || events.length === 0) return events;
    
    const compressed = [];
    const fullSnapshots = [];
    const incrementalsBySnapshot = new Map();
    let currentSnapshotTime = 0;
    
    // First pass: identify full snapshots and group incrementals
    events.forEach(event => {
      if (event.type === 2) { // Full snapshot
        fullSnapshots.push(event);
        currentSnapshotTime = event.timestamp;
        incrementalsBySnapshot.set(currentSnapshotTime, []);
      } else if (event.type === 3 && currentSnapshotTime > 0) { // Incremental
        const snapshots = incrementalsBySnapshot.get(currentSnapshotTime);
        if (snapshots) {
          snapshots.push(event);
        }
      } else {
        // Other event types (console, network, etc)
        compressed.push(event);
      }
    });
    
    // Second pass: add full snapshots and sample incrementals
    fullSnapshots.forEach(snapshot => {
      compressed.push(snapshot);
      
      const incrementals = incrementalsBySnapshot.get(snapshot.timestamp) || [];
      let lastTime = snapshot.timestamp;
      
      // Keep incrementals with smarter filtering
      incrementals.forEach(event => {
        // Check if this is a mouse-related event
        const isMouseEvent = event.data && (
          (event.data.source === 1) || // Mouse interaction
          (event.data.source === 6) || // Mouse position
          (event.data.source === 2) || // Mouse movement
          (event.data.positions && event.data.positions.length > 0) // Mouse positions array
        );
        
        // For mouse events, keep more frequent updates (8ms = 125fps)
        // For other events, keep at 16ms intervals (60fps)
        const minInterval = isMouseEvent ? 8 : 16;
        
        if (event.timestamp - lastTime >= minInterval) {
          compressed.push(event);
          lastTime = event.timestamp;
        }
      });
    });
    
    // Sort by timestamp to maintain order
    compressed.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log(`[RecordingState] Compressed ${events.length} events to ${compressed.length} (kept all ${fullSnapshots.length} snapshots)`);
    return compressed;
  }
  
  /**
   * Get effective start time for recording
   * For pre-nav flow, this returns the time when first page loaded
   * For normal flow, returns the original start time
   */
  getEffectiveStartTime() {
    if (this.isPreNav && this.firstPageNavigationTime) {
      return this.firstPageNavigationTime;
    }
    return this.startTime;
  }
  
  /**
   * Get time offset for pre-nav recordings
   * This is the time between clicking record and navigating to first page
   */
  getPreNavTimeOffset() {
    if (this.isPreNav && this.firstPageNavigationTime) {
      return this.firstPageNavigationTime - this.originalStartTime;
    }
    return 0;
  }
  
  /**
   * Get elapsed time in milliseconds
   */
  getElapsedTime() {
    return Date.now() - this.startTime;
  }
  
  /**
   * Get elapsed time for widget display
   */
  getWidgetElapsedTime() {
    return Date.now() - this.getEffectiveStartTime();
  }
  
  /**
   * Get formatted elapsed time (MM:SS)
   */
  getFormattedElapsedTime() {
    const elapsed = Math.floor(this.getElapsedTime() / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
  
  /**
   * Get formatted elapsed time for widget (MM:SS)
   */
  getFormattedWidgetElapsedTime() {
    const elapsed = Math.floor(this.getWidgetElapsedTime() / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}