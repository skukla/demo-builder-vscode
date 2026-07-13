/**
 * consoleApiHandlers — the runtime API-access surface behind the
 * list_console_apis / add_console_apis MCP tools.
 *
 * Pins the load-bearing contracts: guard chain runs before any Console touch,
 * inputs are validated, the subscribe reconciles the FULL union (persisted
 * extras + new codes), and persistence happens only AFTER a successful
 * subscribe (a failed code must not poison later reconciles).
 */

import {
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
} from '@/features/dashboard/handlers/consoleApiHandlers';
import { runGuards } from '@/features/dashboard/handlers/appBuilderComponentHandlers';
import { subscribeRequiredApis } from '@/features/app-builder/services/apiSubscriber';
import { createApiSubscriberClient } from '@/features/app-builder/services/apiSubscriberClientAdapter';
import { withOrgContext } from '@/core/shell';
import type { HandlerContext } from '@/types/handlers';

jest.mock('vscode');
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    runGuards: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/features/app-builder/services/apiSubscriber', () => ({
    computeRequiredApis: jest.requireActual('@/features/app-builder/services/apiSubscriber')
        .computeRequiredApis,
    subscribeRequiredApis: jest.fn().mockResolvedValue([
        { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
        { code: 'FireflyAPISDK', name: 'Firefly Services' },
    ]),
}));
jest.mock('@/features/app-builder/services/apiSubscriberClientAdapter', () => ({
    createApiSubscriberClient: jest.fn(() => ({
        getServicesForOrg: jest.fn().mockResolvedValue([
            { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
            { code: 'FireflyAPISDK', name: 'Firefly Services' },
            { code: 'GraphQLServiceSDK', name: 'API Mesh' },
        ]),
    })),
}));
jest.mock('@/features/app-builder/services/appBuilderComponentRunnerDeps', () => ({
    subscriberTarget: jest.fn(() => ({ orgId: 'org-1', projectId: 'p-1', workspaceId: 'w-1' })),
}));
jest.mock('@/features/app-builder/services/allowedDomain', () => ({
    deriveAllowedDomain: jest.fn(() => 'localhost:3000'),
}));
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => ({
    getAvailableAppBuilderComponents: jest.fn(() => []),
}));
jest.mock('@/core/shell', () => ({
    buildOrgTargetFromProjectAdobe: jest.fn(() => ({ orgId: 'org-1' })),
    withOrgContext: jest.fn((_t: unknown, fn: () => Promise<unknown>) => fn()),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            getCachedOrganization: jest.fn().mockReturnValue(undefined),
        })),
    },
}));

function makeProject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        name: 'demo',
        path: '/projects/demo',
        adobe: { organization: 'org-1', projectId: 'p-1', workspace: 'w-1' },
        ...overrides,
    };
}

function makeContext(project: Record<string, unknown> | null): HandlerContext {
    return {
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        },
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
}

describe('handleListConsoleApis', () => {
    beforeEach(() => jest.clearAllMocks());

    it('flags only ALWAYS-ON as managed; returns optional extras as `added`', async () => {
        const context = makeContext(makeProject({ additionalConsoleApis: ['FireflyAPISDK'] }));

        const result = await handleListConsoleApis(context, undefined);

        expect(result.success).toBe(true);
        const data = result.data as {
            apis: Array<{ code: string; managed: boolean }>;
            added: string[];
        };
        // Baseline is always-on (managed, locked). The extra is NOT managed —
        // it's `added` (checked + removable), so the user can uncheck it.
        expect(data.apis.find((a) => a.code === 'AdobeIOManagementAPISDK')?.managed).toBe(true);
        expect(data.apis.find((a) => a.code === 'FireflyAPISDK')?.managed).toBe(false);
        expect(data.apis.find((a) => a.code === 'GraphQLServiceSDK')?.managed).toBe(false);
        expect(data.added).toEqual(['FireflyAPISDK']);
    });

    it('fails without a project', async () => {
        const result = await handleListConsoleApis(makeContext(null), undefined);
        expect(result.success).toBe(false);
    });

    it('fails when the project has no Adobe org context', async () => {
        const result = await handleListConsoleApis(
            makeContext(makeProject({ adobe: undefined })),
            undefined
        );
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/org context/);
    });

    it('aborts on a guard failure without touching the Console', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce('Adobe sign-in required.');
        const result = await handleListConsoleApis(makeContext(makeProject()), undefined);
        expect(result).toEqual({ success: false, error: 'Adobe sign-in required.' });
    });

    it('cleans the catalog the same way as the wizard (drops noise, carries product family)', async () => {
        const EC = { code: 'marketing_cloud', name: 'Experience Cloud' };
        (createApiSubscriberClient as jest.Mock).mockReturnValueOnce({
            getServicesForOrg: jest.fn().mockResolvedValue([
                { code: 'FireflyAPISDK', name: 'Firefly', enabled: true, cloudGrouping: EC },
                { code: 'OldThing', name: 'Old', enabled: false, disabledReasons: ['DEPRECATED'] },
            ]),
        });

        const result = await handleListConsoleApis(makeContext(makeProject()), undefined);

        const apis = (result.data as { apis: Array<{ code: string; group?: unknown }> }).apis;
        expect(apis.map((a) => a.code)).toEqual(['FireflyAPISDK']); // DEPRECATED dropped
        expect(apis[0].group).toEqual(EC);
    });
});

