/**
 * Reset and the imported sample data.
 *
 * Reset has always meant "put the STOREFRONT back": repo to template, CDN sync,
 * DA.live content re-copied. Sample data is a different target — products,
 * categories and customers on a live Commerce instance — so folding it in
 * silently would widen what an existing button destroys.
 *
 * So it is a SECOND prompt, and these pin its three properties:
 *
 * 1. **Only when there is something to remove.** A project that recorded no
 *    pack is never asked; an extra modal answering itself is noise.
 * 2. **Opt IN.** Dismissing the prompt keeps the data. Someone resetting code
 *    must not lose a catalog by pressing Escape, which is why dismissal and
 *    "keep" are the same path.
 * 3. **It cannot fail the reset.** The storefront reset is what was asked for;
 *    a failed removal is reported, not fatal.
 *
 * Gated on `project.datapack` rather than asking the service what is installed:
 * a network call in front of a modal adds a failure mode to a dialog, and the
 * removal itself reports when there was nothing there.
 *
 * The mock environment mirrors edsResetUI-auth.test.ts. Copied rather than
 * shared because `jest.mock` is hoisted within the file that imports the SUT, so
 * a mock living in another module registers too late.
 */

import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks - defined before imports
// =============================================================================

// Mock ensureDaLiveAuth
const mockEnsureDaLiveAuth = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    ensureDaLiveAuth: mockEnsureDaLiveAuth,
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    }),
    getGitHubServices: jest.fn().mockReturnValue({ tokenService: {} }),
    tryCreateDaLiveTokenProvider: jest.fn(() => undefined),
    showDaLiveAuthQuickPick: jest.fn(),
    resolveByomOverlayConfig: jest.fn(
        (fromConfigUrl: string | undefined, org: string, site: string) =>
            fromConfigUrl ? `${fromConfigUrl}?org=${org}&site=${site}&key=test-secret` : undefined,
    ),
}));

// Mock ensureAdobeIOAuth
const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: mockEnsureAdobeIOAuth,
}));

// Mock ServiceLocator for checkAdobeAuth
const mockAuthService = {
    isAuthenticated: jest.fn(),
    loginAndRestoreProjectContext: jest.fn(),
};
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => mockAuthService),
    },
}));

// Mock ensureProjectOrgContext — the inline action-time org gate used by
// checkOrgContext (it owns the "Switch IMS Org" prompt + forced login internally).
const mockEnsureProjectOrgContext = jest.fn();
jest.mock('@/features/authentication/services/ensureProjectOrgContext', () => ({
    ensureProjectOrgContext: (...args: unknown[]) => mockEnsureProjectOrgContext(...args),
}));

jest.mock('vscode', () => ({
    window: {
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn().mockImplementation(async (_options: any, callback: any) => {
            return callback({ report: jest.fn() });
        }),
    },
    ProgressLocation: { Notification: 15 },
    env: { openExternal: jest.fn() },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/core/logging', () => ({
    getLogger: jest.fn().mockReturnValue({
        info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
    }),
    initializeLogger: jest.fn(),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        NORMAL: 30000,
        QUICK: 5000,
        UI: { MIN_LOADING: 500, NOTIFICATION: 2000 },
    },
}));

jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: jest.fn((project: any) => {
        if (!project?.componentInstances) return undefined;
        return Object.values(project.componentInstances).find(
            (c: any) => c.subType === 'mesh'
        );
    }),
    hasEntries: jest.fn((obj: any) => obj && Object.keys(obj).length > 0),
}));

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-dalive-token'),
    })),
}));

jest.mock('@/features/eds/services/githubAppService', () => ({
    GitHubAppService: jest.fn().mockImplementation(() => ({
        isAppInstalled: jest.fn().mockResolvedValue({ isInstalled: true }),
    })),
}));

jest.mock('@/features/eds/services/edsResetService', () => ({
    executeEdsReset: jest.fn().mockResolvedValue({ success: true, filesReset: 1 }),
    // Lives in edsResetService too — mocking the module with only executeEdsReset
    // wipes it, and the SUT dies on a missing function before reaching anything
    // this file is about.
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: { repoOwner: 'test-owner', repoName: 'test-repo' },
    }),
}));

jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn(),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import * as vscode from 'vscode';
import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { resolveCommerceCredentials } from '@/features/data-installer/services/commerceCredentials';
import { resetEdsProjectWithUI } from '@/features/eds/services/edsResetUI';

const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const mockedCredentials = resolveCommerceCredentials as jest.MockedFunction<
    typeof resolveCommerceCredentials
>;
const RESET = 'Reset Project';
const REMOVE = 'Remove Sample Data';

const testPackages = [
    {
        id: 'citisignal',
        storefronts: {
            'eds-paas': { templateOwner: 'test-owner', templateRepo: 'test-template' },
        },
    },
] as unknown as Parameters<typeof resetEdsProjectWithUI>[0]['packages'];

function createProject(datapack?: { name: string; version: string }): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
            },
        },
        ...(datapack ? { datapack } : {}),
    } as unknown as Project;
}

