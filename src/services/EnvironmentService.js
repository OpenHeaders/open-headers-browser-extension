/**
 * EnvironmentService - Centralized service for managing workspace, environments, and variables
 * 
 * Data Model:
 * - 1 Workspace (e.g., "personal", "team")
 * - Multiple Environments per workspace (e.g., "development", "staging", "production")
 * - Multiple Variables per environment (e.g., API_URL, APP_KEY, etc.)
 * 
 * This service provides a single source of truth for all environment-related state
 * and ensures consistency across all components.
 */

class EnvironmentService {
  constructor() {
    this.state = {
      initialized: false,
      loading: false,
      workspace: {
        id: 'personal',
        name: 'Personal',
        environments: []
      },
      currentEnvironmentId: null,
      // Environment data keyed by environment ID
      environmentData: new Map(), // Map<envId, { id, name, variables: Map<key, value> }>
    };
    
    this.listeners = new Set();
    this.initPromise = null;
  }

  /**
   * Initialize the service and load all data
   */
  async initialize() {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  async _doInitialize() {
    this.setState({ loading: true });

    try {
      // Load workspace data (includes environments)
      await this.loadWorkspace();
      
      // Load saved current environment
      const savedEnvironmentId = await this.getStoredEnvironment();
      if (savedEnvironmentId && this.state.workspace.environments.includes(savedEnvironmentId)) {
        this.state.currentEnvironmentId = savedEnvironmentId;
      } else if (this.state.workspace.environments.length > 0) {
        // Default to first environment
        this.state.currentEnvironmentId = this.state.workspace.environments[0];
      }

      // Load all environment data (variables for each environment)
      await this.loadAllEnvironmentData();
      
      this.setState({ 
        initialized: true, 
        loading: false 
      });
    } catch (error) {
      console.error('[EnvironmentService] Initialization failed:', error);
      this.setState({ 
        initialized: false, 
        loading: false 
      });
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState() {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Update state and notify listeners
   */
  setState(updates) {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('[EnvironmentService] Listener error:', error);
      }
    });
  }

  /**
   * Load workspace data including available environments
   */
  async loadWorkspace() {
    try {
      const workspaceData = await this.fetchWorkspace();
      this.state.workspace = workspaceData;
    } catch (error) {
      console.error('[EnvironmentService] Failed to load workspace:', error);
      throw error;
    }
  }

  /**
   * Load all environment data (variables for each environment)
   */
  async loadAllEnvironmentData() {
    try {
      const environmentData = new Map();
      
      // Load data for each environment in parallel
      const loadPromises = this.state.workspace.environments.map(async (envId) => {
        const envInfo = await this.fetchEnvironmentInfo(envId);
        const variables = await this.fetchEnvironmentVariables(envId);
        
        environmentData.set(envId, {
          id: envId,
          name: envInfo.name,
          variables: new Map(Object.entries(variables))
        });
      });
      
      await Promise.all(loadPromises);
      this.state.environmentData = environmentData;
    } catch (error) {
      console.error('[EnvironmentService] Failed to load environment data:', error);
      throw error;
    }
  }

  /**
   * Get current environment
   */
  getCurrentEnvironment() {
    if (!this.state.currentEnvironmentId) {
      return null;
    }
    return this.state.environmentData.get(this.state.currentEnvironmentId);
  }

  /**
   * Get variables for current environment
   */
  getCurrentVariables() {
    const env = this.getCurrentEnvironment();
    return env ? env.variables : new Map();
  }

  /**
   * Reload workspace data (useful when workspace configuration changes)
   */
  async reloadWorkspace() {
    this.setState({ loading: true });

    try {
      await this.loadWorkspace();
      await this.loadAllEnvironmentData();
    } finally {
      this.setState({ loading: false });
    }
  }

  /**
   * Switch environment
   */
  async switchEnvironment(environmentId) {
    if (this.state.currentEnvironmentId === environmentId) {
      return;
    }

    if (!this.state.workspace.environments.includes(environmentId)) {
      throw new Error(`Environment ${environmentId} not found in workspace`);
    }

    this.setState({ currentEnvironmentId: environmentId });
    await this.storeEnvironment(environmentId);
  }

  /**
   * Get all variables for current environment
   */
  getAllVariables() {
    const variables = {};
    const currentVars = this.getCurrentVariables();
    
    for (const [key, value] of currentVars) {
      variables[key] = value;
    }
    
    return variables;
  }

  /**
   * Resolve a template string with variables
   */
  resolveTemplate(template) {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const variables = this.getAllVariables();
    let resolved = template;

    // Replace {{VARIABLE_NAME}} patterns
    resolved = resolved.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      if (variables.hasOwnProperty(varName)) {
        return variables[varName];
      }
      console.warn(`[EnvironmentService] Variable '${varName}' not found`);
      return match; // Keep original if not found
    });

    return resolved;
  }

  /**
   * Wait for initialization
   */
  async waitForReady() {
    if (this.state.initialized) {
      return;
    }

    if (!this.initPromise) {
      await this.initialize();
    } else {
      await this.initPromise;
    }
  }

  /**
   * Check if service is ready
   */
  isReady() {
    return this.state.initialized && !this.state.loading;
  }

  // Storage helpers (implement based on your storage solution)
  async getStoredEnvironment() {
    // Implement based on your storage
    return localStorage.getItem('currentEnvironment');
  }

  async storeEnvironment(environmentId) {
    localStorage.setItem('currentEnvironment', environmentId);
  }

  // API calls (implement based on your backend)
  async fetchWorkspace() {
    // Mock implementation - replace with actual API call
    // In reality, this would fetch from your storage/API
    return {
      id: 'personal',
      name: 'Personal',
      environments: ['development', 'staging', 'production']
    };
  }

  async fetchEnvironmentInfo(environmentId) {
    // Mock implementation - replace with actual API call
    const envNames = {
      'development': 'Development',
      'staging': 'Staging',
      'production': 'Production'
    };
    return {
      id: environmentId,
      name: envNames[environmentId] || environmentId
    };
  }

  async fetchEnvironmentVariables(environmentId) {
    // Mock implementation - replace with actual API call
    // This would fetch from your actual storage
    const mockVariables = {
      'development': {
        API_URL: 'https://dev-api.example.com',
        APP_ENV: 'development',
        DEBUG: 'true'
      },
      'staging': {
        API_URL: 'https://staging-api.example.com',
        APP_ENV: 'staging',
        DEBUG: 'false'
      },
      'production': {
        API_URL: 'https://api.example.com',
        APP_ENV: 'production',
        DEBUG: 'false'
      }
    };
    
    return mockVariables[environmentId] || {};
  }
}

// Create singleton instance
let environmentServiceInstance = null;

export function getEnvironmentService() {
  if (!environmentServiceInstance) {
    environmentServiceInstance = new EnvironmentService();
  }
  return environmentServiceInstance;
}

export default EnvironmentService;