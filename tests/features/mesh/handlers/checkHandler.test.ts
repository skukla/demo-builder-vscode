/**
 * Tests for check-api-mesh handler
 *
 * SECURITY TESTS (Step 2): Validates workspaceId parameter to prevent command injection
 */

import { handleCheckApiMesh } from '@/features/mesh/handlers/checkHandler';
import { HandlerContext } from '@/types/handlers';
import { ServiceLocator } from '@/core/di';
import * as _vscode from 'vscode';
import { createMockLogger } from '../../../helpers/loggerFake';

// withOrgContext records the target then runs the callback (no global mutation).
// buildOrgTargetFromProjectAdobe is pure — use the real implementation.
const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell', () => ({
    ...jest.requireActual('@/core/shell'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

// Mock dependencies
jest.mock('@/core/di');
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn().mockResolvedValue(undefined),
        mkdtemp: jest.fn().mockResolvedValue('/tmp/aio-workspace-test'),
        readFile: jest
            .fn()
            .mockResolvedValue('{"project":{"workspace":{"details":{"services":[]}}}}'),
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
            // Org-context targeting reads the cached org to enrich code/name.
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
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
            logger: createMockLogger() as any,
            debugLogger: {
                trace: jest.fn(),
                debug: jest.fn(),
            } as any,
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue({
                    adobe: {
                        organization: 'test-org-id',
                        projectId: 'test-project-id',
                        workspaceId: 'test-workspace-id',
                    },
                }),
            } as any,
            authManager: {} as any,
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

        // Regression: the MCP `check_mesh` tool dispatches `{}` (no agent knows an
        // Adobe workspace id), so before the fallback existed every invocation
        // returned "Invalid workspace ID: must be a non-empty string".
        it('falls back to the current project workspace when the payload omits one', async () => {
            (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue({
                adobe: {
                    organization: 'test-org-id',
                    projectId: 'test-project-id',
                    workspace: 'project-workspace-id',
                },
            });

            const result = await handleCheckApiMesh(mockContext, {});

            expect(result.error ?? '').not.toMatch(/invalid workspace/i);
            // The fallback id is what actually reached the Adobe CLI.
            const commands = mockCommandExecutor.execute.mock.calls.map((c: any[]) => c[0]);
            expect(commands.join('\n')).toContain('project-workspace-id');
        });

        it('prefers an explicit payload workspaceId over the project one', async () => {
            (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue({
                adobe: { organization: 'o', projectId: 'p', workspace: 'project-workspace-id' },
            });

            await handleCheckApiMesh(mockContext, { workspaceId: 'payload-workspace-id' });

            const commands = mockCommandExecutor.execute.mock.calls.map((c: any[]) => c[0]);
            expect(commands.join('\n')).toContain('payload-workspace-id');
            expect(commands.join('\n')).not.toContain('project-workspace-id');
        });

        it('reports no workspace when neither payload nor project has one', async () => {
            (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue({
                adobe: { organization: 'o', projectId: 'p' },
            });

            const result = await handleCheckApiMesh(mockContext, {});

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/no workspace id/i);
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
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

    describe('Manual setup-instructions retired (Step 04)', () => {
        // The config carries setupInstructions in production; the handler must NOT
        // surface them anymore — absent-API is auto-remediated by the deploy path.
        beforeEach(() => {
            (mockContext.sharedState as any).apiServicesConfig = {
                services: {
                    apiMesh: {
                        detection: {
                            namePatterns: ['API Mesh'],
                            codes: ['MeshAPI'],
                            codeNames: ['MeshAPI'],
                        },
                        setupInstructions: [
                            { step: 'Add a service', details: 'Add API Mesh in Console' },
                        ],
                    },
                },
            };
        });

        it('Layer 1 absent-API returns no setupInstructions', async () => {
            // Default readFile mock returns empty services -> Layer 1 absent-API.
            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(result.apiEnabled).toBe(false);
            expect('setupInstructions' in result).toBe(false);
        });

        it('Layer 2 fallback absent-API returns no setupInstructions', async () => {
            // Force Layer 1 to fail so the handler falls back to Layer 2.
            const fs = require('fs');
            (fs.promises.readFile as jest.Mock).mockRejectedValueOnce(new Error('download failed'));
            // Layer 2 `aio api-mesh get --active` -> "unable to get mesh config" = API absent.
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'Unable to get mesh config',
                stderr: '',
            });

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(result.apiEnabled).toBe(false);
            expect('setupInstructions' in result).toBe(false);
        });

        it('present-API reports apiEnabled true (post-automation verification signal)', async () => {
            const fs = require('fs');
            (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
                '{"project":{"workspace":{"details":{"services":[{"name":"API Mesh","code":"MeshAPI"}]}}}}'
            );
            // No mesh exists yet for this workspace.
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'No mesh found',
                stderr: '',
            });

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(result.apiEnabled).toBe(true);
            expect('setupInstructions' in result).toBe(false);
        });

        it('already-enabled project is a no-op (no instructions, no re-subscribe in the check)', async () => {
            const fs = require('fs');
            (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(
                '{"project":{"workspace":{"details":{"services":[{"name":"API Mesh","code":"MeshAPI"}]}}}}'
            );
            mockCommandExecutor.execute.mockResolvedValue({
                code: 0,
                stdout: 'No mesh found',
                stderr: '',
            });

            const result = await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(result.success).toBe(true);
            expect(result.apiEnabled).toBe(true);
            expect(result.meshExists).toBe(false);
            expect('setupInstructions' in result).toBe(false);
        });
    });

    describe('Org-Context Targeting (Phase 4a)', () => {
        it('should wrap the aio operations in withOrgContext', async () => {
            await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
                projectId: 'proj-456',
            });

            expect(mockWithOrgContext).toHaveBeenCalled();
        });

        it('should target the workspace via withOrgContext using payload projectId', async () => {
            await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
                projectId: 'proj-456',
            });

            expect(mockWithOrgContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectId: 'proj-456',
                    workspaceId: 'workspace-123',
                }),
                expect.any(Function)
            );
        });

        it('should still pass --workspaceId on the workspace download command', async () => {
            await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
                projectId: 'proj-456',
            });

            const downloadCall = mockCommandExecutor.execute.mock.calls.find(
                (c: unknown[]) =>
                    typeof c[0] === 'string' && (c[0] as string).includes('workspace download')
            );
            expect(downloadCall).toBeDefined();
            expect(downloadCall[0]).toContain('--workspaceId workspace-123');
        });

        it('should fall back to current project org/projectId when payload omits projectId', async () => {
            await handleCheckApiMesh(mockContext, {
                workspaceId: 'workspace-123',
            });

            expect(mockWithOrgContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgId: 'test-org-id',
                    projectId: 'test-project-id',
                    workspaceId: 'workspace-123',
                }),
                expect.any(Function)
            );
        });

        it('should enrich org code/name from the cached org when its id matches', async () => {
            mockAuthService.getCachedOrganization = jest.fn().mockReturnValue({
                id: 'test-org-id',
                code: 'CODE@AdobeOrg',
                name: 'Acme Inc',
            });

            await handleCheckApiMesh(mockContext, { workspaceId: 'workspace-123' });

            expect(mockWithOrgContext).toHaveBeenCalledWith(
                expect.objectContaining({
                    orgId: 'test-org-id',
                    orgCode: 'CODE@AdobeOrg',
                    orgName: 'Acme Inc',
                }),
                expect.any(Function)
            );
        });

        it('should NOT borrow cached org code/name when the cached org id differs', async () => {
            mockAuthService.getCachedOrganization = jest.fn().mockReturnValue({
                id: 'other-org',
                code: 'OTHER@AdobeOrg',
                name: 'Other',
            });

            await handleCheckApiMesh(mockContext, { workspaceId: 'workspace-123' });

            const target = mockWithOrgContext.mock.calls[0][0] as Record<string, unknown>;
            expect(target.orgId).toBe('test-org-id');
            expect(target.orgCode).toBeUndefined();
            expect(target.orgName).toBeUndefined();
        });
    });
});
