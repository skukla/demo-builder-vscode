/**
 * What the import spine does once a shared credential can exist.
 *
 * `provisionAccsHandler.test.ts` pins that the "Set up credentials automatically"
 * offer appears only where Console provisioning could run. That is still true and
 * unchanged. What it does NOT pin is the broker, and since the broker landed those
 * tests have been exercising it BY ACCIDENT: the shared vscode mock answers the
 * settings read with a non-array, selection throws, `resolveAccs` catches it, and
 * the result happens to be the refusal the test expected. Right answer, no
 * assertion — and it would keep passing if the broker were deleted.
 *
 * So this file drives the three broker outcomes deliberately, and pins the one
 * claim step 03 rests on: **a project the broker can serve never reaches the
 * refusal at all**, so the button stops being offered to exactly the population it
 * could never help.
 */

import * as vscode from 'vscode';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { clearSharedCredentialCache } from '@/features/data-installer/services/commerceCredentialBroker';
import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService } from '../../../helpers/authenticationServiceFake';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })) },
}));

const DISCOVERY_URL =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/discover-stores';
const SHARED_SECRET = 'fake-shared-secret-not-a-secret';

const FULL_BINDING = {
    organization: '285361',
    projectId: 'proj-1',
    projectName: 'p',
    workspace: 'ws-1',
    authenticated: true,
};

/**
 * ACCS, no OAuth pair of its own — the state the broker exists to fill.
 *
 * NO DEFAULT PARAMETER on `adobe`, and two named wrappers instead. Written as
 * `adobe = FULL_BINDING`, calling it with an explicit `undefined` re-triggers the
 * default and silently hands back a fully bound project — so every "no binding"
 * test here ran WITH a binding and proved nothing. Caught only because one of
 * them then asserted the opposite of what it got.
 */
function accsProject(adobe?: Partial<Project['adobe']>): Partial<Project> {
    return {
        name: 'demo-accs',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql',
            },
        },
        ...(adobe ? { adobe: adobe as Project['adobe'] } : {}),
    };
}

/** No Adobe I/O project at all — the population the broker exists for. */
const unboundProject = (): Partial<Project> => accsProject();

/** A full binding, so Console provisioning is a real option. */
const boundProject = (): Partial<Project> => accsProject(FULL_BINDING);

function makeImportHarness(project: unknown): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: createMockAuthenticationService({
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
            }),
        }),
        panel: {} as vscode.WebviewPanel,
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn(),
        }),
        sendMessage: jest.fn(),
    });
}

/**
 * Seed both settings this path reads: the Data Installer base URL (so the guard
 * ahead of credentials passes) and the discovery services list (which decides
 * whether a broker exists at all).
 */
function seedSettings(services: unknown[]): void {
    (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section?: string) => ({
        get: jest.fn((key: string, fallback?: unknown) => {
            if (section === 'demoBuilder.accsDiscovery') return services;
            if (key === 'apiBaseUrl') {
                return 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api';
            }
            if (key === 'enabled') return true;
            return fallback ?? true;
        }),
    }));
}

const validate = (project: unknown) =>
    importHandlers['validate-datapack-import'](makeImportHarness(project), {
        datapackName: 'bodea',
        version: 'main',
        commerceInstance: 'inst',
        dataTypes: ['categories'],
    });

const originalFetch = global.fetch;

afterEach(() => {
    global.fetch = originalFetch;
});

describe('a project the broker can serve', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // The broker caches per service URL and the cache is module-level, so
        // without this a test that fetches successfully hands the next one a
        // cached pair and its fetch mock is never called.
        clearSharedCredentialCache();
        seedSettings([{ orgName: 'Demo', orgId: '285361', serviceUrl: DISCOVERY_URL }]);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    success: true,
                    data: { clientId: 'shared-id', clientSecret: SHARED_SECRET },
                }),
        }) as unknown as typeof fetch;
    });

    /**
     * The claim step 03 rests on. Before the broker, this project refused and was
     * shown a button that could not help it; now it gets past credentials
     * entirely. Asserted as "not the credential refusal" rather than as success,
     * because what happens after credentials is the write client's business and
     * it is mocked here.
     */
    it('never reaches the credential refusal, so no button is offered', async () => {
        const result = await validate(unboundProject());

        // `data` is absent entirely once credentials resolve — the refusal is
        // what carries the flag — so read through it rather than matching on it.
        expect(
            (result.data as { needsAccsCredentials?: boolean } | undefined)?.needsAccsCredentials
        ).not.toBe(true);
    });

    it('works with no Adobe binding at all — the population this exists for', async () => {
        const result = await validate(unboundProject());

        const refusedForCredentials =
            result.success === false && /client id and secret/i.test(String(result.error));
        expect(refusedForCredentials).toBe(false);
    });

    // CONTROL: with the broker serving nothing, the SAME project does refuse —
    // so the assertions above are a property of the broker, not of the harness.
    it('CONTROL — the same project refuses when the service serves nothing', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ success: false, error: 'nope' }),
        }) as unknown as typeof fetch;

        const result = await validate(unboundProject());

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/client id and secret/i);
    });
});

describe('when the broker cannot serve', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // The broker caches per service URL and the cache is module-level, so
        // without this a test that fetches successfully hands the next one a
        // cached pair and its fetch mock is never called.
        clearSharedCredentialCache();
    });

    /**
     * The gate `accsProvisionEligibility` exists to hold, now reachable by a new
     * route. An offer whose only outcome is a second refusal is worse than no
     * offer, and a failing broker must not become a way to produce one.
     */
    it('withholds the offer when there is no workspace to provision in', async () => {
        seedSettings([{ orgName: 'Demo', serviceUrl: DISCOVERY_URL }]);
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ success: false, error: 'nope' }),
        }) as unknown as typeof fetch;

        const result = await validate(unboundProject());

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    it('offers Console provisioning when there IS a workspace', async () => {
        seedSettings([{ orgName: 'Demo', serviceUrl: DISCOVERY_URL }]);
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ success: false, error: 'nope' }),
        }) as unknown as typeof fetch;

        const result = await validate(boundProject());

        expect(result.data).toMatchObject({ needsAccsCredentials: true });
    });

    /**
     * No service configured is a different message from a service that refused —
     * the first names a setting the user can add, the second does not. Asserted
     * on distinguishability rather than on either sentence, since the wording is
     * the kind of thing that gets edited and the DISTINCTION is the contract.
     */
    it('says something different when no service is configured at all', async () => {
        seedSettings([{ orgName: 'Demo', serviceUrl: DISCOVERY_URL }]);
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({ success: false, error: 'nope' }),
        }) as unknown as typeof fetch;
        const refused = await validate(boundProject());

        seedSettings([]);
        const unconfigured = await validate(boundProject());

        expect(unconfigured.error).not.toEqual(refused.error);
        expect(unconfigured.error).toContain('demoBuilder.accsDiscovery.services');
        expect(refused.error).not.toContain('demoBuilder.accsDiscovery.services');
    });

    /** The secret must not ride out on any refusal, whatever the wording becomes. */
    it('never puts a credential in the refusal', async () => {
        seedSettings([{ orgName: 'Demo', serviceUrl: DISCOVERY_URL }]);
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () =>
                JSON.stringify({
                    success: true,
                    data: { clientId: 'x', clientSecret: SHARED_SECRET },
                }),
        }) as unknown as typeof fetch;

        const result = await validate(unboundProject());

        expect(JSON.stringify(result)).not.toContain(SHARED_SECRET);
    });
});
