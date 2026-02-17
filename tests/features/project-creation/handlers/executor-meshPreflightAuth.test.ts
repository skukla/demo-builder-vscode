/**
 * Executor - Mesh Pre-flight Authentication Test Suite
 *
 * Regression tests for multiple browser popup bug during mesh deployment.
 *
 * Bug: When editing a project with an expired Adobe token, each `aio` CLI
 * command in Phase 3 independently opens a browser for OAuth. The fix adds
 * a pre-flight auth check before any CLI commands run, following the pattern
 * from DeployMeshCommand (deployMesh.ts:51-92).
 *
 * Tests the `ensureMeshPreflightAuth` helper extracted from executor.ts.
 *
 * Total tests: 5
 */

import { ensureMeshPreflightAuth } from '@/features/project-creation/handlers/executor';

describe('Executor - Mesh Pre-flight Authentication', () => {
    // Minimal mock for authManager
    function createMockAuthManager(overrides: {
        isAuthenticated?: boolean;
        loginSuccess?: boolean;
        postLoginAuthenticated?: boolean;
    } = {}) {
        const {
            isAuthenticated = true,
            loginSuccess = true,
            postLoginAuthenticated = true,
        } = overrides;

        let callCount = 0;
        return {
            isAuthenticated: jest.fn().mockImplementation(async () => {
                callCount++;
                // First call returns the initial state; after login, return postLoginAuthenticated
                if (callCount === 1) return isAuthenticated;
                return postLoginAuthenticated;
            }),
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(loginSuccess),
        };
    }

    function createMockLogger() {
        return {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };
    }

    describe('when auth token is valid', () => {
        it('should return true without attempting login', async () => {
            const authManager = createMockAuthManager({ isAuthenticated: true });
            const logger = createMockLogger();

            const result = await ensureMeshPreflightAuth(authManager as any, logger as any, {});

            expect(result).toBe(true);
            expect(authManager.isAuthenticated).toHaveBeenCalledTimes(1);
            expect(authManager.loginAndRestoreProjectContext).not.toHaveBeenCalled();
        });
    });

    describe('when auth token is expired', () => {
        it('should attempt re-login and succeed', async () => {
            const authManager = createMockAuthManager({
                isAuthenticated: false,
                loginSuccess: true,
                postLoginAuthenticated: true,
            });
            const logger = createMockLogger();
            const adobeConfig = {
                organization: 'org-123',
                projectId: 'proj-456',
                workspace: 'ws-789',
            };

            const result = await ensureMeshPreflightAuth(authManager as any, logger as any, adobeConfig);

            expect(result).toBe(true);
            expect(authManager.loginAndRestoreProjectContext).toHaveBeenCalledWith({
                organization: 'org-123',
                projectId: 'proj-456',
                workspace: 'ws-789',
            });
        });

        it('should return false when re-login fails', async () => {
            const authManager = createMockAuthManager({
                isAuthenticated: false,
                loginSuccess: false,
            });
            const logger = createMockLogger();

            const result = await ensureMeshPreflightAuth(authManager as any, logger as any, {});

            expect(result).toBe(false);
            expect(authManager.loginAndRestoreProjectContext).toHaveBeenCalled();
        });

        it('should verify auth after successful login', async () => {
            const authManager = createMockAuthManager({
                isAuthenticated: false,
                loginSuccess: true,
                postLoginAuthenticated: false, // Login succeeded but token still invalid
            });
            const logger = createMockLogger();

            const result = await ensureMeshPreflightAuth(authManager as any, logger as any, {});

            expect(result).toBe(false);
            // Should have called isAuthenticated twice: initial check + post-login verification
            expect(authManager.isAuthenticated).toHaveBeenCalledTimes(2);
        });
    });

    describe('when authManager is not available', () => {
        it('should return true (graceful degradation)', async () => {
            const logger = createMockLogger();

            const result = await ensureMeshPreflightAuth(undefined, logger as any, {});

            expect(result).toBe(true);
        });
    });
});
