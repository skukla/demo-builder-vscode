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
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import { ErrorCode } from '@/types/errorCodes';
import { createMockLogger } from '../../../helpers/loggerFake';

import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
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

        mockContext = createMockHandlerContext({
            context: createMockExtensionContext({
                globalStorageUri: _vscode.Uri.file('/tmp/test-storage'),
            }),
            logger: createMockLogger(),
            debugLogger: createMockLogger(),
            stateManager: createMockStateManager({
                getCurrentProject: jest.fn().mockResolvedValue({
                    adobe: {
                        organization: 'test-org@AdobeOrg',
                        projectId: 'test-project-id',
                        workspace: 'project-workspace-id',
                    },
                }),
            }),
        });
    });

    it('runs the delete inside an org context, not bare', async () => {
        const result = await handleDeleteApiMesh(mockContext, {
            workspaceId: 'target-workspace-id',
        });

        expect(result).toEqual({ success: true });
        expect(mockWithOrgContext).toHaveBeenCalledTimes(1);
        // The whole options object, not `expect.any(Object)`. Telemetry off and
        // the Node version pinned are what make this run reproducible on an SC's
        // machine, and `{}` satisfies `any(Object)` while dropping all four.
        expect(mockCommandExecutor.execute).toHaveBeenCalledWith(MESH_DELETE_COMMAND, {
            timeout: TIMEOUTS.NORMAL,
            configureTelemetry: false,
            useNodeVersion: '20',
            enhancePath: true,
        });
    });

    it('clears the pre-existing-mesh flag once the delete succeeds', async () => {
        // Anything created after an explicit delete is NOT pre-existing, and the
        // flag is what later flows read to decide whether they may tear a mesh
        // down. Leaving it set outlives the mesh it described.
        mockContext.sharedState.meshExistedBeforeSession = 'mesh-from-a-previous-session';

        await handleDeleteApiMesh(mockContext, { workspaceId: 'target-workspace-id' });

        expect(mockContext.sharedState.meshExistedBeforeSession).toBeUndefined();
    });

    /**
     * The sign-in pre-flight. `aio api-mesh:delete` runs with
     * --autoConfirmAction, so a handler that fell through an unauthenticated
     * check would reach a destructive command with no prompt in the way.
     */
    describe('refuses to run at all without Adobe sign-in', () => {
        beforeEach(() => {
            (ServiceLocator.getAuthenticationService as jest.Mock).mockReturnValue({
                isAuthenticated: jest.fn().mockResolvedValue(false),
                getCachedOrganization: jest.fn().mockReturnValue(undefined),
            });
        });

        it('reports the refusal and never reaches the CLI', async () => {
            const result = await handleDeleteApiMesh(mockContext, {
                workspaceId: 'target-workspace-id',
            });

            expect(result.success).toBe(false);
            expect(result.code).toBe(ErrorCode.AUTH_REQUIRED);
            expect(result.error).toBeTruthy();
            expect(mockCommandExecutor.execute).not.toHaveBeenCalled();
            expect(mockWithOrgContext).not.toHaveBeenCalled();
        });

        it('tells an agent WHICH sign-in to offer', async () => {
            // `panel` is undefined here — the agent surface. Dropping needsAuth
            // leaves the tool with a failure it cannot act on, and the SC with a
            // dead end instead of a sign-in.
            const result = (await handleDeleteApiMesh(mockContext, {
                workspaceId: 'target-workspace-id',
            })) as { needsAuth?: string };

            expect(result.needsAuth).toBe('adobe');
        });
    });

    /**
     * Both reaches into the current project are optional at BOTH levels, and
     * every one of those `?.` is load-bearing: a TypeError here is caught by the
     * handler's own catch and returned as "delete failed", so the mesh survives
     * and the reason is a stack message about reading a property.
     */
    describe('an incomplete project does not break the targeting', () => {
        it('still deletes when there is no current project', async () => {
            (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(undefined);

            const result = await handleDeleteApiMesh(mockContext, {
                workspaceId: 'target-workspace-id',
            });

            expect(result).toEqual({ success: true });
            const target = mockWithOrgContext.mock.calls[0][0] as Record<string, string>;
            expect(target.workspaceId).toBe('target-workspace-id');
        });

        it('still deletes when the project carries no Adobe block', async () => {
            (mockContext.stateManager.getCurrentProject as jest.Mock).mockResolvedValue({});

            const result = await handleDeleteApiMesh(mockContext, {
                workspaceId: 'target-workspace-id',
            });

            expect(result).toEqual({ success: true });
            const target = mockWithOrgContext.mock.calls[0][0] as Record<string, string>;
            expect(target.workspaceId).toBe('target-workspace-id');
        });
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
