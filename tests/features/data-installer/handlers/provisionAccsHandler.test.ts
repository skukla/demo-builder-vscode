/**
 * `provision-accs-credentials` — the panel handler over the proven loop.
 *
 * The handler owns the wiring the pure provisioner refuses to know about: the
 * project's Adobe binding as the target, the auth service as the Console
 * surface, the targeted downloader, and — on success — writing the pair into
 * the DECLARED fields (`componentConfigs['adobe-commerce-accs']`) and saving,
 * so `resolveCommerceCredentials` finds it exactly where a hand-pasted pair
 * would live. One storage path, not two.
 *
 * **The response never carries the secret.** The webview needs "done", not the
 * values — they are already where the next dry run reads them.
 *
 * Strict TDD: written BEFORE the handler exists. The handler lives in
 * `provisionAccsHandler.ts` since the 2026-10-08 split; the OFFER that leads to
 * it is the import spine's and is pinned in `importHandlers-accsOffer.test.ts`.
 */

import * as vscode from 'vscode';
import { provisionAccsHandlers } from '@/features/data-installer/handlers/provisionAccsHandler';
import { provisionAccsCredentials } from '@/features/data-installer/services/accsCredentialProvisioner';
import { downloadWorkspaceConfigJson } from '@/features/data-installer/services/workspaceConfigDownload';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockAuthenticationService, entityServicesOf } from '../../../helpers/authenticationServiceFake';

jest.mock('@/features/data-installer/services/accsCredentialProvisioner', () => ({
    provisionAccsCredentials: jest.fn(),
}));
jest.mock('@/features/data-installer/services/workspaceConfigDownload', () => ({
    downloadWorkspaceConfigJson: jest.fn(),
}));
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => ({ execute: jest.fn() })) },
}));

const mockedProvision = provisionAccsCredentials as jest.MockedFunction<
    typeof provisionAccsCredentials
>;

/**
 * A FACTORY, deliberately: the handler mutates the project's componentConfigs
 * before saving (the production pattern configure.ts uses), so a shared fixture
 * object gets the pair written into it by one test and hands every later test a
 * project that already has credentials. That exact pollution shipped in this
 * file's first version and made the refusal-flag test fail only in full-file
 * order — the flag was fine; the fixture had been given credentials.
 */
function accsProject(): Partial<Project> {
    return {
        name: 'demo-accs',
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql',
            },
        },
        adobe: {
            organization: '285361',
            projectId: 'proj-1',
            projectName: 'p',
            workspace: 'ws-1',
            authenticated: true,
        },
    };
}

function makeImportHarness(project: unknown = accsProject()) {
    const saved: unknown[] = [];
    const context = createMockHandlerContext({
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
            saveProject: jest.fn(async (p: Project) => void saved.push(p)),
        }),
        sendMessage: jest.fn(),
    });
    return { context, saved };
}

