/**
 * delete-api-mesh handler — org targeting.
 *
 * `aio api-mesh delete` takes no --workspaceId, so the ONLY thing that decides
 * which mesh it deletes is the org context in effect when it runs. Until
 * 2026-08-16 this handler validated its workspaceId, logged it, and then never
 * used it: the command ran unwrapped and deleted whatever the aio CLI's
 * process-global selection pointed at — with --autoConfirmAction, so no prompt
 * stood between a wrong target and a deleted mesh. It is reachable from the
 * wizard and from the confirm-gated `delete_mesh` MCP tool, both of which pass
 * a workspaceId and could reasonably believe it was honoured.
 *
 * These tests pin the targeting, not the logging (meshHandlersDI covers that).
 */

import { handleDeleteApiMesh } from '@/features/mesh/handlers/deleteHandler';
import { HandlerContext } from '@/types/handlers';
import { ServiceLocator } from '@/core/di/serviceLocator';
import * as _vscode from 'vscode';
import { MESH_DELETE_COMMAND } from '@/core/shell/meshDeleteCommand';
import { createMockLogger } from '../../../helpers/loggerFake';

// Record the target rather than stubbing it out — the assertion IS the target.
// buildOrgTargetFromProjectAdobe is pure, so the real one is used.
const mockWithOrgContext = jest.fn((_target: unknown, fn: () => Promise<unknown>) => fn());
jest.mock('@/core/shell/orgContextEnv', () => ({
    ...jest.requireActual('@/core/shell/orgContextEnv'),
    withOrgContext: (target: unknown, fn: () => Promise<unknown>) => mockWithOrgContext(target, fn),
}));

jest.mock('@/core/di/serviceLocator');
jest.mock('@/core/utils/meshConfig', () => ({
    getMeshNodeVersion: () => '20',
}));

describe('handleDeleteApiMesh — org targeting', () => {
    let mockContext: HandlerContext;
    let mockCommandExecutor: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = {
            execute: jest.fn().mockResolvedValue({ code: 0, stdout: 'deleted', stderr: '' }),
        };

        (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        });
        (ServiceLocator.getCommandExecutor as jest.Mock).mockReturnValue(mockCommandExecutor);

        mockContext = {
            context: { globalStorageUri: { fsPath: '/tmp/test-storage' } },
            logger: createMockLogger(),
            debugLogger: { trace: jest.fn(), debug: jest.fn() },
            stateManager: {
                getCurrentProject: jest.fn().mockResolvedValue({
                    adobe: {
                        organization: 'test-org@AdobeOrg',
                        projectId: 'test-project-id',
                        workspace: 'project-workspace-id',
                    },
                }),
            },
            sharedState: {},
        } as any;
    });

    it('runs the delete inside an org context, not bare', async () => {
        await handleDeleteApiMesh(mockContext, { workspaceId: 'target-workspace-id' });

        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
            MESH_DELETE_COMMAND,
            expect.any(Object)
        );
    });

    it('targets the workspace it was ASKED to delete, not the project default', async () => {
        await handleDeleteApiMesh(mockContext, { workspaceId: 'target-workspace-id' });

        const target = mockWithOrgContext.mock.calls[0][0] as Record<string, string>;
        expect(target.workspaceId).toBe('target-workspace-id');
        expect(target.workspaceId).not.toBe('project-workspace-id');
        // Org and project still come from the current project — only the
        // workspace is caller-supplied.
        expect(target.orgId).toBe('test-org@AdobeOrg');
        expect(target.projectId).toBe('test-project-id');
    });

    it('does not execute anything when the workspaceId fails validation', async () => {
        const result = await handleDeleteApiMesh(mockContext, {
            workspaceId: 'workspace | cat /etc/passwd',
        });

        expect(result.success).toBe(false);
        // The point is that a rejected id cannot reach the CLI at all — not
        // merely that an error was returned after the fact.
        expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
        expect(mockWithOrgContext).not.toHaveBeenCalled();
    });

    it('reports failure when the CLI exits non-zero', async () => {
        mockCommandExecutor.execute.mockResolvedValue({
            code: 1,
            stdout: '',
            stderr: 'mesh not found',
        });

        const result = await handleDeleteApiMesh(mockContext, {
            workspaceId: 'target-workspace-id',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('mesh not found');
    });
});