function createContext(): HandlerContext {
    return {
        logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        debugLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        stateManager: { saveProject: jest.fn(), getCurrentProject: jest.fn() },
        sendMessage: jest.fn(),
        context: { globalState: { get: jest.fn(), update: jest.fn() }, secrets: {} },
    } as unknown as HandlerContext;
}

/** The confirm answers, in order: the reset, then the sample-data prompt. */
function answers(...values: Array<string | undefined>): void {
    const mock = vscode.window.showWarningMessage as jest.Mock;
    mock.mockReset();
    for (const value of values) {
        mock.mockResolvedValueOnce(value);
    }
    mock.mockResolvedValue(undefined);
}

function run(project: Project) {
    return resetEdsProjectWithUI({ project, context: createContext(), packages: testPackages });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
    mockedCredentials.mockResolvedValue({ ok: true, credentials: { kind: 'accs' } } as never);
});

describe('resetEdsProjectWithUI — sample data', () => {
    /** Rule 1. */
    it('never asks when the project recorded no pack', async () => {
        answers(RESET);

        await run(createProject());

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('asks, and names the pack, when one was recorded', async () => {
        answers(RESET, undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));

        const second = (vscode.window.showWarningMessage as jest.Mock).mock.calls[1];
        expect(String(second[0])).toMatch(/bodea/);
        expect(String(second[0])).toMatch(/sample data/i);
    });

    /** Rule 2 — the important one. */
    it('KEEPS the data when the prompt is dismissed', async () => {
        answers(RESET, undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('removes only when the removal is explicitly chosen', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedRemove).toHaveBeenCalled();
    });

    /** Cancelling the reset cancels everything — the second prompt never runs. */
    it('does not ask about data when the reset itself is cancelled', async () => {
        answers(undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    /** Rule 3. */
    it('still reports the reset as successful when the removal fails', async () => {
        answers(RESET, REMOVE);
        mockedRemove.mockResolvedValue({ ran: false, reason: 'the service refused' });

        const result = await run(createProject({ name: 'bodea', version: 'main' }));

        expect(result.success).toBe(true);
    });

    it('does not throw when the removal itself blows up', async () => {
        answers(RESET, REMOVE);
        mockedRemove.mockRejectedValue(new Error('unexpected'));

        await expect(run(createProject({ name: 'bodea', version: 'main' }))).resolves.toMatchObject(
            { success: true },
        );
    });
});

/**
 * Do not ask for something we cannot deliver.
 *
 * Measured live 2026-08-16: reset offered sample-data removal, ran the full
 * ~3-minute storefront reset, and only THEN reported "This project has no usable
 * Commerce credentials." The prompt should never have appeared.
 *
 * The gate was `project.datapack` alone, justified by "a network call in front of
 * a modal adds a failure mode to a dialog".
 *
 * **That justification has since half come true, and the conclusion still holds.**
 * `resolveCommerceCredentials` now DOES make a network call for an ACCS project
 * with no declared pair: it asks the shared discovery service for the credential
 * such a project cannot mint itself. What made the original reasoning wrong was
 * never the absence of a network call — it was that the alternative is three
 * minutes of irreversible reset behind a question that could not be honoured. A
 * bounded GET that degrades silently does not add a failure mode; it removes one.
 *
 * The credential requirement is not incidental. A Data Installer write needs an
 * OAuth S2S pair, which exists only inside an Adobe I/O project and workspace, so
 * a package that selects no App Builder components has nowhere for one to live —
 * which is exactly the gap the broker fills.
 */
describe('resetEdsProjectWithUI — asks only when it can deliver', () => {
    it('does not ask when the project has no usable Commerce credentials', async () => {
        mockedCredentials.mockResolvedValue({ ok: false, reason: 'needs-accs-credentials' } as never);
        answers(RESET);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('still asks when the credentials resolve', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
        expect(mockedRemove).toHaveBeenCalled();
    });

    /**
     * THE TRAP THIS TEST EXISTS FOR.
     *
     * This call site passed `{ project }` and nothing else for its whole life.
     * Adding the broker parameter to `resolveCommerceCredentials` does not force
     * it to be supplied — the parameter is optional so the callers that cannot
     * build one keep working — so forgetting it here leaves every other test in
     * this repo green while the feature is inert on the path it was built for: a
     * project with no App Builder components, which is the only kind that has no
     * pair of its own.
     *
     * Asserted on the ARGUMENT rather than on any resulting behaviour, because
     * the resolver is mocked here and would report success either way.
     */
    it('supplies a broker, so a project with no workspace can still be offered removal', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedCredentials).toHaveBeenCalledWith(
            expect.objectContaining({ broker: expect.any(Function) }),
        );
    });

    /** Checked BEFORE the prompt, not during the reset it would follow. */
    it('resolves credentials before asking, not after resetting', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        const askedAt = (vscode.window.showWarningMessage as jest.Mock).mock.invocationCallOrder[1];
        const checkedAt = mockedCredentials.mock.invocationCallOrder[0];
        expect(checkedAt).toBeLessThan(askedAt);
    });

    /** No pack, no credential lookup — nothing to spend it on. */
    it('does not even look when the project chose no pack', async () => {
        answers(RESET);

        await run(createProject());

        expect(mockedCredentials).not.toHaveBeenCalled();
    });
});
