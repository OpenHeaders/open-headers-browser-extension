import React, {createContext, useState, useEffect, useCallback, useRef} from 'react';
import { storage, runtime } from '../utils/browser-api';
import { generateUniqueId } from '../utils/utils';
import { validateDomain } from '../utils/header-validator';

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
 * - *://example.com/* vs https://example.com/* (protocol wildcard matches specific)
 *
 * Examples of non-conflicts:
 * - example.com vs *.example.com (root domain vs subdomain wildcard)
 * - example.com vs sub.example.com (different specific domains)
 * - example.com/api vs example.com/app (different paths)
 * - http://example.com vs https://example.com (different protocols without wildcards)
 */
function doDomainsConflict(domain1, domain2) {
  // Validate both domains first
  const validation1 = validateDomain(domain1);
  const validation2 = validateDomain(domain2);

  if (!validation1.valid || !validation2.valid) {
    // If either domain is invalid, consider them conflicting to be safe
    return true;
  }

  // Use sanitized versions if available
  const d1 = (validation1.sanitized || domain1).toLowerCase().trim();
  const d2 = (validation2.sanitized || domain2).toLowerCase().trim();

  // Exact match
  if (d1 === d2) {
    return true;
  }

  // If one pattern matches all (*), it conflicts with everything
  if (d1 === '*' || d2 === '*') {
    return true;
  }

  // Extract protocol, domain, and path parts
  const parsePattern = (pattern) => {
    let protocol = '*';
    let domain = pattern;
    let path = '/*';

    // Extract protocol if present
    const protocolMatch = pattern.match(/^(\*|https?|file|ftp|wss?):\/\//);
    if (protocolMatch) {
      protocol = protocolMatch[1];
      domain = pattern.substring(protocolMatch[0].length);
    }

    // Extract path if present
    const pathIndex = domain.indexOf('/');
    if (pathIndex !== -1) {
      path = domain.substring(pathIndex);
      domain = domain.substring(0, pathIndex);
    }

    return { protocol, domain, path };
  };

  const parts1 = parsePattern(d1);
  const parts2 = parsePattern(d2);

  // Check if protocols are compatible
  const protocolsMatch = (p1, p2) => {
    if (p1 === p2) return true;
    if (p1 === '*' || p2 === '*') return true;
    return false;
  };

  if (!protocolsMatch(parts1.protocol, parts2.protocol)) {
    return false; // Different specific protocols don't conflict
  }

  // Helper function to check if a pattern matches a domain
  const doesPatternMatchDomain = (pattern, domain) => {
    // Handle IP addresses - they must match exactly
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipRegex.test(pattern) || ipRegex.test(domain)) {
      return pattern === domain;
    }

    // Handle localhost
    if (pattern === 'localhost' || domain === 'localhost') {
      return pattern === domain ||
          (pattern === '127.0.0.1' && domain === 'localhost') ||
          (pattern === 'localhost' && domain === '127.0.0.1');
    }

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

    // example.*.com - matches example.test.com, example.prod.com, etc.
    if (pattern.includes('.*')) {
      const parts = pattern.split('.*');
      if (parts.length === 2) {
        return domain.startsWith(parts[0]) && domain.endsWith(parts[1]);
      }
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

      // Normalize paths for comparison
      const normalizePath = (p) => {
        // Ensure path starts with /
        if (!p.startsWith('/')) p = '/' + p;
        // Remove trailing slash unless it's just /
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        return p;
      };

      const normalizedPattern = normalizePath(pathPattern);
      const normalizedPath = normalizePath(path);

      if (normalizedPattern === normalizedPath) return true;

      // Convert path pattern to regex
      const regex = new RegExp('^' + normalizedPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      return regex.test(normalizedPath);
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

  const prevConnectionRef = useRef(isConnected);

  useEffect(() => {
    if (!prevConnectionRef.current && isConnected) {
      storage.local.remove(['connectionAlertDismissed', 'dynamicSourceAlertDismissed'], () => {
        console.log('Info: Cleared alert dismissal states after reconnection');
      });
    }
    prevConnectionRef.current = isConnected;
  }, [isConnected]);

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
        sendMessageSafely({ type: 'checkConnection' }, (response, error) => {
          if (!error && response && response.connected === true) {
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

        // Collapse the form after successful save
        setUiState(prev => ({
          ...prev,
          formCollapsed: false  // false = collapsed (backwards naming)
        }));

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
                ...result.popupState.uiState,
                formCollapsed: false  // Collapse the form after save
              }
            };
            storage.local.set({ popupState: updatedState });
          }
        });

        // Notify the background script to update rules
        sendMessageSafely({ type: 'rulesUpdated' }, (response, error) => {
          if (!error) {
            console.log('Background notified of rule save/update');
          }
        });

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
          sendMessageSafely({ type: 'rulesUpdated' }, null);
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

          // Check if we're currently editing the deleted entry
          if (editMode.isEditing && editMode.entryId === entryId) {
            // Reset edit mode
            setEditMode({
              isEditing: false,
              entryId: null
            });

            // Clear the form
            setDraftValues({
              headerName: '',
              headerValue: '',
              domains: [],
              valueType: 'static',
              sourceId: '',
              prefix: '',
              suffix: '',
              isResponse: false
            });

            // Collapse the form panel
            setUiState(prev => ({
              ...prev,
              formCollapsed: false  // false = collapsed (backwards naming)
            }));

            // Clear the saved popup state
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
                    formCollapsed: false  // Collapse the form
                  }
                };
                storage.local.set({ popupState: updatedState });
              }
            });
          }

          // Notify the background script to update rules AND clear tracking
          sendMessageSafely({ type: 'rulesUpdated' }, (response, error) => {
            if (!error) {
              console.log('Background notified of rule deletion');
            }
          });

          // Show success message
          onSuccess?.('Header deleted successfully');
        });
      }
    });
  }, [editMode]);

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
    setEditMode({
      isEditing: false,
      entryId: null
    });

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

    // ADD THIS:
    setUiState(prev => ({
      ...prev,
      formCollapsed: false
    }));

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
            formCollapsed: false  // ADD THIS
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
        console.log('Info: Configuration imported, refreshing header entries');

        // Update saved data if provided
        if (message.savedData) {
          setHeaderEntries(message.savedData);
        } else {
          // Otherwise refresh from storage
          refreshHeaderEntries();
        }

        // Update dynamic sources if provided
        if (message.dynamicSources && Array.isArray(message.dynamicSources)) {
          setDynamicSources(message.dynamicSources);
        }

        // Clear any edit mode
        setEditMode({
          isEditing: false,
          entryId: null
        });

        // Reset draft values
        setDraftValues({
          headerName: '',
          headerValue: '',
          domains: [],
          valueType: 'static',
          sourceId: '',
          prefix: '',
          suffix: '',
          isResponse: false
        });

        // Collapse the form
        setUiState(prev => ({
          ...prev,
          formCollapsed: false  // false = collapsed
        }));
      }
    };

    // Add listener for messages
    runtime.onMessage.addListener(handleMessagesFromBackground);

    // Initial load of data
    loadHeaderEntries();
    loadDynamicSources();
    loadPopupState();

    // Notify background script that popup is open
    sendMessageSafely({ type: 'popupOpen' }, (response, error) => {
      if (!error && response && response.sources) {
        setDynamicSources(response.sources);
      } else if (error) {
        // Retry once after a short delay
        setTimeout(() => {
          sendMessageSafely({ type: 'popupOpen' }, (retryResponse, retryError) => {
            if (!retryError && retryResponse && retryResponse.sources) {
              setDynamicSources(retryResponse.sources);
            }
          });
        }, 100);
      }
    });

    // Start connection status checker
    const connectionCheckInterval = setInterval(() => {
      sendMessageSafely({ type: 'checkConnection' }, (response, error) => {
        if (!error && response) {
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