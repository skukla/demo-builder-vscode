/**
 * The main reset flow, pinned on the ARGUMENTS its collaborators receive.
 *
 * Mutation testing (PL-22, batch MUT-07) found the whole GitHub App check, the
 * confirmation prompt's shape, the progress narration and the parameter object
 * handed to `executeEdsReset` unconstrained: every collaborator is mocked, and a
 * mock answers the same whatever it is handed. These suites read what each was
 * handed instead.
 *
 * Three groups:
 *
 * 1. **Before the progress window** — parameter failure, the confirmation
 *    prompt (modal, one button), the cancel result.
 * 2. **Inside it** — the progress messages in order, the DA.live / org gate
 *    arguments, and the reset parameters (defaults, byom overlay, mesh
 *    auto-detect).
 * 3. **The AEM Code Sync check** — installed, undetermined (advisory, continues),
 *    not installed (Install App / Continue Anyway / dismiss), and the status
 *    restore on every exit.
 */

import {
    mockAuthService,
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
} from './edsResetUI.testUtils';
import type { GitHubAppService } from '@/features/eds/services/github/githubAppService';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn().mockResolvedValue({ success: true }),
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: {
            repoOwner: 'test-owner',
            repoName: 'test-repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            templateOwner: 'tmpl-owner',
            templateRepo: 'tmpl-repo',
            byomOverlayUrl: 'https://overlay.example',
        },
    }),
}));
// The App resolver retries an inconclusive answer after a real 2s delay.
jest.mock('@/core/utils/sleep');

import { executeEdsReset, extractResetParams } from '@/features/eds/services/reset/edsResetService';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockedReset = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;
const mockedParams = extractResetParams as jest.MockedFunction<typeof extractResetParams>;
const meshDeps = createMeshDepsFake({ authManager: mockAuthService });
const RESET = 'Reset Project';

/**
 * Handed in through the options seam. `isAppInstalled` is what the resolver
 * calls; `getInstallUrl` is what the Install App branch opens.
 */
const isAppInstalled = jest.fn();
const getInstallUrl = jest.fn(
    (owner: string, repo: string) => `https://github.com/apps/aem-code-sync/new?o=${owner}&r=${repo}`,
);
const appService = { isAppInstalled, getInstallUrl } as unknown as GitHubAppService;

function createProject(hasMesh = false): Project {
    const project = createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        adobe: { organization: 'org-123', projectId: 'proj-456', workspace: 'ws-789' },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'test-owner/test-repo', daLiveOrg: 'test-org' },
            },
        },
    });
    if (hasMesh) {
        project.componentInstances!['commerce-mesh'] = {
            id: 'commerce-mesh',
            name: 'API Mesh',
            subType: 'mesh',
            path: '/test/mesh',
            status: 'deployed',
        };
    }
    return project;
}