describe('handleAddConsoleApis', () => {
    beforeEach(() => jest.clearAllMocks());

    it('rejects a missing/empty/non-string apis payload', async () => {
        const context = makeContext(makeProject());
        for (const payload of [undefined, {}, { apis: [] }, { apis: [42] }]) {
            const result = await handleAddConsoleApis(context, payload as never);
            expect(result.success).toBe(false);
        }
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });

    it('rejects sdk codes with unexpected characters', async () => {
        const result = await handleAddConsoleApis(makeContext(makeProject()), {
            apis: ['Firefly;rm -rf'],
        });
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Invalid sdk code/);
    });

    it('subscribes the merged union under org context and persists AFTER success', async () => {
        const project = makeProject({ additionalConsoleApis: ['ExistingSDK'] });
        const context = makeContext(project);

        const result = await handleAddConsoleApis(context, { apis: ['FireflyAPISDK'] });

        expect(result.success).toBe(true);
        expect(withOrgContext).toHaveBeenCalled();
        // Full union: persisted extra + new code, threaded as extraApis.
        expect(subscribeRequiredApis).toHaveBeenCalledWith(
            [],
            { orgId: 'org-1', projectId: 'p-1', workspaceId: 'w-1' },
            expect.anything(),
            'localhost:3000',
            ['ExistingSDK', 'FireflyAPISDK']
        );
        expect(project.additionalConsoleApis).toEqual(['ExistingSDK', 'FireflyAPISDK']);
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('does NOT persist when the subscribe fails (no poisoned reconciles)', async () => {
        (subscribeRequiredApis as jest.Mock).mockRejectedValueOnce(
            new Error('Unknown Adobe API "NopeSDK" — not entitled for this org.')
        );
        const project = makeProject();
        const context = makeContext(project);

        const result = await handleAddConsoleApis(context, { apis: ['NopeSDK'] });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/not entitled/);
        expect(result.error).toMatch(/Developer Console/);
        expect(project.additionalConsoleApis).toBeUndefined();
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('aborts on a guard failure before subscribing', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce(
            'Developer or System Admin role required for App Builder.'
        );

        const result = await handleAddConsoleApis(makeContext(makeProject()), {
            apis: ['FireflyAPISDK'],
        });

        expect(result.success).toBe(false);
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });
});

describe('handleSetConsoleApis', () => {
    beforeEach(() => jest.clearAllMocks());

    it('sets the extras to EXACTLY the given list (add + remove) and persists', async () => {
        // Starts with two extras; setting to one REMOVES the other.
        const project = makeProject({ additionalConsoleApis: ['KeepSDK', 'DropSDK'] });
        const context = makeContext(project);

        const result = await handleSetConsoleApis(context, { apis: ['KeepSDK', 'NewSDK'] });

        expect(result.success).toBe(true);
        // Reconcile PUT is the exact desired extras — DropSDK is gone (unsubscribed).
        expect(subscribeRequiredApis).toHaveBeenCalledWith(
            [],
            { orgId: 'org-1', projectId: 'p-1', workspaceId: 'w-1' },
            expect.anything(),
            'localhost:3000',
            ['KeepSDK', 'NewSDK']
        );
        expect(project.additionalConsoleApis).toEqual(['KeepSDK', 'NewSDK']);
        expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
    });

    it('accepts an EMPTY list (remove all extras)', async () => {
        const project = makeProject({ additionalConsoleApis: ['DropSDK'] });
        const context = makeContext(project);

        const result = await handleSetConsoleApis(context, { apis: [] });

        expect(result.success).toBe(true);
        expect(subscribeRequiredApis).toHaveBeenCalledWith(
            [],
            expect.anything(),
            expect.anything(),
            'localhost:3000',
            []
        );
        expect(project.additionalConsoleApis).toEqual([]);
    });

    it('rejects a non-array / invalid-code payload', async () => {
        const context = makeContext(makeProject());
        for (const payload of [undefined, { apis: 'x' }, { apis: [42] }, { apis: ['Bad;rm'] }]) {
            const result = await handleSetConsoleApis(context, payload as never);
            expect(result.success).toBe(false);
        }
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });

    it('does NOT persist when the subscribe fails', async () => {
        (subscribeRequiredApis as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        const project = makeProject({ additionalConsoleApis: ['OldSDK'] });
        const context = makeContext(project);

        const result = await handleSetConsoleApis(context, { apis: ['NewSDK'] });

        expect(result.success).toBe(false);
        expect(project.additionalConsoleApis).toEqual(['OldSDK']); // unchanged
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('aborts on a guard failure before subscribing', async () => {
        (runGuards as jest.Mock).mockResolvedValueOnce('role required');
        const result = await handleSetConsoleApis(makeContext(makeProject()), { apis: ['X'] });
        expect(result.success).toBe(false);
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });
});
