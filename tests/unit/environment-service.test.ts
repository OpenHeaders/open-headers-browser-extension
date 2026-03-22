import { describe, it, expect, vi, beforeEach } from 'vitest';
import EnvironmentService from '../../src/services/EnvironmentService';
import type { EnvironmentServiceState } from '../../src/services/EnvironmentService';

// ---------------------------------------------------------------------------
//  Factory
// ---------------------------------------------------------------------------

function makeService(): EnvironmentService {
    return new EnvironmentService();
}

// ---------------------------------------------------------------------------
//  Tests
// ---------------------------------------------------------------------------

describe('EnvironmentService', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    describe('initial state', () => {
        it('has correct default state shape', () => {
            const service = makeService();
            const state = service.getState();

            expect(state.initialized).toBe(false);
            expect(state.loading).toBe(false);
            expect(state.workspace).toEqual({
                id: 'personal',
                name: 'Personal',
                environments: [],
            });
            expect(state.currentEnvironmentId).toBeNull();
            expect(state.environmentData).toBeInstanceOf(Map);
            expect(state.environmentData.size).toBe(0);
        });

        it('isReady returns false before initialization', () => {
            const service = makeService();
            expect(service.isReady()).toBe(false);
        });
    });

    describe('initialize', () => {
        it('loads workspace and environments', async () => {
            const service = makeService();
            await service.initialize();

            const state = service.getState();
            expect(state.initialized).toBe(true);
            expect(state.loading).toBe(false);
            expect(state.workspace.environments).toEqual(['development', 'staging', 'production']);
            expect(state.currentEnvironmentId).toBe('development');
            expect(state.environmentData.size).toBe(3);
        });

        it('isReady returns true after initialization', async () => {
            const service = makeService();
            await service.initialize();
            expect(service.isReady()).toBe(true);
        });

        it('does not re-initialize on multiple calls', async () => {
            const service = makeService();
            await service.initialize();
            const stateAfterFirst = service.getState();

            await service.initialize();
            const stateAfterSecond = service.getState();

            // Both should be initialized with same data
            expect(stateAfterFirst.initialized).toBe(true);
            expect(stateAfterSecond.initialized).toBe(true);
            expect(stateAfterFirst.workspace).toEqual(stateAfterSecond.workspace);
        });

        it('restores saved environment from localStorage', async () => {
            localStorage.setItem('currentEnvironment', 'production');
            const service = makeService();
            await service.initialize();

            expect(service.getState().currentEnvironmentId).toBe('production');
        });

        it('falls back to first environment if saved one is invalid', async () => {
            localStorage.setItem('currentEnvironment', 'nonexistent-env');
            const service = makeService();
            await service.initialize();

            expect(service.getState().currentEnvironmentId).toBe('development');
        });
    });

    describe('subscribe', () => {
        it('notifies listeners on state change', async () => {
            const service = makeService();
            const states: EnvironmentServiceState[] = [];
            service.subscribe((s) => states.push(s));

            await service.initialize();

            // Should have been called for loading=true, then initialized=true/loading=false
            expect(states.length).toBeGreaterThanOrEqual(2);
            expect(states[states.length - 1].initialized).toBe(true);
        });

        it('returns unsubscribe function', async () => {
            const service = makeService();
            const listener = vi.fn();
            const unsub = service.subscribe(listener);

            unsub();
            await service.initialize();

            // After unsubscribe, listener should not be called for initialize changes
            // But it may have been called 0 times if unsub was before any state change
            expect(listener).not.toHaveBeenCalled();
        });

        it('handles listener errors gracefully', async () => {
            const service = makeService();
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            service.subscribe(() => {
                throw new Error('listener crash');
            });

            // Should not throw
            await service.initialize();

            errorSpy.mockRestore();
        });
    });

    describe('switchEnvironment', () => {
        it('switches to a valid environment', async () => {
            const service = makeService();
            await service.initialize();

            await service.switchEnvironment('production');
            expect(service.getState().currentEnvironmentId).toBe('production');
        });

        it('persists environment to localStorage', async () => {
            const service = makeService();
            await service.initialize();

            await service.switchEnvironment('staging');
            expect(localStorage.getItem('currentEnvironment')).toBe('staging');
        });

        it('throws for invalid environment', async () => {
            const service = makeService();
            await service.initialize();

            await expect(service.switchEnvironment('nonexistent'))
                .rejects.toThrow('Environment nonexistent not found');
        });

        it('no-ops when switching to current environment', async () => {
            const service = makeService();
            await service.initialize();

            const listener = vi.fn();
            service.subscribe(listener);

            await service.switchEnvironment('development'); // already current
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('getCurrentEnvironment', () => {
        it('returns current environment info', async () => {
            const service = makeService();
            await service.initialize();

            const env = service.getCurrentEnvironment();
            expect(env).toBeDefined();
            expect(env!.id).toBe('development');
            expect(env!.name).toBe('Development');
            expect(env!.variables).toBeInstanceOf(Map);
        });

        it('returns null when no environment selected', () => {
            const service = makeService();
            expect(service.getCurrentEnvironment()).toBeNull();
        });
    });

    describe('getAllVariables', () => {
        it('returns variables as plain object', async () => {
            const service = makeService();
            await service.initialize();

            const vars = service.getAllVariables();
            expect(vars).toEqual({
                API_URL: 'https://dev-api.example.com',
                APP_ENV: 'development',
                DEBUG: 'true',
            });
        });

        it('returns empty object when no environment', () => {
            const service = makeService();
            expect(service.getAllVariables()).toEqual({});
        });

        it('returns different variables per environment', async () => {
            const service = makeService();
            await service.initialize();

            const devVars = service.getAllVariables();
            await service.switchEnvironment('production');
            const prodVars = service.getAllVariables();

            expect(devVars.API_URL).not.toBe(prodVars.API_URL);
            expect(prodVars.APP_ENV).toBe('production');
        });
    });

    describe('resolveTemplate', () => {
        it('resolves {{VAR}} placeholders', async () => {
            const service = makeService();
            await service.initialize();

            const result = service.resolveTemplate('https://{{API_URL}}/v1/users');
            expect(result).toBe('https://https://dev-api.example.com/v1/users');
        });

        it('leaves unresolved placeholders intact', async () => {
            const service = makeService();
            await service.initialize();

            const result = service.resolveTemplate('{{UNKNOWN_VAR}}');
            expect(result).toBe('{{UNKNOWN_VAR}}');
        });

        it('handles multiple placeholders', async () => {
            const service = makeService();
            await service.initialize();

            const result = service.resolveTemplate('env={{APP_ENV}}&debug={{DEBUG}}');
            expect(result).toBe('env=development&debug=true');
        });

        it('returns input unchanged if no placeholders', async () => {
            const service = makeService();
            await service.initialize();

            expect(service.resolveTemplate('plain string')).toBe('plain string');
        });

        it('handles empty/null input', () => {
            const service = makeService();
            expect(service.resolveTemplate('')).toBe('');
            expect(service.resolveTemplate(null as unknown as string)).toBeNull();
        });
    });

    describe('reloadWorkspace', () => {
        it('reloads workspace and environment data', async () => {
            const service = makeService();
            await service.initialize();

            const listener = vi.fn();
            service.subscribe(listener);

            await service.reloadWorkspace();

            // Should have loading=true then loading=false
            expect(listener).toHaveBeenCalled();
            expect(service.getState().loading).toBe(false);
        });
    });

    describe('waitForReady', () => {
        it('resolves immediately if already initialized', async () => {
            const service = makeService();
            await service.initialize();

            // Should not hang
            await service.waitForReady();
            expect(service.isReady()).toBe(true);
        });

        it('triggers initialization if not started', async () => {
            const service = makeService();
            await service.waitForReady();

            expect(service.isReady()).toBe(true);
        });
    });
});