/** Records the project's status at every save, so the resetting→restored arc is visible. */
function createContext(savedStatuses: string[] = []): HandlerContext {
    return createMockHandlerContext({
        stateManager: createMockStateManager({
            getCurrentProject: jest.fn(),
            saveProject: jest.fn(async (p: Project) => {
                savedStatuses.push(p.status);
            }),
        }),
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
}

/** The progress sink the SUT narrates into; captured so its messages can be read. */
const report = jest.fn();

function run(project: Project, context = createContext(), extra: Record<string, unknown> = {}) {
    return resetEdsProjectWithUI({
        githubAppService: appService,
        meshDeps,
        project,
        context,
        ...extra,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(RESET);
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (_options: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
            task({ report }),
    );
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    isAppInstalled.mockResolvedValue({ isInstalled: true });
});

describe('resetEdsProjectWithUI — before the progress window', () => {
    it('returns the extraction error and asks nothing when the params cannot be read', async () => {
        mockedParams.mockReturnValueOnce({ success: false, error: 'no repo recorded' });

        const result = await run(createProject());

        expect(result).toEqual({ success: false, error: 'no repo recorded' });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('confirms with a MODAL naming the project and one button', async () => {
        await run(createProject());

        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('reset "test-project"'),
            { modal: true },
            RESET,
        );
    });

    it('reports a cancel as cancelled, with nothing saved and nothing run', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);
        const context = createContext();

        const result = await run(createProject(), context);

        expect(result).toEqual({ success: false, cancelled: true });
        expect(context.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockedReset).not.toHaveBeenCalled();
    });

    it('answers the DA.live guard error verbatim, falling back only when it gave none', async () => {
        mockEnsureDaLiveAuth.mockResolvedValueOnce({
            authenticated: false,
            error: 'Token validation failed',
        });
        expect(await run(createProject())).toMatchObject({ error: 'Token validation failed' });

        mockEnsureDaLiveAuth.mockResolvedValueOnce({ authenticated: false, cancelled: true });
        expect(await run(createProject())).toMatchObject({
            error: 'DA.live authentication required',
            cancelled: true,
        });
    });
});

describe('resetEdsProjectWithUI — inside the progress window', () => {
    it('opens a non-cancellable notification titled for the reset', async () => {
        await run(createProject());

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Resetting EDS Project',
                cancellable: false,
            },
            expect.any(Function),
        );
    });

    it('narrates the four pre-flight checks in order, then each pipeline step', async () => {
        await run(createProject());

        expect(report.mock.calls.map((c) => c[0])).toEqual([
            { message: 'Checking authentication…' },
            { message: 'Checking Adobe I/O authentication…' },
            { message: 'Checking Adobe organization…' },
            { message: 'Checking GitHub App…' },
        ]);

        const onProgress = mockedReset.mock.calls[0][4]!;
        onProgress({ step: 3, totalSteps: 11, message: 'Syncing repository' });
        expect(report).toHaveBeenLastCalledWith({ message: 'Step 3/11: Syncing repository' });
    });

    it('hands the org gate the auth manager, the project and the logger', async () => {
        const project = createProject();
        const context = createContext();

        await run(project, context, { logPrefix: '[Dashboard]' });

        expect(mockEnsureProjectOrgContext).toHaveBeenCalledWith({
            authManager: mockAuthService,
            project,
            logger: context.logger,
            logPrefix: '[Dashboard]',
        });
    });

    it('hands executeEdsReset the extracted params, the stamped overlay URL and the defaults', async () => {
        const context = createContext();

        await run(createProject(), context);

        expect(mockedReset).toHaveBeenCalledWith(
            expect.objectContaining({
                repoOwner: 'test-owner',
                repoName: 'test-repo',
                daLiveOrg: 'test-org',
                daLiveSite: 'test-site',
                templateOwner: 'tmpl-owner',
                byomOverlayUrl: 'https://overlay.example?org=test-org&site=test-site&key=test-secret',
                includeBlockLibrary: false,
                verifyCdn: false,
                redeployMesh: false,
            }),
            context,
            expect.anything(),
            meshDeps,
            expect.any(Function),
        );
    });

    it('forwards includeBlockLibrary and verifyCdn when the caller sets them', async () => {
        await run(createProject(), createContext(), { includeBlockLibrary: true, verifyCdn: true });

        expect(mockedReset.mock.calls[0][0]).toMatchObject({
            includeBlockLibrary: true,
            verifyCdn: true,
        });
    });

    it.each([
        ['auto-detects a mesh', true, undefined, true],
        ['auto-detects no mesh', false, undefined, false],
        ['an explicit false wins over a mesh', true, false, false],
        ['an explicit true wins over no mesh', false, true, true],
    ])('redeployMesh: %s', async (_label, hasMesh, redeployMesh, expected) => {
        await run(createProject(hasMesh), createContext(), { redeployMesh });

        expect(mockedReset.mock.calls[0][0].redeployMesh).toBe(expected);
    });

    it('saves the project as resetting, then restores its status when done', async () => {
        const statuses: string[] = [];
        const project = createProject();

        await run(project, createContext(statuses));

        expect(statuses).toEqual(['resetting', 'running']);
        expect(project.status).toBe('running');
    });

    it('restores the status even when the reset throws', async () => {
        mockedReset.mockRejectedValueOnce(new Error('pipeline died'));
        const project = createProject();

        await expect(run(project)).rejects.toThrow('pipeline died');

        expect(project.status).toBe('running');
    });
});

