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
import { ErrorCode } from '@/types/errorCodes';
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
    // resolveApiOwners reads this per integration. A partial module mock left it
    // undefined and the handler failed inside its own try/catch, surfacing as a
    // missing `data` rather than as the real cause.
    getAppBuilderComponentEntry: jest.fn(() => undefined),
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
        logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(), trace: jest.fn() },
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
        // runGuards returns a TYPED refusal ({ error, code? }) so UI surfaces can offer
        // a sign-in action for AUTH_REQUIRED rather than a Retry that cannot help.
        (runGuards as jest.Mock).mockResolvedValueOnce({
            error: 'Adobe sign-in required.',
            code: ErrorCode.AUTH_REQUIRED,
        });
        const result = await handleListConsoleApis(makeContext(makeProject()), undefined);
        expect(result).toEqual({
            success: false,
            error: 'Adobe sign-in required.',
            code: ErrorCode.AUTH_REQUIRED,
        });
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

    // "Set extras to 1: commerceeventing" reads identically whether that API was
    // subscribed or merely requested — it printed the INPUT. The resolved set was
    // already available (subscribeRequiredApis' return) and simply never logged,
    // so the one question a user asks of this line ("did it actually apply?") was
    // the one it could not answer.
    it('logs the CONFIRMED set, not the requested one', async () => {
        const { subscribeRequiredApis } = jest.requireMock(
            '@/features/app-builder/services/apiSubscriber'
        );
        // The confirmed set is the full UNION (baseline + catalog required +
        // extras), so it contains a code the request never mentioned. Asserting on
        // THAT code is what proves the line reports the outcome rather than
        // echoing the input.
        subscribeRequiredApis.mockResolvedValue([
            { code: 'NewSDK', name: 'New Thing' },
            { code: 'BaselineSDK', name: 'Always On' },
        ]);
        const project = makeProject({});
        const context = makeContext(project);

        await handleSetConsoleApis(context, { apis: ['NewSDK'] });

        const logged = (context.logger.info as jest.Mock).mock.calls.flat().join(' ');
        expect(logged).toContain('BaselineSDK');
        expect(context.logger.warn).not.toHaveBeenCalled();
    });

    it('WARNS when a requested API is absent from what was actually subscribed', async () => {
        // The silent-skip path: a service matching neither platform reaches no
        // subscribe endpoint, so subscribeRequiredApis now omits it from its
        // result. Success alone must not imply every request landed.
        const { subscribeRequiredApis } = jest.requireMock(
            '@/features/app-builder/services/apiSubscriber'
        );
        subscribeRequiredApis.mockResolvedValue([{ code: 'KeptSDK', name: 'Kept' }]);
        const project = makeProject({});
        const context = makeContext(project);

        const result = await handleSetConsoleApis(context, { apis: ['KeptSDK', 'GhostSDK'] });

        expect(result.success).toBe(true);
        const warned = (context.logger.warn as jest.Mock).mock.calls.flat().join(' ');
        expect(warned).toContain('GhostSDK');
        expect(warned).not.toContain('KeptSDK');
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

/**
 * Step 04 — per-integration attribution on the dashboard surface.
 *
 * Before this, both handlers were project-scoped: list returned the whole union as
 * `added`, and set overwrote the union. That is what discarded attribution at the
 * write — the defect this plan exists to fix.
 *
 * The load-bearing case is the last one. Two integrations can hold the same code;
 * unchecking it on one must NOT unsubscribe it, because the other still needs it.
 * Getting this wrong unsubscribes a live API on a working workspace, which is the
 * one failure mode here that damages something real rather than just the UI.
 */
describe('per-integration attribution (step 04)', () => {
    beforeEach(() => jest.clearAllMocks());

    /** Two integrations, each holding one code, both also holding SharedSDK. */
    function twoIntegrationProject() {
        return makeProject({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed', name: 'ERP Sync', source: { owner: 'o', repo: 'r' } },
                'firefly-app': { kind: 'integration', status: 'deployed', name: 'Firefly App', source: { owner: 'o', repo: 'r' } },
            },
            componentApiPicks: {
                'erp-sync': ['FireflyAPISDK', 'GraphQLServiceSDK'],
                'firefly-app': ['GraphQLServiceSDK'],
            },
        });
    }

    describe('list', () => {
        it('returns only THIS integration\'s picks as `added`, not the union', async () => {
            const context = makeContext(twoIntegrationProject());

            const result = await handleListConsoleApis(context, { componentId: 'firefly-app' });

            const data = result.data as { added: string[] };
            // The union is [FireflyAPISDK, GraphQLServiceSDK]; firefly-app holds one.
            expect(data.added).toEqual(['GraphQLServiceSDK']);
        });

        it('attributes a code another integration holds, naming the holder', async () => {
            const context = makeContext(twoIntegrationProject());

            const result = await handleListConsoleApis(context, { componentId: 'firefly-app' });

            const data = result.data as {
                apis: Array<{ code: string; ownership?: string; requiredBy?: string[] }>;
            };
            const shared = data.apis.find((a) => a.code === 'FireflyAPISDK');
            // erp-sync holds it; from firefly-app's view it is someone else's, and the
            // row must say whose — an unexplained lock is what this replaced.
            expect(shared?.ownership).toBe('other-required');
            expect(shared?.requiredBy).toEqual(['ERP Sync']);
        });

        it('stays project-scoped when no componentId is given', async () => {
            // The MCP tools and any pre-step-04 caller pass no componentId. They must
            // keep seeing the union, not an empty list.
            const context = makeContext(twoIntegrationProject());

            const result = await handleListConsoleApis(context, undefined);

            const data = result.data as { added: string[] };
            expect(data.added.sort()).toEqual(['FireflyAPISDK', 'GraphQLServiceSDK']);
        });
    });

    describe('set', () => {
        it('writes only this integration\'s entry, leaving the others intact', async () => {
            const project = twoIntegrationProject();
            const context = makeContext(project);

            await handleSetConsoleApis(context, {
                componentId: 'firefly-app',
                apis: ['GraphQLServiceSDK', 'CommerceEventingSDK'],
            });

            const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0];
            expect(saved.componentApiPicks['firefly-app'].sort()).toEqual([
                'CommerceEventingSDK',
                'GraphQLServiceSDK',
            ]);
            // Untouched — this is the attribution that used to be discarded.
            expect(saved.componentApiPicks['erp-sync'].sort()).toEqual([
                'FireflyAPISDK',
                'GraphQLServiceSDK',
            ]);
        });

        it('SUBSCRIBES THE FULL UNION, so unchecking a shared code does not unsubscribe it', async () => {
            // THE safety property. firefly-app drops GraphQLServiceSDK, but erp-sync
            // still holds it, so the subscribe must still include it. If this regresses,
            // a working integration loses an API it needs.
            const project = twoIntegrationProject();
            const context = makeContext(project);

            await handleSetConsoleApis(context, { componentId: 'firefly-app', apis: [] });

            const desired = (subscribeRequiredApis as jest.Mock).mock.calls[0][4] as string[];
            expect(desired).toContain('GraphQLServiceSDK');
            expect(desired).toContain('FireflyAPISDK');

            const saved = (context.stateManager.saveProject as jest.Mock).mock.calls[0][0];
            // firefly-app's own claim is gone...
            expect(saved.componentApiPicks['firefly-app']).toBeUndefined();
            // ...and erp-sync's is not.
            expect(saved.componentApiPicks['erp-sync']).toContain('GraphQLServiceSDK');
        });
    });
});

