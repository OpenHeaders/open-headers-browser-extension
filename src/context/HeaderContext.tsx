import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import { storage, runtime } from '../utils/browser-api';
import { getChunkedData } from '../utils/storage-chunking';
import { sendMessageWithCallback } from '../utils/messaging';
import { getBrowserAPI } from '../types/browser';
import type { HeaderEntry } from '../types/header';

// Re-export HeaderEntry from the canonical types location
export type { HeaderEntry } from '../types/header';

export interface DynamicSource {
  sourceId?: string;
  locationId?: string;
  sourceContent?: string;
  locationContent?: string;
  sourceTag?: string;
  locationTag?: string;
  sourcePath?: string;
  locationPath?: string;
  sourceUrl?: string;
  locationUrl?: string;
  sourceType?: string;
  locationType?: string;
  [key: string]: unknown;
}

export interface UiState {
  tableState: {
    searchText: string;
    filteredInfo: Record<string, unknown>;
    sortedInfo: Record<string, unknown>;
  };
  [key: string]: unknown;
}

export interface HeaderContextValue {
  headerEntries: Record<string, HeaderEntry>;
  dynamicSources: DynamicSource[];
  isConnected: boolean;
  isStatusLoaded: boolean;
  rulesFromApp: boolean;
  uiState: UiState;
  loadHeaderEntries: (forceRefresh?: boolean) => void;
  loadDynamicSources: () => void;
  refreshHeaderEntries: () => void;
  updateUiState: (updates: Partial<UiState>) => void;
}

// Wrapper to adapt sendMessageWithCallback to the expected signature
const sendContextMessage = (
  message: { type: string; [key: string]: unknown },
  callback?: (response: Record<string, unknown> | null, error: chrome.runtime.LastError | null) => void
): void => {
  sendMessageWithCallback(message, (response, error) => {
    if (callback) callback(response as Record<string, unknown> | null, error);
  });
};

// Create context with default values
const defaultContextValue: HeaderContextValue = {
  headerEntries: {},
  dynamicSources: [],
  isConnected: false,
  isStatusLoaded: false,
  rulesFromApp: false,
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

export const HeaderContext = createContext<HeaderContextValue>(defaultContextValue);

interface HeaderProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component for header management
 */
export const HeaderProvider: React.FC<HeaderProviderProps> = ({ children }) => {
  const [headerEntries, setHeaderEntries] = useState<Record<string, HeaderEntry>>({});
  const [dynamicSources, setDynamicSources] = useState<DynamicSource[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isStatusLoaded, setIsStatusLoaded] = useState(false);
  const [rulesFromApp, setRulesFromApp] = useState(false);
  const [uiState, setUiState] = useState<UiState>({
    tableState: {
      searchText: '',
      filteredInfo: {},
      sortedInfo: {}
    }
  });

  const isLoadingRef = useRef(false);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHeaderEntries = useCallback((forceRefresh = false) => {
    if (isLoadingRef.current && !forceRefresh) {
      console.log(new Date().toISOString(), 'INFO ', '[HeaderContext]', 'HeaderContext: Load already in progress, skipping');
      return;
    }

    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }

    isLoadingRef.current = true;

    getChunkedData('savedData', (data) => {
      const entries = (data || {}) as Record<string, HeaderEntry>;
      setHeaderEntries(entries);
      isLoadingRef.current = false;
    });
  }, []);

  const loadDynamicSources = useCallback(() => {
    sendContextMessage({ type: 'getDynamicSources' }, (response, error) => {
      if (!error && response) {
        const sources = (response.sources as DynamicSource[]) || [];
        setDynamicSources(sources);
        setIsConnected((response.isConnected as boolean) || false);
        setIsStatusLoaded(true);
        setRulesFromApp((response.rulesFromApp as boolean) || false);

        if (response.rulesFromApp && response.headerEntries) {
          setHeaderEntries(response.headerEntries as Record<string, HeaderEntry>);
        }
      } else {
        setDynamicSources([]);
        setIsConnected(false);
        setIsStatusLoaded(true);
      }
    });
  }, []);

  const refreshHeaderEntries = useCallback(() => {
    loadHeaderEntries(true);
    loadDynamicSources();
  }, [loadHeaderEntries, loadDynamicSources]);

  // Load data on mount
  useEffect(() => {
    loadHeaderEntries();
    loadDynamicSources();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'sync') {
        const hasDataChange = changes.savedData ||
                             changes.savedData_chunked ||
                             Object.keys(changes).some(key => key.startsWith('savedData_chunk_'));

        if (hasDataChange) {
          console.log(new Date().toISOString(), 'INFO ', '[HeaderContext]', 'HeaderContext: Storage changed, updating entries');
          getChunkedData('savedData', (data) => {
            setHeaderEntries((data || {}) as Record<string, HeaderEntry>);
          });
        }
      }
    };

    storage.onChanged.addListener(handleStorageChange);

    const messageListener = (message: { type?: string; entries?: Record<string, HeaderEntry> }) => {
      if (message.type === 'dynamicSourcesUpdated') {
        console.log(new Date().toISOString(), 'INFO ', '[HeaderContext]', 'HeaderContext: Dynamic sources updated notification received');
        loadDynamicSources();
      } else if (message.type === 'headerEntriesUpdated' && message.entries) {
        console.log(new Date().toISOString(), 'INFO ', '[HeaderContext]', 'HeaderContext: Header entries updated from app');
        setHeaderEntries(message.entries);
        setRulesFromApp(true);
      }
    };

    runtime.onMessage.addListener(messageListener as (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void);

    const intervalId = setInterval(() => {
      loadDynamicSources();
    }, 5000);

    return () => {
      storage.onChanged.removeListener(handleStorageChange);
      runtime.onMessage.removeListener(messageListener as (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void);
      clearInterval(intervalId);
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
    };
  }, [loadHeaderEntries, loadDynamicSources]);

  // Restore UI state from localStorage on mount
  useEffect(() => {
    storage.local.get(['popupState'], (result: Record<string, unknown>) => {
      const popupState = result.popupState as { uiState?: Partial<UiState> } | undefined;
      if (popupState?.uiState) {
        setUiState(prev => ({
          ...prev,
          ...popupState.uiState
        }));
      }
    });
  }, []);

  // Save UI state to localStorage when it changes
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      storage.local.get(['popupState'], (result: Record<string, unknown>) => {
        const popupState = (result.popupState || {}) as Record<string, unknown>;
        storage.local.set({
          popupState: {
            ...popupState,
            uiState
          }
        });
      });
    }, 500);

    return () => clearTimeout(saveTimeout);
  }, [uiState]);

  const updateUiState = useCallback((updates: Partial<UiState>) => {
    setUiState(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const contextValue: HeaderContextValue = {
    headerEntries,
    dynamicSources,
    isConnected,
    isStatusLoaded,
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
