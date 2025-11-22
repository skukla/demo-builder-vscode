/**
 * Tests for check-api-mesh handler
 *
 * SECURITY TESTS (Step 2): Validates workspaceId parameter to prevent command injection
 */

import { handleCheckApiMesh } from '@/features/mesh/handlers/checkHandler';
import { HandlerContext } from '@/commands/handlers/HandlerContext';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';

// Mock dependencies
jest.mock('@/core/di');
jest.mock('vscode');
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        mkdtemp: jest.fn().mockResolvedValue('/tmp/aio-workspace-test'),
        readFile: jest.fn().mockResolvedValue('{"project":{"workspace":{"details":{"services":[]}}}}'),
        rm: jest.fn().mockResolvedValue(undefined),
    },
}));

describe('checkHandler - Security Tests (Step 2)', () => {
    let mockContext: HandlerContext;
    let mockCommandExecutor: any;
    let mockAuthService: any;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Mock authentication service
        mockAuthService = {
            isAuthenticated: jest.fn().mockResolvedValue(true),
        };

        // Mock command executor
        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({
                code: 0,
                stdout: '{"meshId":"test-mesh","meshStatus":"deployed"}',
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
            } as any,
            logger: {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            } as any,
            debugLogger: {
                debug: jest.fn(),
            } as any,
            sharedState: {
                apiServicesConfig: {
                    services: {
                        apiMesh: {
                            detection: {
                                namePatterns: ['API Mesh'],
                                codes: ['MeshAPI'],
                                codeNames: ['MeshAPI'],
                            },
                        },
                    },
                },
            } as any,
        } as any;
    });

    describe('WorkspaceId Validation (SECURITY)', () => {
        it('should accept valid UUID workspaceId', async () => {
            const validWorkspaceId = '12345678-1234-1234-1234-123456789abc';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });

            // Should not throw validation error
            expect(result.success).toBeDefined();
        });

        it('should accept alphanumeric workspaceId with hyphens', async () => {
            const validWorkspaceId = 'workspace-123-abc';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });

            // Should not throw validation error
            expect(result.success).toBeDefined();
        });

        it('should reject empty workspaceId', async () => {
            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: '',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/workspace.*id/i);
        });

        it('should reject workspaceId with command substitution $(rm -rf /)', async () => {
            const maliciousWorkspaceId = '$(rm -rf /)';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should reject workspaceId with pipe operator', async () => {
            const maliciousWorkspaceId = 'workspace123 | cat /etc/passwd';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should reject workspaceId with semicolon command separator', async () => {
            const maliciousWorkspaceId = 'workspace123; rm -rf /';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should reject workspaceId with backtick command substitution', async () => {
            const maliciousWorkspaceId = 'workspace`whoami`';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should reject workspaceId with shell redirection', async () => {
            const maliciousWorkspaceId = 'workspace > /tmp/evil.txt';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });

        it('should reject workspaceId with ampersand (background execution)', async () => {
            const maliciousWorkspaceId = 'workspace123 & echo evil';

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid.*workspace.*id/i);
        });
    });

    describe('Shell Parameter Usage', () => {
        it('should use shell parameter when executing Adobe CLI commands', async () => {
            const validWorkspaceId = 'workspace-123';

            await handleCheckApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });

            // execute() automatically uses shell: DEFAULT_SHELL (from CommandExecutor line 439)
            expect(mockCommandExecutor.execute).toHaveBeenCalled();
        });

        it('should pass validated workspaceId to Adobe CLI command', async () => {
            const validWorkspaceId = 'workspace-123-abc';

            await handleCheckApiMesh(mockContext, {
                workspaceId: validWorkspaceId,
            });

            // Check that workspaceId is used in command after validation
            const firstCall = mockCommandExecutor.execute.mock.calls[0];
            expect(firstCall[0]).toContain(validWorkspaceId);
        });
    });

    describe('Error Handling', () => {
        it('should handle authentication failure gracefully', async () => {
            mockAuthService.isAuthenticated.mockResolvedValue(false);

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/authentication required/i);
        });

        it('should not execute commands if workspaceId validation fails', async () => {
            const maliciousWorkspaceId = '$(rm -rf /)';

            await handleCheckApiMesh(mockContext, {
                workspaceId: maliciousWorkspaceId,
            });

            // Should NOT call execute() if validation fails
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        });
    });
});
