/**
 * runtimeActivationHandlers — the reads behind list_runtime_activations and
 * read_runtime_activation. Same pins as the package list: the guard chain runs
 * before any Adobe touch, the read is targeted at the project's org and the right
 * workspace, the key is never returned, and a namespace that cannot be read is a
 * refusal, never an empty list.
 */

const mockListRuntimeActivations = jest.fn();
const mockReadRuntimeActivation = jest.fn();
const mockInvokeRuntimeAction = jest.fn();
const mockRuntimeNamespaceEnv = jest.fn();
jest.mock('@/features/app-builder/services/runtimeActivations', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeActivations'),
    listRuntimeActivations: (...args: unknown[]) => mockListRuntimeActivations(...args),
    invokeRuntimeAction: (...args: unknown[]) => mockInvokeRuntimeAction(...args),
    invokeWebAction: (...args: unknown[]) => mockInvokeWebAction(...args),
    readRuntimeActivation: (...args: unknown[]) => mockReadRuntimeActivation(...args),
}));
jest.mock('@/features/app-builder/services/runtimeNamespace', () => ({
    ...jest.requireActual('@/features/app-builder/services/runtimeNamespace'),
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
const mockResolveAppManagementAuth = jest.fn();
jest.mock('@/features/project-creation/services/appBuilderComponentRunnerDeps', () => ({
    resolveAppManagementAuth: (...args: unknown[]) => mockResolveAppManagementAuth(...args),
}));
const mockInvokeWebAction = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => mockCommandExecutor), getAuthenticationService: jest.fn(() => ({ fake: 'auth service' })) },
}));

