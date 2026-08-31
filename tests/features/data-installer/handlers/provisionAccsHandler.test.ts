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
 * Strict TDD: written BEFORE the handler exists.
 */

import * as vscode from 'vscode';
import { importHandlers } from '@/features/data-installer/handlers/importHandlers';
import { provisionAccsCredentials } from '@/features/data-installer/services/accsCredentialProvisioner';
import type { HandlerContext } from '@/types/handlers';
import type { Project } from '@/types/base';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../helpers/loggerFake';

jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: jest.fn().mockResolvedValue({ authenticated: true }),
}));
jest.mock('@/features/data-installer/services/dataInstallerWriteClient');
jest.mock('@/features/data-installer/services/importJobRunner', () => ({
    watchImportJob: jest.fn(),
    IMPORT_POLL: { maxAttempts: 120, timeout: 600_000 },
}));
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
    const context = {
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                inspectToken: jest.fn().mockResolvedValue({ valid: true, token: 'tok' }),
            }),
        },
        panel: {} as vscode.WebviewPanel,
        context: { globalState: { get: jest.fn(), update: jest.fn() }, secrets: {} },
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn(async (p: Project) => void saved.push(p)),
        }),
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
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

        await importHandlers['provision-accs-credentials'](context);

        expect(mockedProvision).toHaveBeenCalledWith(expect.anything(), {
            orgId: '285361',
            projectId: 'proj-1',
            workspaceId: 'ws-1',
        });
    });

    it('writes the pair into the DECLARED fields and saves — where a pasted pair lives', async () => {
        const { context, saved } = makeImportHarness(accsProject());

        const result = await importHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(true);
        const project = saved[0] as Project;
        expect(project.componentConfigs?.['adobe-commerce-accs']).toMatchObject({
            ACCS_OAUTH_CLIENT_ID: 'cid-1',
            ACCS_OAUTH_CLIENT_SECRET: 'fake-test-secret-not-a-secret',
        });
    });

    it('never puts the secret in the response', async () => {
        const { context } = makeImportHarness();

        const result = await importHandlers['provision-accs-credentials'](context);

        expect(JSON.stringify(result)).not.toContain('fake-test-secret-not-a-secret');
        expect(JSON.stringify(result)).not.toContain('cid-1');
    });

    it('reports a provisioner refusal as the error', async () => {
        mockedProvision.mockResolvedValue({ ok: false, reason: 'no secret in the workspace' });
        const { context, saved } = makeImportHarness();

        const result = await importHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(result.error).toContain('no secret in the workspace');
        expect(saved).toHaveLength(0);
    });

    it('refuses a project with no Adobe binding, naming the gap', async () => {
        const { context } = makeImportHarness({ ...accsProject(), adobe: undefined });

        const result = await importHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/adobe project/i);
        expect(mockedProvision).not.toHaveBeenCalled();
    });

    it('refuses a non-ACCS backend — PaaS uses the admin pair, not OAuth', async () => {
        const { context } = makeImportHarness({
            ...accsProject(),
            componentSelections: { backend: 'adobe-commerce-paas' },
        });

        const result = await importHandlers['provision-accs-credentials'](context);

        expect(result.success).toBe(false);
        expect(mockedProvision).not.toHaveBeenCalled();
    });
});

describe('the needs-accs-credentials refusal carries its flag', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // The access guard runs before credentials — without settings the
        // refusal is "no URL configured" and never reaches the credential branch.
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string) =>
                key === 'apiBaseUrl'
                    ? 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api'
                    : true,
            ),
        });
    });

    it('marks the credential refusal so the UI can offer provisioning', async () => {
        const { context } = makeImportHarness(); // ACCS, no OAuth pair in configs

        const result = await importHandlers['validate-datapack-import'](context, {
            datapackName: 'bodea',
            version: 'main',
            commerceInstance: 'inst',
            dataTypes: ['categories'],
        });

        expect(result.success).toBe(false);
        expect(result.data).toMatchObject({ needsAccsCredentials: true });
    });
});

/**
 * The flag is an OFFER, and an offer must be honourable.
 *
 * `needsAccsCredentials: true` is the only thing that puts "Set up credentials
 * automatically" in front of the user. The button calls
 * `provision-accs-credentials`, which refuses without
 * `adobe.organization`/`projectId`/`workspace` — so on a project with no Adobe
 * binding the modal offered a button whose only possible outcome was a second
 * refusal.
 *
 * A datapack write needs an OAuth S2S pair, and one can exist only inside an
 * Adobe I/O workspace. A project that selected no App Builder components has no
 * workspace to create it in. That is a real limitation, not a UI bug, and the
 * honest surface for it is the plain "credentials are missing" message with no
 * button — not a button that cannot work.
 *
 * The predicate is now shared with the guard it has to agree with, so the two
 * cannot drift apart.
 */
describe('the offer appears only where provisioning could actually run', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string) =>
                key === 'apiBaseUrl'
                    ? 'https://example-namespace.adobeioruntime.net/api/v1/web/data-installer-api'
                    : true,
            ),
        });
    });

    async function refusalFor(project: unknown) {
        const { context } = makeImportHarness(project);
        return importHandlers['validate-datapack-import'](context, {
            datapackName: 'bodea',
            version: 'main',
            commerceInstance: 'inst',
            dataTypes: ['categories'],
        });
    }

    it('still refuses when the project has no Adobe binding — positive control', async () => {
        const result = await refusalFor({ ...accsProject(), adobe: undefined });

        expect(result.success).toBe(false);
    });

    it('withholds the offer when there is no Adobe project binding at all', async () => {
        const result = await refusalFor({ ...accsProject(), adobe: undefined });

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    it('withholds the offer when the binding names no workspace', async () => {
        const result = await refusalFor({
            ...accsProject(),
            adobe: { organization: '285361', projectId: 'proj-1', authenticated: true },
        });

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    it('withholds the offer when the binding names no project', async () => {
        const result = await refusalFor({
            ...accsProject(),
            adobe: { organization: '285361', workspace: 'ws-1', authenticated: true },
        });

        expect(result.data).toMatchObject({ needsAccsCredentials: false });
    });

    /** The full binding is exactly what the provisioning guard demands. */
    it('offers when the binding is complete', async () => {
        const result = await refusalFor(accsProject());

        expect(result.data).toMatchObject({ needsAccsCredentials: true });
    });
});
