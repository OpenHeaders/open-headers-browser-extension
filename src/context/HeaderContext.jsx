import React, { createContext, useState, useEffect, useCallback } from 'react';
import { storage, runtime } from '../utils/browser-api';
import { generateUniqueId } from '../utils/utils';

// Create context with default values
const defaultContextValue = {
  headerEntries: {},
  dynamicSources: [],
  isConnected: false,
  editMode: { isEditing: false, entryId: null },
  draftValues: {
    headerName: '',
    headerValue: '',
    domains: [],
    valueType: 'static',
    sourceId: '',
    prefix: '',
    suffix: '',
    isResponse: false
  },
  uiState: {
    formCollapsed: false,
    lastActiveTab: 'form',
    tableState: {
      searchText: '',
      filteredInfo: {},
      sortedInfo: {}
    }
  },
  loadHeaderEntries: () => {},
  loadDynamicSources: () => {},
  refreshHeaderEntries: () => {},
  saveHeaderEntry: () => {},
  toggleEntryEnabled: () => {},
  deleteHeaderEntry: () => {},
  startEditingEntry: () => {},
  cancelEditing: () => {},
  updateDraftValues: () => {},
  updateUiState: () => {},
  clearPopupState: () => {}
};

export const HeaderContext = createContext(defaultContextValue);

