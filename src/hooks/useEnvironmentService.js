import { useState, useEffect, useCallback } from 'react';
import { getEnvironmentService } from '../services/EnvironmentService';

/**
 * Hook to use the EnvironmentService in React components
 */
export function useEnvironmentService() {
  const service = getEnvironmentService();
  const [state, setState] = useState(service.getState());

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = service.subscribe(setState);

    // Initialize if not already done
    if (!state.initialized && !state.loading) {
      service.initialize().catch(error => {
        console.error('[useEnvironmentService] Failed to initialize:', error);
      });
    }

    return unsubscribe;
  }, []);

  const switchWorkspace = useCallback(async (workspaceId) => {
    await service.switchWorkspace(workspaceId);
  }, [service]);

  const switchEnvironment = useCallback(async (environmentId) => {
    await service.switchEnvironment(environmentId);
  }, [service]);

  const resolveTemplate = useCallback((template) => {
    return service.resolveTemplate(template);
  }, [service]);

  const getAllVariables = useCallback(() => {
    return service.getAllVariables();
  }, [service]);

  const waitForReady = useCallback(async () => {
    await service.waitForReady();
  }, [service]);

  return {
    // State
    ...state,
    isReady: state.initialized && !state.loading,
    
    // Actions
    switchWorkspace,
    switchEnvironment,
    resolveTemplate,
    getAllVariables,
    waitForReady,
    
    // Direct service access if needed
    service
  };
}

/**
 * Hook to get resolved variables
 */
export function useResolvedVariables() {
  const { getAllVariables, isReady } = useEnvironmentService();
  
  return {
    variables: isReady ? getAllVariables() : {},
    isReady
  };
}

/**
 * Hook to resolve a template string
 */
export function useResolveTemplate(template) {
  const { resolveTemplate, isReady } = useEnvironmentService();
  
  return {
    resolved: isReady ? resolveTemplate(template) : template,
    isReady
  };
}