/**
 * runtimeActivationHandlers — the reads behind list_runtime_activations and
 * read_runtime_activation. Same pins as the package list: the guard chain runs
 * before any Adobe touch, the read is targeted at the project's org and the right
 * workspace, the key is never returned, and a namespace that cannot be read is a
 * refusal, never an empty list.
 */

const mockListRuntimeActivations = jest.fn();
const mockReadRuntimeActivation = jest.fn();
const mockRuntimeNamespaceEnv = jest.fn();
jest.mock('@/features/app-builder/services/runtimeNamespace', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeNamespace'),
    listRuntimeActivations: (...args: unknown[]) => mockListRuntimeActivations(...args),
    readRuntimeActivation: (...args: unknown[]) => mockReadRuntimeActivation(...args),
    runtimeNamespaceEnv: (...args: unknown[]) => mockRuntimeNamespaceEnv(...args),
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
import {
    handleListRuntimeActivations,
    handleReadRuntimeActivation,
} from '@/features/dashboard/handlers/runtimeActivationHandlers';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const ENV = { AIO_RUNTIME_NAMESPACE: 'ns-stage', AIO_RUNTIME_AUTH: 'fake-test-auth-not-a-secret' };
const ROW = {
    activationId: 'dc498aa00ee84bee898aa00ee8cbee75',
    action: 'erp/refresh-job',
    startedAt: '2026-09-24T21:43:03.000Z',
    durationMs: 20206,
    statusCode: 0,
    kind: 'nodejs:24',
};

function contextWith(project: Project | undefined) {
    const stateManager = createMockStateManager();
    stateManager.getCurrentProject.mockResolvedValue(project);
    return createMockHandlerContext({ stateManager });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRuntimeNamespaceEnv.mockResolvedValue(ENV);
    mockListRuntimeActivations.mockResolvedValue([ROW]);
    mockReadRuntimeActivation.mockResolvedValue({
        activationId: ROW.activationId,
        logs: ['error: partner refresh failed: Request timed out'],
        result: { body: { delivered: 0 } },
    });
});

describe('handleListRuntimeActivations', () => {
    it('answers the namespace and its activations, read under the project org context, with the options passed through', async () => {
        const context = contextWith(createMockProject());

        const result = await handleListRuntimeActivations(context, { limit: 10, action: 'erp/refresh-job' });

        expect(result).toEqual({ success: true, data: { namespace: 'ns-stage', activations: [ROW] } });
        expect(withOrgContext).toHaveBeenCalledWith(
            { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-stage' },
            expect.any(Function),
        );
        expect(mockListRuntimeActivations).toHaveBeenCalledWith(
            { commandManager: mockCommandExecutor, logger: context.logger },
            ENV,
            { limit: 10, action: 'erp/refresh-job' },
        );
        expect(JSON.stringify(result)).not.toContain(ENV.AIO_RUNTIME_AUTH);
    });

    it("reads an integration's own workspace when given its id", async () => {
        const project = createMockProject({
            appBuilderComponents: {
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                    workspace: { id: 'ws-erp', name: 'AcmeERP' },
                },
            },
        });

        await handleListRuntimeActivations(contextWith(project), { componentId: 'erp-integration' });

        expect(withOrgContext).toHaveBeenCalledWith(
            { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-erp' },
            expect.any(Function),
        );
    });

    it('refuses a malformed action filter and an unknown integration before any Adobe touch', async () => {
        const context = contextWith(createMockProject());

        expect(await handleListRuntimeActivations(context, { action: 'erp/refresh;rm -rf' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(await handleListRuntimeActivations(context, { componentId: 'nope' })).toMatchObject({
            success: false,
            code: ErrorCode.COMPONENT_NOT_FOUND,
        });
        expect(mockRuntimeNamespaceEnv).not.toHaveBeenCalled();
    });

    it('runs the guard chain first, and a refusal touches nothing', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce({ error: 'Sign in to Adobe', code: ErrorCode.AUTH_REQUIRED });

        const result = await handleListRuntimeActivations(contextWith(createMockProject()));

        expect(result).toEqual({ success: false, error: 'Sign in to Adobe', code: ErrorCode.AUTH_REQUIRED });
        expect(mockRuntimeNamespaceEnv).not.toHaveBeenCalled();
    });

    it('a namespace that cannot be read is a refusal in plain words, never an empty list', async () => {
        mockListRuntimeActivations.mockRejectedValue(new Error('An AUTH key must be specified'));

        const result = await handleListRuntimeActivations(contextWith(createMockProject()));

        expect(result).toEqual({
            success: false,
            error: "Could not read this project's Adobe Runtime namespace. See Debug Logs for the reason.",
        });
    });
});

describe('handleReadRuntimeActivation', () => {
    it("answers one activation's log lines and result, by id", async () => {
        const context = contextWith(createMockProject());

        const result = await handleReadRuntimeActivation(context, { activationId: ROW.activationId });

        expect(result).toEqual({
            success: true,
            data: {
                namespace: 'ns-stage',
                activationId: ROW.activationId,
                logs: ['error: partner refresh failed: Request timed out'],
                result: { body: { delivered: 0 } },
            },
        });
        expect(mockReadRuntimeActivation).toHaveBeenCalledWith(
            { commandManager: mockCommandExecutor, logger: context.logger },
            ENV,
            ROW.activationId,
        );
    });

    it('refuses anything but a 32-character hex id before any call', async () => {
        const context = contextWith(createMockProject());
        for (const activationId of [undefined, '', 'abc', 'dc498aa00ee84bee898aa00ee8cbee7Z']) {
            expect(await handleReadRuntimeActivation(context, { activationId })).toMatchObject({
                success: false,
                code: ErrorCode.CONFIG_INVALID,
            });
        }
        expect(mockRuntimeNamespaceEnv).not.toHaveBeenCalled();
    });
});
