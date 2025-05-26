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
    formCollapsed: false,  // false = collapsed (backwards naming)
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

/**
 * Helper function to check if two domain patterns conflict
 * @param {string} domain1 - First domain pattern
 * @param {string} domain2 - Second domain pattern
 * @returns {boolean} - True if domains conflict
 *
 * Examples of conflicts:
 * - example.com vs example.com (exact match)
 * - *.example.com vs sub.example.com (wildcard matches subdomain)
 * - *.example.com vs *.example.com (same pattern)
 * - *example.com vs example.com (wildcard matches domain)
 *
 * Examples of non-conflicts:
 * - example.com vs *.example.com (root domain vs subdomain wildcard)
 * - example.com vs sub.example.com (different specific domains)
 * - example.com/api vs example.com/app (different paths)
 */
function doDomainsConflict(domain1, domain2) {
  // Normalize domains - remove protocol but keep paths for pattern matching
  const normalizeDomain = (domain) => {
    return domain.toLowerCase()
        .trim()
        .replace(/^https?:\/\//, ''); // Remove protocol only
  };

  const d1 = normalizeDomain(domain1);
  const d2 = normalizeDomain(domain2);

  // Exact match
  if (d1 === d2) {
    return true;
  }

  // Extract domain and path parts
  const getParts = (domain) => {
    const slashIndex = domain.indexOf('/');
    if (slashIndex === -1) {
      return { domain: domain, path: '/*' }; // Default to /* if no path specified
    }
    return {
      domain: domain.substring(0, slashIndex),
      path: domain.substring(slashIndex)
    };
  };

  const parts1 = getParts(d1);
  const parts2 = getParts(d2);

  // Helper function to check if a pattern matches a domain
  const doesPatternMatchDomain = (pattern, domain) => {
    // Handle different wildcard formats

    // *.example.com - matches only subdomains, NOT example.com itself
    if (pattern.startsWith('*.')) {
      const base = pattern.substring(2);
      // Check if domain is a subdomain of base
      return domain.endsWith('.' + base) && domain !== base;
    }

    // *example.com - matches example.com AND all subdomains
    if (pattern.startsWith('*') && !pattern.startsWith('*.')) {
      const base = pattern.substring(1);
      return domain === base || domain.endsWith(base);
    }

    // example.* - matches example.com, example.org, etc.
    if (pattern.endsWith('.*')) {
      const base = pattern.substring(0, pattern.length - 2);
      return domain.startsWith(base);
    }

    // General wildcard pattern
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return regex.test(domain);
    }

    // No wildcards, exact match only
    return pattern === domain;
  };

  try {
    // Check if domains match
    let domainsMatch = false;

    // Check both directions
    if (doesPatternMatchDomain(parts1.domain, parts2.domain) ||
        doesPatternMatchDomain(parts2.domain, parts1.domain)) {
      domainsMatch = true;
    }

    // If domains don't match, no conflict
    if (!domainsMatch) {
      return false;
    }

    // Domains match, now check paths
    const pathMatches = (pathPattern, path) => {
      if (pathPattern === '/*') return true; // Matches everything
      if (pathPattern === path) return true; // Exact match

      // Convert path pattern to regex
      const regex = new RegExp('^' + pathPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return regex.test(path);
    };

    // If either path matches the other, there's a conflict
    if (pathMatches(parts1.path, parts2.path) || pathMatches(parts2.path, parts1.path)) {
      return true;
    }

  } catch (e) {
    // If regex parsing fails, be conservative and report conflict
    console.warn('Domain conflict check failed:', e);
    return true;
  }

  return false;
}

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
    formCollapsed: false,  // false = collapsed (backwards naming)
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
          setEditMode({
            isEditing: savedEditMode.isEditing,
            entryId: savedEditMode.entryId || null
          });
        }

        // Restore UI state if it exists and is valid
        if (savedUiState) {
          const validUiState = {
            formCollapsed: typeof savedUiState.formCollapsed === 'boolean' ? savedUiState.formCollapsed : false,
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
      editMode,  // Save the actual edit mode
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

    // Check for duplicate domains within the same entry
    const normalizedDomains = domains.map(d => d.toLowerCase().trim());
    const uniqueDomains = new Set(normalizedDomains);
    if (uniqueDomains.size !== normalizedDomains.length) {
      onError?.('Duplicate domains detected in the same rule');
      return;
    }

    // Get current entries
    storage.sync.get(['savedData'], (result) => {
      const savedData = result.savedData || {};

      // Check for duplicates - prevent same header name + domain combination
      // This ensures no two rules can set the same header for the same domain
      const normalizedHeaderName = headerName.toLowerCase();
      const isRequestHeader = !isResponse;

      // Check each existing entry for conflicts
      for (const [existingId, existingEntry] of Object.entries(savedData)) {
        // Skip checking against itself when editing
        if (editMode.isEditing && editMode.entryId === existingId) {
          continue;
        }

        // Check if it's the same header name and same type (request/response)
        if (existingEntry.headerName.toLowerCase() === normalizedHeaderName &&
            existingEntry.isResponse === isResponse) {

          // Check for domain conflicts
          const existingDomains = existingEntry.domains || [];
          const conflictingDomains = [];

          for (const newDomain of domains) {
            for (const existingDomain of existingDomains) {
              // Check for exact match or pattern overlap
              if (doDomainsConflict(newDomain, existingDomain)) {
                conflictingDomains.push(`"${newDomain}" conflicts with "${existingDomain}"`);
              }
            }
          }

          if (conflictingDomains.length > 0) {
            const headerType = isResponse ? 'response' : 'request';
            const direction = existingEntry.isEnabled ? 'active' : 'disabled';
            const firstConflict = conflictingDomains[0];
            const moreCount = conflictingDomains.length - 1;

            let errorMsg = `A ${direction} ${headerType} header "${headerName}" already exists`;
            if (moreCount > 0) {
              errorMsg += ` for: ${firstConflict} and ${moreCount} more domain(s)`;
            } else {
              errorMsg += ` for: ${firstConflict}`;
            }

            onError?.(errorMsg);
            return;
          }
        }
      }

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
        // Don't change formCollapsed state - let user control it
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
                ...result.popupState.uiState
                // Keep formCollapsed and tableState unchanged
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

      // Expand the form panel when editing
      setUiState(prev => ({
        ...prev,
        formCollapsed: true  // true = expanded (backwards naming)
      }));
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
            ...result.popupState.uiState
            // Keep formCollapsed and tableState unchanged
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
    // Always save popup state to preserve user's UI preferences
    // The debouncing prevents excessive writes
    const saveTimer = setTimeout(() => {
      savePopupState();
    }, 500);

    return () => clearTimeout(saveTimer);
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