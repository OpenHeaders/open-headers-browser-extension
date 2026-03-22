/**
 * EnvironmentService - Centralized service for managing workspace, environments, and variables
 */

export interface EnvironmentInfo {
  id: string;
  name: string;
  variables: Map<string, string>;
}

export interface WorkspaceData {
  id: string;
  name: string;
  environments: string[];
}

export interface EnvironmentServiceState {
  initialized: boolean;
  loading: boolean;
  workspace: WorkspaceData;
  currentEnvironmentId: string | null;
  environmentData: Map<string, EnvironmentInfo>;
}

type StateListener = (state: EnvironmentServiceState) => void;

class EnvironmentService {
  private state: EnvironmentServiceState;
  private listeners: Set<StateListener>;
  private initPromise: Promise<void> | null;

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
      environmentData: new Map(),
    };

    this.listeners = new Set();
    this.initPromise = null;
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._doInitialize();
    return this.initPromise;
  }

  private async _doInitialize(): Promise<void> {
    this.setState({ loading: true });

    try {
      await this.loadWorkspace();

      const savedEnvironmentId = await this.getStoredEnvironment();
      if (savedEnvironmentId && this.state.workspace.environments.includes(savedEnvironmentId)) {
        this.state.currentEnvironmentId = savedEnvironmentId;
      } else if (this.state.workspace.environments.length > 0) {
        this.state.currentEnvironmentId = this.state.workspace.environments[0];
      }

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

  getState(): EnvironmentServiceState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private setState(updates: Partial<EnvironmentServiceState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('[EnvironmentService] Listener error:', error);
      }
    });
  }

  private async loadWorkspace(): Promise<void> {
    try {
      const workspaceData = await this.fetchWorkspace();
      this.state.workspace = workspaceData;
    } catch (error) {
      console.error('[EnvironmentService] Failed to load workspace:', error);
      throw error;
    }
  }

  private async loadAllEnvironmentData(): Promise<void> {
    try {
      const environmentData = new Map<string, EnvironmentInfo>();

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

  getCurrentEnvironment(): EnvironmentInfo | null | undefined {
    if (!this.state.currentEnvironmentId) {
      return null;
    }
    return this.state.environmentData.get(this.state.currentEnvironmentId);
  }

  getCurrentVariables(): Map<string, string> {
    const env = this.getCurrentEnvironment();
    return env ? env.variables : new Map();
  }

  async reloadWorkspace(): Promise<void> {
    this.setState({ loading: true });

    try {
      await this.loadWorkspace();
      await this.loadAllEnvironmentData();
    } finally {
      this.setState({ loading: false });
    }
  }

  async switchEnvironment(environmentId: string): Promise<void> {
    if (this.state.currentEnvironmentId === environmentId) {
      return;
    }

    if (!this.state.workspace.environments.includes(environmentId)) {
      throw new Error(`Environment ${environmentId} not found in workspace`);
    }

    this.setState({ currentEnvironmentId: environmentId });
    await this.storeEnvironment(environmentId);
  }

  getAllVariables(): Record<string, string> {
    const variables: Record<string, string> = {};
    const currentVars = this.getCurrentVariables();

    for (const [key, value] of currentVars) {
      variables[key] = value;
    }

    return variables;
  }

  resolveTemplate(template: string): string {
    if (!template || typeof template !== 'string') {
      return template;
    }

    const variables = this.getAllVariables();
    let resolved = template;

    resolved = resolved.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
      if (Object.prototype.hasOwnProperty.call(variables, varName)) {
        return variables[varName];
      }
      console.warn(`[EnvironmentService] Variable '${varName}' not found`);
      return match;
    });

    return resolved;
  }

  async waitForReady(): Promise<void> {
    if (this.state.initialized) {
      return;
    }

    if (!this.initPromise) {
      await this.initialize();
    } else {
      await this.initPromise;
    }
  }

  isReady(): boolean {
    return this.state.initialized && !this.state.loading;
  }

  private async getStoredEnvironment(): Promise<string | null> {
    return localStorage.getItem('currentEnvironment');
  }

  private async storeEnvironment(environmentId: string): Promise<void> {
    localStorage.setItem('currentEnvironment', environmentId);
  }

  private async fetchWorkspace(): Promise<WorkspaceData> {
    return {
      id: 'personal',
      name: 'Personal',
      environments: ['development', 'staging', 'production']
    };
  }

  private async fetchEnvironmentInfo(environmentId: string): Promise<{ id: string; name: string }> {
    const envNames: Record<string, string> = {
      'development': 'Development',
      'staging': 'Staging',
      'production': 'Production'
    };
    return {
      id: environmentId,
      name: envNames[environmentId] || environmentId
    };
  }

  private async fetchEnvironmentVariables(environmentId: string): Promise<Record<string, string>> {
    const mockVariables: Record<string, Record<string, string>> = {
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
let environmentServiceInstance: EnvironmentService | null = null;

export function getEnvironmentService(): EnvironmentService {
  if (!environmentServiceInstance) {
    environmentServiceInstance = new EnvironmentService();
  }
  return environmentServiceInstance;
}

export default EnvironmentService;
