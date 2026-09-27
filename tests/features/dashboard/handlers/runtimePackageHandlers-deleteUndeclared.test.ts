/**
 * runtimePackageHandlers — the delete behind the delete_undeclared_runtime_code tool.
 *
 * Pins: an unknown integration and a failed guard are refusals before any Adobe touch; the
 * delete runs in the integration's own workspace; it is handed the folder of every app
 * deploying into that workspace (a pair shares one) and no other; a namespace that could
 * not be read is a refusal, never a quiet success.
 */

const mockDeleteUndeclaredActions = jest.fn();
jest.mock('@/features/app-builder/services/runtimeUndeclaredActions', () => ({
    deleteUndeclaredActions: (...args: unknown[]) => mockDeleteUndeclaredActions(...args),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/core/shell/orgContextEnv', () => ({
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-stage' })),
    withOrgContext: jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn()),
}));
const mockCommandExecutor = { execute: jest.fn() };
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => mockCommandExecutor) },
}));

import { withOrgContext } from '@/core/shell/orgContextEnv';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import { handleDeleteUndeclaredRuntimeCode } from '@/features/dashboard/handlers/runtimePackageHandlers';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const OWN = { id: 'ws-northwind', name: 'NorthwindERP', title: 'Northwind ERP' };
const SOURCE = { owner: 'acme', repo: 'app', branch: 'main' };

function contextWith(project: Project | undefined) {
    const stateManager = createMockStateManager();
    stateManager.getCurrentProject.mockResolvedValue(project);
    return createMockHandlerContext({ stateManager });
}

/** A pair in its own workspace, and a mesh and another integration in the project's. */
function projectWithPair(): Project {
    return createMockProject({
        appBuilderComponents: {
            'erp-integration': { kind: 'integration', status: 'deployed', workspace: OWN, source: SOURCE },
            'demo-erp': { kind: 'system', status: 'deployed', workspace: OWN, source: SOURCE },
            'other-app': { kind: 'integration', status: 'deployed', source: SOURCE },
            'eds-accs-mesh': { kind: 'mesh', status: 'deployed', source: SOURCE },
        },
        componentInstances: {
            'erp-integration': { id: 'erp-integration', name: 'ERP integration', status: 'deployed', path: '/c/erp-integration' },
            'demo-erp': { id: 'demo-erp', name: 'Northwind ERP', status: 'deployed', path: '/c/demo-erp' },
            'other-app': { id: 'other-app', name: 'Other', status: 'deployed', path: '/c/other-app' },
            'eds-accs-mesh': { id: 'eds-accs-mesh', name: 'Mesh', status: 'deployed', path: '/c/mesh' },
        },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteUndeclaredActions.mockResolvedValue({ namespace: 'ns-northwind', deleted: ['erp/old'], failed: [] });
});

describe('handleDeleteUndeclaredRuntimeCode', () => {
    it("deletes in the integration's own workspace, reading both apps of the pair and no other", async () => {
        const context = contextWith(projectWithPair());

        const result = await handleDeleteUndeclaredRuntimeCode(context, { componentId: 'erp-integration' });

        expect(result).toEqual({
            success: true,
            data: { namespace: 'ns-northwind', deleted: ['erp/old'], failed: [] },
        });
        expect(withOrgContext).toHaveBeenCalledWith(
            { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-northwind' },
            expect.any(Function),
        );
        expect(mockDeleteUndeclaredActions).toHaveBeenCalledWith(
            { commandManager: mockCommandExecutor, logger: context.logger },
            ['/c/erp-integration', '/c/demo-erp'],
        );
    });

    it("reads the project's workspace apps, never the mesh, for an integration without its own", async () => {
        await handleDeleteUndeclaredRuntimeCode(contextWith(projectWithPair()), { componentId: 'other-app' });

        expect(mockDeleteUndeclaredActions).toHaveBeenCalledWith(expect.anything(), ['/c/other-app']);
    });

    it('refuses an integration the project does not have, before touching Adobe', async () => {
        const result = await handleDeleteUndeclaredRuntimeCode(contextWith(projectWithPair()), { componentId: 'nope' });

        expect(result).toMatchObject({ success: false, code: ErrorCode.COMPONENT_NOT_FOUND });
        expect(mockDeleteUndeclaredActions).not.toHaveBeenCalled();
    });

    it('stops at a failed guard (signed out, wrong org)', async () => {
        jest.mocked(runGuards).mockResolvedValueOnce({ error: 'Sign in to Adobe.', code: ErrorCode.AUTH_REQUIRED });

        const result = await handleDeleteUndeclaredRuntimeCode(contextWith(projectWithPair()), {
            componentId: 'erp-integration',
        });

        expect(result).toEqual({ success: false, error: 'Sign in to Adobe.', code: ErrorCode.AUTH_REQUIRED });
        expect(mockDeleteUndeclaredActions).not.toHaveBeenCalled();
    });

    it('refuses when the namespace could not be read, rather than answering nothing deleted', async () => {
        mockDeleteUndeclaredActions.mockResolvedValue({
            deleted: [],
            failed: [],
            note: 'Could not check the namespace for code left behind.',
        });

        const result = await handleDeleteUndeclaredRuntimeCode(contextWith(projectWithPair()), {
            componentId: 'erp-integration',
        });

        expect(result).toEqual({ success: false, error: 'Could not check the namespace for code left behind.' });
    });
});