export const HeaderProvider = ({ children }) => {
  // State for header entries
  const [headerEntries, setHeaderEntries] = useState({});
  
  // State for dynamic sources
  const [dynamicSources, setDynamicSources] = useState([]);
  
  // State for connection status
  const [isConnected, setIsConnected] = useState(false);
  
  // State for current edit mode
  const [editMode, setEditMode] = useState({
    isEditing: false,
    entryId: null
  });
  
  // State for form draft
  const [draftValues, setDraftValues] = useState({
    headerName: '',
    headerValue: '',
    domains: [],
    valueType: 'static',
    sourceId: '',
    prefix: '',
    suffix: '',
    isResponse: false
  });

  // State for UI persistence
  const [uiState, setUiState] = useState({
    formCollapsed: false,
    lastActiveTab: 'form',
    tableState: {
      searchText: '',
      filteredInfo: {},
      sortedInfo: {}
    }
  });
  
  // Load header entries from storage
  const loadHeaderEntries = useCallback(() => {
    storage.sync.get(['savedData'], (result) => {
      if (result.savedData) {
        setHeaderEntries(result.savedData);
      }
    });
  }, []);
  
  // Force refresh header entries (for external changes)
  const refreshHeaderEntries = useCallback(() => {
    loadHeaderEntries();
  }, [loadHeaderEntries]);
  
  // Load dynamic sources from storage
  const loadDynamicSources = useCallback(() => {
    storage.local.get(['dynamicSources'], (result) => {
      if (result.dynamicSources && Array.isArray(result.dynamicSources)) {
        setDynamicSources(result.dynamicSources);
        
        // Check connection status
        runtime.sendMessage({ type: 'checkConnection' }, (response) => {
          if (response && response.connected === true) {
            setIsConnected(true);
          } else {
            setIsConnected(false);
          }
        });
      }
    });
  }, []);

  // Load popup state from storage
  const loadPopupState = useCallback(() => {
    storage.local.get(['popupState'], (result) => {
      if (result.popupState) {
        const { draftValues: savedDraft, editMode: savedEditMode, uiState: savedUiState, timestamp } = result.popupState;
        
        // Check if saved state is too old (more than 1 hour)
        const ONE_HOUR = 60 * 60 * 1000;
        if (timestamp && (Date.now() - timestamp) > ONE_HOUR) {
          // Clear old state
          storage.local.remove(['popupState']);
          return;
        }
        
        // Restore draft values if they exist and are valid
        if (savedDraft) {
          // Validate that saved draft has proper structure
          const validDraft = {
            headerName: savedDraft.headerName || '',
            headerValue: savedDraft.headerValue || '',
            domains: Array.isArray(savedDraft.domains) ? savedDraft.domains : [],
            valueType: ['static', 'dynamic'].includes(savedDraft.valueType) ? savedDraft.valueType : 'static',
            sourceId: savedDraft.sourceId || '',
            prefix: savedDraft.prefix || '',
            suffix: savedDraft.suffix || '',
            isResponse: Boolean(savedDraft.isResponse)
          };
          
          setDraftValues(prevDraft => ({
            ...prevDraft,
            ...validDraft
          }));
        }
        
        // Restore edit mode if it exists and is valid
        if (savedEditMode && typeof savedEditMode.isEditing === 'boolean') {
          setEditMode(prevEditMode => ({
            ...prevEditMode,
            isEditing: savedEditMode.isEditing,
            entryId: savedEditMode.entryId || null
          }));
        }

        // Restore UI state if it exists and is valid
        if (savedUiState) {
          const validUiState = {
            formCollapsed: Boolean(savedUiState.formCollapsed),
            lastActiveTab: savedUiState.lastActiveTab || 'form',
            tableState: {
              searchText: savedUiState.tableState?.searchText || '',
              filteredInfo: savedUiState.tableState?.filteredInfo || {},
              sortedInfo: savedUiState.tableState?.sortedInfo || {}
            }
          };
          
          setUiState(prevUiState => ({
            ...prevUiState,
            ...validUiState
          }));
        }
      }
    });
  }, []);

  // Save popup state to storage
  const savePopupState = useCallback(() => {
    const popupState = {
      draftValues,
      editMode,
      uiState,
      timestamp: Date.now()
    };
    
    storage.local.set({ popupState });
  }, [draftValues, editMode, uiState]);

  // Clear saved popup state
  const clearPopupState = useCallback(() => {
    storage.local.remove(['popupState']);
  }, []);
  
  // Save a header entry
  const saveHeaderEntry = useCallback((headerData, onSuccess, onError) => {
    const { headerName, headerValue, domains, isDynamic, sourceId, prefix, suffix, isResponse } = headerData;
    
    // Validate entry data
    if (!headerName) {
      onError?.('Please enter a header name');
      return;
    }
    
    if (!isDynamic && !headerValue) {
      onError?.('Please enter a header value');
      return;
    }
    
    if (isDynamic && !sourceId) {
      onError?.('Please select a dynamic source');
      return;
    }
    
    if (!domains || domains.length === 0) {
      onError?.('Please add at least one domain pattern');
      return;
    }
    
    // Get current entries
    storage.sync.get(['savedData'], (result) => {
      const savedData = result.savedData || {};
      let entryId;
      
      // If editing, use existing ID
      if (editMode.isEditing && editMode.entryId) {
        entryId = editMode.entryId;
      } else {
        // Generate a new unique ID
        entryId = generateUniqueId();
      }
      
      // Create entry object
      const entry = {
        headerName,
        headerValue: isDynamic ? '' : headerValue,
        domains,
        isDynamic,
        sourceId: isDynamic ? sourceId : null,
        prefix: isDynamic ? prefix : '',
        suffix: isDynamic ? suffix : '',
        isResponse,
        isEnabled: true
      };
      
      // Preserve enabled state if editing
      if (editMode.isEditing && editMode.entryId && savedData[editMode.entryId]) {
        entry.isEnabled = savedData[editMode.entryId].isEnabled !== false;
      }
      
      // Update savedData with new entry
      savedData[entryId] = entry;
      
      // Save to storage
      storage.sync.set({ savedData }, () => {
        // Update local state immediately (storage listener will also update, but this ensures immediate UI update)
        setHeaderEntries(savedData);
        
        // Reset edit mode
        setEditMode({
          isEditing: false,
          entryId: null
        });
        
        // Clear form (include headerType to reset radio buttons)
        const clearedDraft = {
          headerName: '',
          headerValue: '',
          domains: [],
          valueType: 'static',
          sourceId: '',
          prefix: '',
          suffix: '',
          isResponse: false,
          headerType: 'request'
        };
        setDraftValues(clearedDraft);
        
        // Clear form-related saved state but preserve table state
        storage.local.get(['popupState'], (result) => {
          if (result.popupState) {
            const updatedState = {
              ...result.popupState,
              draftValues: {
                headerName: '',
                headerValue: '',
                domains: [],
                valueType: 'static',
                sourceId: '',
                prefix: '',
                suffix: '',
                isResponse: false
              },
              editMode: { isEditing: false, entryId: null },
              uiState: {
                ...result.popupState.uiState,
                formCollapsed: false
                // Keep tableState unchanged
              }
            };
            storage.local.set({ popupState: updatedState });
          }
        });
        
        // Notify the background script to update rules
        runtime.sendMessage({ type: 'rulesUpdated' });
        
        // Show success message
        onSuccess?.(`Header ${editMode.isEditing ? 'updated' : 'saved'} successfully`);
      });
    });
  }, [editMode]);
  
  // Toggle entry enabled/disabled state
  const toggleEntryEnabled = useCallback((entryId, enabled) => {
    storage.sync.get(['savedData'], (result) => {
      const savedData = result.savedData || {};
      
      if (savedData[entryId]) {
        // Update enabled state
        savedData[entryId].isEnabled = enabled;
        
        // Save to storage
        storage.sync.set({ savedData }, () => {
          // Update local state
          setHeaderEntries(savedData);
          
          // Notify the background script to update rules
          runtime.sendMessage({ type: 'rulesUpdated' });
        });
      }
    });
  }, []);
  
  // Delete a header entry
  const deleteHeaderEntry = useCallback((entryId, onSuccess) => {
    storage.sync.get(['savedData'], (result) => {
      const savedData = result.savedData || {};
      
      if (savedData[entryId]) {
        // Delete the entry
        delete savedData[entryId];
        
        // Save to storage
        storage.sync.set({ savedData }, () => {
          // Update local state
          setHeaderEntries(savedData);
          
          // Notify the background script to update rules
          runtime.sendMessage({ type: 'rulesUpdated' });
          
          // Show success message
          onSuccess?.('Header deleted successfully');
        });
      }
    });
  }, []);
  
  // Start editing a header entry
  const startEditingEntry = useCallback((entryId) => {
    const entry = headerEntries[entryId];
    
    if (entry) {
      // Set edit mode
      setEditMode({
        isEditing: true,
        entryId
      });
      
      // Populate form with entry data
      setDraftValues({
        headerName: entry.headerName || '',
        headerValue: entry.isDynamic ? '' : (entry.headerValue || ''),
        domains: entry.domains || [],
        valueType: entry.isDynamic ? 'dynamic' : 'static',
        sourceId: entry.sourceId || '',
        prefix: entry.prefix || '',
        suffix: entry.suffix || '',
        isResponse: entry.isResponse === true
      });
    }
  }, [headerEntries]);
  
  // Cancel editing
  const cancelEditing = useCallback(() => {
    // Reset edit mode
    setEditMode({
      isEditing: false,
      entryId: null
    });
    
    // Clear form
    setDraftValues({
      headerName: '',
      headerValue: '',
      domains: [],
      valueType: 'static',
      sourceId: '',
      prefix: '',
      suffix: '',
      isResponse: false,
      headerType: 'request'
    });
    
    // Clear form-related saved state but preserve table state when editing is cancelled
    storage.local.get(['popupState'], (result) => {
      if (result.popupState) {
        const updatedState = {
          ...result.popupState,
          draftValues: {
            headerName: '',
            headerValue: '',
            domains: [],
            valueType: 'static',
            sourceId: '',
            prefix: '',
            suffix: '',
            isResponse: false
          },
          editMode: { isEditing: false, entryId: null },
          uiState: {
            ...result.popupState.uiState,
            formCollapsed: false
            // Keep tableState unchanged
          }
        };
        storage.local.set({ popupState: updatedState });
      }
    });
  }, [clearPopupState]);
  
  // Update draft values
  const updateDraftValues = useCallback((values) => {
    setDraftValues(prev => ({
      ...prev,
      ...values
    }));
  }, []);

  // Update UI state
  const updateUiState = useCallback((values) => {
    setUiState(prev => ({
      ...prev,
      ...values
    }));
  }, []);
  
  // Add event listener for dynamic sources updates
  useEffect(() => {
    const handleMessagesFromBackground = (message) => {
      if (message.type === 'sourcesUpdated' && Array.isArray(message.sources)) {
        setDynamicSources(message.sources);
      } else if (message.type === 'connectionStatus') {
        setIsConnected(message.connected);
      } else if (message.type === 'configurationImported') {
        // Refresh entries when configuration is imported
        refreshHeaderEntries();
      }
    };
    
    // Add listener for messages
    runtime.onMessage.addListener(handleMessagesFromBackground);
    
    // Initial load of data
    loadHeaderEntries();
    loadDynamicSources();
    loadPopupState();
    
    // Notify background script that popup is open
    runtime.sendMessage({ type: 'popupOpen' }, (response) => {
      if (response && response.sources) {
        setDynamicSources(response.sources);
      }
    });
    
    // Start connection status checker
    const connectionCheckInterval = setInterval(() => {
      runtime.sendMessage({ type: 'checkConnection' }, (response) => {
        if (response) {
          setIsConnected(response.connected === true);
        }
      });
    }, 3000);
    
    // Cleanup function
    return () => {
      runtime.onMessage.removeListener(handleMessagesFromBackground);
      clearInterval(connectionCheckInterval);
    };
  }, [loadHeaderEntries, loadDynamicSources, loadPopupState, refreshHeaderEntries]);
  
  // Monitor storage changes 
  useEffect(() => {
    const handleStorageChanges = (changes, area) => {
      // Listen for dynamic sources changes
      if (area === 'local' && changes.dynamicSources) {
        setDynamicSources(changes.dynamicSources.newValue || []);
      }
      
      // Listen for savedData changes (from imports or external modifications)
      if (area === 'sync' && changes.savedData) {
        setHeaderEntries(changes.savedData.newValue || {});
      }
    };
    
    // Add listener for storage changes
    storage.onChanged.addListener(handleStorageChanges);
    
    // Cleanup function
    return () => {
      storage.onChanged.removeListener(handleStorageChanges);
    };
  }, []);

  // Auto-save popup state when draft values, edit mode, or UI state changes
  useEffect(() => {
    // Only save if there's meaningful state to preserve
    const hasContent = 
      draftValues.headerName || 
      draftValues.headerValue || 
      draftValues.domains.length > 0 ||
      editMode.isEditing ||
      uiState.formCollapsed !== false ||
      uiState.tableState.searchText ||
      Object.keys(uiState.tableState.filteredInfo).length > 0 ||
      Object.keys(uiState.tableState.sortedInfo).length > 0;
    
    if (hasContent) {
      // Debounce the save operation to avoid excessive writes
      const saveTimer = setTimeout(() => {
        savePopupState();
      }, 500);
      
      return () => clearTimeout(saveTimer);
    }
  }, [draftValues, editMode, uiState, savePopupState]);
  
  // Context value
  const contextValue = {
    headerEntries,
    dynamicSources,
    isConnected,
    editMode,
    draftValues,
    uiState,
    loadHeaderEntries,
    loadDynamicSources,
    refreshHeaderEntries,
    saveHeaderEntry,
    toggleEntryEnabled,
    deleteHeaderEntry,
    startEditingEntry,
    cancelEditing,
    updateDraftValues,
    updateUiState,
    clearPopupState
  };
  
  return (
    <HeaderContext.Provider value={contextValue}>
      {children}
    </HeaderContext.Provider>
  );
};