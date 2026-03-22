import { useState, useEffect, useCallback } from 'react';
import { getEnvironmentService, type EnvironmentServiceState } from '../services/EnvironmentService';

interface UseEnvironmentServiceReturn extends EnvironmentServiceState {
  isReady: boolean;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  switchEnvironment: (environmentId: string) => Promise<void>;
  resolveTemplate: (template: string) => string;
  getAllVariables: () => Record<string, string>;
  waitForReady: () => Promise<void>;
  service: ReturnType<typeof getEnvironmentService>;
}

/**
 * Hook to use the EnvironmentService in React components
 */
export function useEnvironmentService(): UseEnvironmentServiceReturn {
  const service = getEnvironmentService();
  const [state, setState] = useState<EnvironmentServiceState>(service.getState());

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = service.subscribe(setState);

    // Initialize if not already done
    if (!state.initialized && !state.loading) {
      service.initialize().catch((error: Error) => {
        console.error('[useEnvironmentService] Failed to initialize:', error);
      });
    }

    return unsubscribe;
  }, []);

  const switchWorkspace = useCallback(async (_workspaceId: string) => {
    // switchWorkspace not implemented on service yet - placeholder
    await service.reloadWorkspace();
  }, [service]);

  const switchEnvironment = useCallback(async (environmentId: string) => {
    await service.switchEnvironment(environmentId);
  }, [service]);

  const resolveTemplate = useCallback((template: string): string => {
    return service.resolveTemplate(template);
  }, [service]);

  const getAllVariables = useCallback((): Record<string, string> => {
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

interface UseResolvedVariablesReturn {
  variables: Record<string, string>;
  isReady: boolean;
}

/**
 * Hook to get resolved variables
 */
export function useResolvedVariables(): UseResolvedVariablesReturn {
  const { getAllVariables, isReady } = useEnvironmentService();

  return {
    variables: isReady ? getAllVariables() : {},
    isReady
  };
}

interface UseResolveTemplateReturn {
  resolved: string;
  isReady: boolean;
}

/**
 * Hook to resolve a template string
 */
export function useResolveTemplate(template: string): UseResolveTemplateReturn {
  const { resolveTemplate, isReady } = useEnvironmentService();

  return {
    resolved: isReady ? resolveTemplate(template) : template,
    isReady
  };
}
