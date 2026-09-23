/**
 * runtimePackageHandlers — the read behind the list_runtime_packages agent tool.
 *
 * Pins: the guard chain runs before any Adobe touch, the read is targeted at the
 * project's org and workspace, the answer names the namespace and its packages,
 * and a namespace that cannot be listed is a refusal — never an empty list.
 */

const mockListRuntimePackages = jest.fn();
const mockRuntimeNamespaceEnv = jest.fn();
jest.mock('@/features/app-builder/services/runtimeNamespace', () => ({
    listRuntimePackages: (...args: unknown[]) => mockListRuntimePackages(...args),
    runtimeNamespaceEnv: (...args: unknown[]) => mockRuntimeNamespaceEnv(...args),
}));
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/core/shell/orgContextEnv', () => ({
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org-1', workspaceId: 'ws-stage' })),
    withOrgContext: jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn()),
}));
const mockCommandExecutor = { execute: jest.fn() };
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => mockCommandExecutor) },
}));

import { handleListRuntimePackages } from '@/features/dashboard/handlers/runtimePackageHandlers';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import { withOrgContext } from '@/core/shell/orgContextEnv';
import { ErrorCode } from '@/types/errorCodes';
import type { Project } from '@/types/base';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const ENV = { AIO_RUNTIME_NAMESPACE: 'ns-stage', AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret' };

function contextWith(project: Project | undefined) {
    const stateManager = createMockStateManager();
    stateManager.getCurrentProject.mockResolvedValue(project);
    return createMockHandlerContext({ stateManager });
}

/** The canonical fake, which carries an Adobe org, project and workspace. */
function adobeProject(): Project {
    return createMockProject();
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRuntimeNamespaceEnv.mockResolvedValue(ENV);
    mockListRuntimePackages.mockResolvedValue(['erp', 'demo-erp']);
});

describe('handleListRuntimePackages', () => {
    it('answers the namespace and its packages, read under the project org context', async () => {
        const context = contextWith(adobeProject());

        const result = await handleListRuntimePackages(context);

        expect(result).toEqual({
            success: true,
            data: { namespace: 'ns-stage', packages: ['erp', 'demo-erp'] },
        });
        expect(withOrgContext).toHaveBeenCalledWith(
            { orgId: 'org-1', workspaceId: 'ws-stage' },
            expect.any(Function)
        );
        // The list reuses the key fetched for the answer's namespace, not a second fetch.
        expect(mockListRuntimePackages).toHaveBeenCalledWith(
            { commandManager: mockCommandExecutor, logger: context.logger },
            ENV
        );
    });

    it('never returns the namespace key', async () => {
        const result = await handleListRuntimePackages(contextWith(adobeProject()));

        expect(JSON.stringify(result)).not.toContain(ENV.AIO_RUNTIME_AUTH);
    });

    it('refuses in plain words when the namespace cannot be listed — never with an empty list', async () => {
        mockListRuntimePackages.mockRejectedValue(
            new Error('aio runtime package list --json: An AUTH key must be specified')
        );

        const result = await handleListRuntimePackages(contextWith(adobeProject()));

        expect(result).toEqual({
            success: false,
            error:
                "Could not list what is deployed in this project's Adobe Runtime namespace. " +
                'See Debug Logs for the reason.',
        });
    });

    it('runs the guard chain first, and touches nothing when it refuses', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce({
            error: 'Sign in to Adobe',
            code: ErrorCode.AUTH_REQUIRED,
        });

        const result = await handleListRuntimePackages(contextWith(adobeProject()));

        expect(result).toEqual({
            success: false,
            error: 'Sign in to Adobe',
            code: ErrorCode.AUTH_REQUIRED,
        });
        expect(mockRuntimeNamespaceEnv).not.toHaveBeenCalled();
    });

    it('refuses without a project', async () => {
        const result = await handleListRuntimePackages(contextWith(undefined));

        expect(result).toMatchObject({ success: false, code: ErrorCode.PROJECT_NOT_FOUND });
    });

    it('refuses a project with no Adobe org', async () => {
        const result = await handleListRuntimePackages(
            contextWith(createMockProject({ adobe: undefined }))
        );

        expect(result).toMatchObject({
            success: false,
            error: expect.stringMatching(/no Adobe org/),
        });
        expect(mockRuntimeNamespaceEnv).not.toHaveBeenCalled();
    });
});