import { withOrgContext } from '@/core/shell/orgContextEnv';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import {
    handleInvokeRuntimeAction,
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
        action: 'erp/refresh-job',
        status: 'application error',
        success: false,
        durationMs: 20206,
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
            { limit: 10, action: 'erp/refresh-job', skip: undefined, since: undefined, failedOnly: false, includeTriggers: false },
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

    it('passes skip, since, failedOnly and includeTriggers through, and refuses a since that is not a time', async () => {
        const context = contextWith(createMockProject());

        await handleListRuntimeActivations(context, { skip: 50, since: '2026-09-25T13:00:00Z', failedOnly: true, includeTriggers: true });
        expect(mockListRuntimeActivations.mock.calls[0][2]).toEqual({
            limit: undefined,
            action: undefined,
            skip: 50,
            since: '2026-09-25T13:00:00Z',
            failedOnly: true,
            includeTriggers: true,
        });

        expect(await handleListRuntimeActivations(context, { since: 'yesterday' })).toMatchObject({
            success: false,
            code: ErrorCode.CONFIG_INVALID,
        });
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
                action: 'erp/refresh-job',
                status: 'application error',
                success: false,
                durationMs: 20206,
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


describe('handleInvokeRuntimeAction', () => {
    const INVOKED = {
        activationId: ROW.activationId,
        status: 'success',
        success: true,
        durationMs: 2597,
        result: { body: [{ op: 'replace', path: 'result/price_updates', value: [{ base_price: 40, item_id: 34 }] }] },
        logs: ['13:52:19.100 info: item-prices: partner C21, 1 line(s) priced'],
    };

    beforeEach(() => {
        mockInvokeRuntimeAction.mockResolvedValue(INVOKED);
    });

    it("runs the action with the payload in the integration's workspace and answers the record with the namespace", async () => {
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
        const context = contextWith(project);
        const payload = { quote: { customer_group_id: 18 }, shippingAssignment: { items: [] } };

        const result = await handleInvokeRuntimeAction(context, { componentId: 'erp-integration', action: 'webhook/item-prices', payload });

        expect(result).toEqual({ success: true, data: { namespace: 'ns-stage', mode: 'cli', ...INVOKED } });
        expect(withOrgContext).toHaveBeenCalledWith(
            { orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-erp' },
            expect.any(Function),
        );
        expect(mockInvokeRuntimeAction).toHaveBeenCalledWith(
            { commandManager: mockCommandExecutor, logger: context.logger },
            ENV,
            'webhook/item-prices',
            payload,
        );
        expect(JSON.stringify(result)).not.toContain(ENV.AIO_RUNTIME_AUTH);
    });

    it("calls a WEB action through its deployed URL with the user's auth, then reads the run the extra-logging header recorded", async () => {
        const project = createMockProject({
            appBuilderComponents: {
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                    workspace: { id: 'ws-erp', name: 'AcmeERP' },
                    deployedUrls: { 'runtime/webhook/item-prices': 'https://ns.adobeioruntime.net/api/v1/web/webhook/item-prices' },
                },
            },
        });
        const auth = { accessToken: 'fake-test-token-not-a-secret', imsOrgId: 'ORG@AdobeOrg' };
        mockResolveAppManagementAuth.mockResolvedValue(auth);
        mockInvokeWebAction.mockResolvedValue({ httpStatus: 200, ok: true, result: [{ op: 'replace' }] });
        mockListRuntimeActivations.mockResolvedValue([{ ...ROW, action: 'webhook/item-prices', durationMs: 2597 }]);
        const payload = { quote: { customer_group_id: 18 } };

        const result = await handleInvokeRuntimeAction(contextWith(project), { componentId: 'erp-integration', action: 'webhook/item-prices', payload });

        expect(mockInvokeWebAction).toHaveBeenCalledWith(
            'https://ns.adobeioruntime.net/api/v1/web/webhook/item-prices',
            auth,
            payload,
            expect.any(Function),
        );
        expect(mockInvokeRuntimeAction).not.toHaveBeenCalled();
        expect(mockListRuntimeActivations.mock.calls[0][2]).toEqual({ action: 'webhook/item-prices', limit: 1, since: expect.any(String) });
        expect(mockReadRuntimeActivation).toHaveBeenCalledWith(expect.anything(), ENV, ROW.activationId);
        expect(result).toEqual({
            success: true,
            data: {
                namespace: 'ns-stage',
                mode: 'web',
                httpStatus: 200,
                success: true,
                result: [{ op: 'replace' }],
                activationId: ROW.activationId,
                durationMs: 2597,
                logs: ['error: partner refresh failed: Request timed out'],
            },
        });
        expect(JSON.stringify(result)).not.toContain(auth.accessToken);
    });

    it('a web action with no Adobe sign-in is a refusal naming the sign-in', async () => {
        const project = createMockProject({
            appBuilderComponents: {
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                    deployedUrls: { 'runtime/webhook/discounts': 'https://ns.adobeioruntime.net/api/v1/web/webhook/discounts' },
                },
            },
        });
        mockResolveAppManagementAuth.mockResolvedValue(undefined);
        expect(await handleInvokeRuntimeAction(contextWith(project), { componentId: 'erp-integration', action: 'webhook/discounts' })).toMatchObject({
            success: false,
            code: ErrorCode.AUTH_REQUIRED,
        });
        expect(mockInvokeWebAction).not.toHaveBeenCalled();
    });

    it('runs with an empty payload when none is given, and says so when a successful direct run kept no lines', async () => {
        mockInvokeRuntimeAction.mockResolvedValue({ ...INVOKED, logs: [] });
        const result = await handleInvokeRuntimeAction(contextWith(createMockProject()), { action: 'erp/refresh-job' });
        expect(mockInvokeRuntimeAction.mock.calls[0].slice(2)).toEqual(['erp/refresh-job', {}]);
        expect(result).toMatchObject({ success: true, data: { mode: 'cli', note: expect.stringContaining('keeps no log lines') } });

        mockInvokeRuntimeAction.mockResolvedValue({ ...INVOKED, success: false, logs: [] });
        const failed = await handleInvokeRuntimeAction(contextWith(createMockProject()), { action: 'erp/refresh-job' });
        expect((failed as { data: Record<string, unknown> }).data.note).toBeUndefined();
    });

    it('refuses a missing or malformed action and a payload that is not an object, before any call', async () => {
        const context = contextWith(createMockProject());
        for (const payload of [
            {},
            { action: '' },
            { action: 'webhook/item-prices; rm -rf /' },
            { action: 'webhook/item-prices', payload: [1, 2] as unknown as Record<string, unknown> },
            { action: 'webhook/item-prices', payload: 'text' as unknown as Record<string, unknown> },
        ]) {
            expect(await handleInvokeRuntimeAction(context, payload)).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
        }
        expect(mockRuntimeNamespaceEnv).not.toHaveBeenCalled();
        expect(mockInvokeRuntimeAction).not.toHaveBeenCalled();
    });

    it('runs the guard chain first, and a namespace that cannot be reached is a refusal in plain words', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce({ error: 'Sign in to Adobe', code: ErrorCode.AUTH_REQUIRED });
        expect(await handleInvokeRuntimeAction(contextWith(createMockProject()), { action: 'erp/refresh-job' })).toEqual({
            success: false,
            error: 'Sign in to Adobe',
            code: ErrorCode.AUTH_REQUIRED,
        });

        mockInvokeRuntimeAction.mockRejectedValue(new Error('An AUTH key must be specified'));
        expect(await handleInvokeRuntimeAction(contextWith(createMockProject()), { action: 'erp/refresh-job' })).toEqual({
            success: false,
            error: "Could not read this project's Adobe Runtime namespace. See Debug Logs for the reason.",
        });
    });
});
