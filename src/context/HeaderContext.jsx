import React, {createContext, useState, useEffect, useCallback, useRef} from 'react';
import { storage, runtime } from '../utils/browser-api';
import { getChunkedData } from '../utils/storage-chunking';

// Helper function for safe message sending
const sendMessageSafely = (message, callback) => {
  runtime.sendMessage(message, (response) => {
    const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
    if (browserAPI.runtime.lastError) {
      console.log(`Info: Message '${message.type}' failed:`, browserAPI.runtime.lastError.message);
      if (callback) callback(null, browserAPI.runtime.lastError);
    } else {
      if (callback) callback(response, null);
    }
  });
};

// Create context with default values
const defaultContextValue = {
  headerEntries: {},
  dynamicSources: [],
  isConnected: false,
  rulesFromApp: false,  // Indicates if rules are managed by Electron app
  uiState: {
    tableState: {
      searchText: '',
      filteredInfo: {},
      sortedInfo: {}
    }
  },
  loadHeaderEntries: () => {},
  loadDynamicSources: () => {},
  refreshHeaderEntries: () => {},
  updateUiState: () => {}
};

export const HeaderContext = createContext(defaultContextValue);

/**
 * Provider component for header management
 * Now only handles reading and toggling rules - all CRUD operations happen in the app
 */
export const HeaderProvider = ({ children }) => {
  const [headerEntries, setHeaderEntries] = useState({});
  const [dynamicSources, setDynamicSources] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [rulesFromApp, setRulesFromApp] = useState(false);
  const [uiState, setUiState] = useState({
    tableState: {
      searchText: '',
      filteredInfo: {},
      sortedInfo: {}
    }
  });

  // Track if we're currently loading to prevent duplicate loads
  const isLoadingRef = useRef(false);
  const loadTimeoutRef = useRef(null);

  // Load saved header entries from storage
  const loadHeaderEntries = useCallback((forceRefresh = false) => {
    // Prevent duplicate loads unless forced
    if (isLoadingRef.current && !forceRefresh) {
      console.log('HeaderContext: Load already in progress, skipping');
      return;
    }

    // Clear any pending timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    isLoadingRef.current = true;

    // Use getChunkedData to properly retrieve potentially chunked data
    getChunkedData('savedData', (data) => {
      const entries = data || {};
      setHeaderEntries(entries);
      isLoadingRef.current = false;
    });
  }, []);

  // Load dynamic sources from local app
  const loadDynamicSources = useCallback(() => {
    sendMessageSafely({ type: 'getDynamicSources' }, (response, error) => {
      if (!error && response) {
        const sources = response.sources || [];
        setDynamicSources(sources);
        setIsConnected(response.isConnected || false);
        setRulesFromApp(response.rulesFromApp || false);

        // Update header entries if rules come from app
        if (response.rulesFromApp && response.headerEntries) {
          setHeaderEntries(response.headerEntries);
        }
      } else {
        setDynamicSources([]);
        setIsConnected(false);
      }
    });
  }, []);

  // Force refresh header entries
  const refreshHeaderEntries = useCallback(() => {
    loadHeaderEntries(true);
    loadDynamicSources();
  }, [loadHeaderEntries, loadDynamicSources]);

  // Load data on mount
  useEffect(() => {
    loadHeaderEntries();
    loadDynamicSources();

    // Set up storage listener for changes
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync') {
        // Check if savedData or any of its chunks changed
        const hasDataChange = changes.savedData || 
                             changes.savedData_chunked || 
                             Object.keys(changes).some(key => key.startsWith('savedData_chunk_'));
        
        if (hasDataChange) {
          console.log('HeaderContext: Storage changed, updating entries');
          // Use getChunkedData to properly retrieve the potentially chunked data
          getChunkedData('savedData', (data) => {
            setHeaderEntries(data || {});
          });
        }
      }
    };

    storage.onChanged.addListener(handleStorageChange);

    // Set up a message listener for dynamic updates
    const messageListener = (message, sender, sendResponse) => {
      if (message.type === 'dynamicSourcesUpdated') {
        console.log('HeaderContext: Dynamic sources updated notification received');
        loadDynamicSources();
      } else if (message.type === 'headerEntriesUpdated' && message.entries) {
        console.log('HeaderContext: Header entries updated from app');
        setHeaderEntries(message.entries);
        setRulesFromApp(true);
      }
    };

    runtime.onMessage.addListener(messageListener);

    // Periodic refresh for dynamic sources - increase interval
    const intervalId = setInterval(() => {
      loadDynamicSources();
    }, 5000); // Refresh every 5 seconds

    // Cleanup
    return () => {
      storage.onChanged.removeListener(handleStorageChange);
      runtime.onMessage.removeListener(messageListener);
      clearInterval(intervalId);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [loadHeaderEntries, loadDynamicSources]);

  // Restore UI state from localStorage on mount
  useEffect(() => {
    storage.local.get(['popupState'], (result) => {
      if (result.popupState?.uiState) {
        setUiState(prev => ({
          ...prev,
          ...result.popupState.uiState
        }));
      }
    });
  }, []);

  // Save UI state to localStorage when it changes
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      storage.local.get(['popupState'], (result) => {
        const popupState = result.popupState || {};
        storage.local.set({
          popupState: {
            ...popupState,
            uiState
          }
        });
      });
    }, 500); // Debounce saves

    return () => clearTimeout(saveTimeout);
  }, [uiState]);

  // Update UI state (for table filters, etc.)
  const updateUiState = useCallback((updates) => {
    setUiState(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const contextValue = {
    headerEntries,
    dynamicSources,
    isConnected,
    rulesFromApp,
    uiState,
    loadHeaderEntries,
    loadDynamicSources,
    refreshHeaderEntries,
    updateUiState
  };

  return (
    <HeaderContext.Provider value={contextValue}>
      {children}
    </HeaderContext.Provider>
  );
};