describe('provision-accs-credentials', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedProvision.mockResolvedValue({
            ok: true,
            clientId: 'cid-1',
            clientSecret: 'fake-test-secret-not-a-secret',
        });
    });

    it('targets the PROJECT its own Adobe binding', async () => {
        const { context } = makeImportHarness();

        await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(mockedProvision).toHaveBeenCalledWith(expect.anything(), {
            orgId: '285361',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });

    it('writes the pair into the DECLARED fields and saves — where a pasted pair lives', async () => {
        const { context, saved } = makeImportHarness(accsProject());

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(true);
        const project = saved[0] as Project;
        expect(project.componentConfigs?.['adobe-commerce-accs']).toMatchObject({
            ACCS_OAUTH_CLIENT_ID: 'cid-1',
            ACCS_OAUTH_CLIENT_SECRET: 'fake-test-secret-not-a-secret',
        });
    });

    it('keeps the ACCS config the project already had beside the new pair', async () => {
        // The pair is ADDED to the declared block. Replacing the block would drop
        // the GraphQL endpoint the import target is derived from.
        const { context, saved } = makeImportHarness(accsProject());

        await provisionAccsHandlers['provision-accs-credentials'](context);

        const project = saved[0] as Project;
        expect(project.componentConfigs?.['adobe-commerce-accs']).toMatchObject({
            ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql',
            ACCS_OAUTH_CLIENT_ID: 'cid-1',
        });
    });

    it('never puts the secret in the response', async () => {
        const { context } = makeImportHarness();

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
        expect(JSON.stringify(result)).not.toContain('cid-1');
    });

    it('reports a provisioner refusal as the error', async () => {
        mockedProvision.mockResolvedValue({ ok: false, reason: 'no secret in the workspace' });
        const { context, saved } = makeImportHarness();

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('no secret in the workspace');
        expect(saved).toHaveLength(0);
    });

    it('refuses with no project open, naming the missing project', async () => {
        const { context } = makeImportHarness(null);

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Open a project first.');
        expect(mockedProvision).not.toHaveBeenCalled();
    });

    it('refuses a project with no Adobe binding, naming the gap', async () => {
        const { context } = makeImportHarness({ ...accsProject(), adobe: undefined });

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/adobe project/i);
        expect(mockedProvision).not.toHaveBeenCalled();
    });

    it('refuses a project that records no backend selection at all', async () => {
        const project = accsProject();
        delete project.componentSelections;

        const { context } = makeImportHarness(project);

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(mockedProvision).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toContain('ACCS backends only');
    });

    it('refuses when there is no auth service to reach Console with', async () => {
        const project = accsProject();
        const { context: ctx } = makeImportHarness(project);
        // A headless caller has no authManager; provisioning cannot run without one.
        (ctx as { authManager?: unknown }).authManager = undefined;

        const result = await provisionAccsHandlers['provision-accs-credentials'](ctx);

        expect(mockedProvision).not.toHaveBeenCalled();
        expect(result).toMatchObject({ success: false, error: 'Adobe sign-in is required.' });
    });

    it('hands the provisioner an auth surface, a downloader and a log sink', async () => {
        const project = accsProject();
        mockedProvision.mockResolvedValue({ ok: true, clientId: 'cid', clientSecret: 'sec' });
        const { context: ctx } = makeImportHarness(project);

        await provisionAccsHandlers['provision-accs-credentials'](ctx);

        const deps = mockedProvision.mock.calls[0][0];
        // Each auth call reaches the unit that owns it (decompose-god-file, 2026-10-08).
        const units = entityServicesOf(ctx.authManager);
        await deps.auth.getWorkspaceS2SCredential('o', 'p', 'w');
        await deps.auth.createWorkspaceS2SCredentialFor('o', 'p', 'w');
        await deps.auth.getSubscribedServiceCodes('o', 'i');
        await deps.auth.subscribeOAuthServerToServerIntegrationToServices('o', 'i', []);
        expect(units.credentials.getWorkspaceS2SCredential).toHaveBeenCalledWith('o', 'p', 'w');
        expect(units.credentials.createWorkspaceS2SCredentialFor).toHaveBeenCalledWith('o', 'p', 'w');
        expect(units.orgServices.getSubscribedServiceCodes).toHaveBeenCalledWith('o', 'i');
        expect(units.orgServices.subscribeOAuthServerToServerIntegrationToServices).toHaveBeenCalledWith(
            'o',
            'i',
            [],
        );
        // The downloader is the targeted one: the target the provisioner names
        // reaches `downloadWorkspaceConfigJson`, with the executor ahead of it.
        const target = { orgId: 'o', projectId: 'p', workspaceId: 'w' };
        await deps.downloadWorkspaceJson(target);
        expect(downloadWorkspaceConfigJson).toHaveBeenCalledWith(expect.anything(), target);
        // The WIRING is the claim, not the wording.
        deps.log?.('a provisioning line');
        expect(ctx.debugLogger.debug).toHaveBeenCalled();
    });

    it('creates the configs map for a project that has none', async () => {
        const project = accsProject();
        delete project.componentConfigs;
        mockedProvision.mockResolvedValue({ ok: true, clientId: 'cid', clientSecret: 'sec' });
        const { context: ctx } = makeImportHarness(project);

        const result = await provisionAccsHandlers['provision-accs-credentials'](ctx);

        expect(result.success).toBe(true);
        expect(ctx.stateManager.saveProject).toHaveBeenCalled();
    });

    it('refuses a non-ACCS backend — PaaS uses the admin pair, not OAuth', async () => {
        const { context } = makeImportHarness({
            ...accsProject(),
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        const result = await provisionAccsHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(mockedProvision).not.toHaveBeenCalled();
    });
});