describe('resetEdsProjectWithUI — the AEM Code Sync check', () => {
    it('asks the App service about the extracted repo and continues when installed', async () => {
        await run(createProject());

        expect(isAppInstalled).toHaveBeenCalledWith('test-owner', 'test-repo');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedReset).toHaveBeenCalled();
    });

    it('continues WITHOUT the install prompt when the check is undetermined, naming the status', async () => {
        isAppInstalled.mockResolvedValue({ isInstalled: false, transient: true, httpStatus: 503 });
        const context = createContext();

        await run(createProject(), context);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedReset).toHaveBeenCalled();
        expect(context.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not verify AEM Code Sync on test-owner/test-repo (HTTP 503)'),
        );
    });

    it('says "no response" when the undetermined check carried no HTTP status', async () => {
        isAppInstalled.mockResolvedValue({ isInstalled: false, transient: true, noCredential: true });
        const context = createContext();

        await run(createProject(), context);

        expect(context.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('(HTTP no response)'),
        );
    });

    describe('when the App is NOT installed', () => {
        beforeEach(() => {
            isAppInstalled.mockResolvedValue({ isInstalled: false });
        });

        it('offers Install App / Continue Anyway', async () => {
            await run(createProject());

            expect(vscode.window.showWarningMessage).toHaveBeenLastCalledWith(
                expect.stringContaining('AEM Code Sync GitHub App is not installed'),
                'Install App',
                'Continue Anyway',
            );
        });

        it('Install App opens the install URL for THIS repo, then continues on Continue', async () => {
            (vscode.window.showWarningMessage as jest.Mock)
                .mockResolvedValueOnce(RESET)
                .mockResolvedValueOnce('Install App');
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Continue');

            const result = await run(createProject());

            expect(getInstallUrl).toHaveBeenCalledWith('test-owner', 'test-repo');
            expect(vscode.Uri.parse).toHaveBeenCalledWith(
                'https://github.com/apps/aem-code-sync/new?o=test-owner&r=test-repo',
            );
            expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('click Continue'),
                'Continue',
                'Cancel',
            );
            expect(mockedReset).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('Install App then Cancel aborts, restoring the status before returning', async () => {
            (vscode.window.showWarningMessage as jest.Mock)
                .mockResolvedValueOnce(RESET)
                .mockResolvedValueOnce('Install App');
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Cancel');
            const statuses: string[] = [];

            const result = await run(createProject(), createContext(statuses));

            expect(result).toEqual({ success: false, cancelled: true });
            expect(mockedReset).not.toHaveBeenCalled();
            expect(statuses).toEqual(['resetting', 'running', 'running']);
        });

        it('Continue Anyway runs the reset without opening anything', async () => {
            (vscode.window.showWarningMessage as jest.Mock)
                .mockResolvedValueOnce(RESET)
                .mockResolvedValueOnce('Continue Anyway');

            const result = await run(createProject());

            expect(vscode.env.openExternal).not.toHaveBeenCalled();
            expect(mockedReset).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('dismissing the prompt aborts as cancelled', async () => {
            (vscode.window.showWarningMessage as jest.Mock)
                .mockResolvedValueOnce(RESET)
                .mockResolvedValueOnce(undefined);
            const statuses: string[] = [];

            const result = await run(createProject(), createContext(statuses));

            expect(result).toEqual({ success: false, cancelled: true });
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
            expect(mockedReset).not.toHaveBeenCalled();
            expect(statuses).toEqual(['resetting', 'running', 'running']);
        });
    });
});
