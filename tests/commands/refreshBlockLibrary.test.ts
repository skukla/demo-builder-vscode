/**
 * RefreshBlockLibraryCommand tests
 *
 * Covers the dashboard kebab "Refresh Block Library" command (EDS-only):
 *   1. Pipeline invoked with { includeBlockLibrary: true, skipContent: true, skipPublish: false }
 *   2. Progress messages surfaced through vscode.window.withProgress
 *   3. DaLiveAuthError → re-authenticate once, then retry the pipeline
 */

// Real wall-clock retry/UI delays; mock the shared sleep so only orchestration is
// under test. Assertions pin the SEQUENCE of attempts, never elapsed duration.
jest.mock('@/core/utils/sleep', () => ({ sleep: jest.fn().mockResolvedValue(undefined) }));

import type { HelixService } from '@/features/eds/services/helix/helixService';
import * as vscode from 'vscode';

// --- Mocks (must precede imports) -------------------------------------------

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn(),
}));

// DaLiveAuthError is referenced for the auth-retry branch.
// Defined inside the factory because jest.mock is hoisted above all top-level code.
jest.mock('@/features/eds/services/types', () => {
    class DaLiveAuthError extends Error {
        constructor(message = 'DA.live token expired') {
            super(message);
            this.name = 'DaLiveAuthError';
        }
    }
    return { DaLiveAuthError };
});

jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    extractResetParams: jest.fn(() => ({
        success: true,
        params: {
            repoOwner: 'demo-org',
            repoName: 'demo-repo',
            daLiveOrg: 'demo-org',
            daLiveSite: 'demo-site',
            templateOwner: 'template-org',
            templateRepo: 'template-repo',
        },
    })),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => ({
        isAuthenticated: jest.fn().mockResolvedValue(true),
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('user@example.com'),
    })),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getGitHubServices: jest.fn(() => ({
        tokenService: {},
        repoOperations: {},
        fileOperations: { getFileContent: jest.fn() },
        oauthService: {},
    })),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getToken: jest.fn() })),
}));


jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

// --- Imports ---------------------------------------------------------------

import { RefreshBlockLibraryCommand } from '@/commands/refreshBlockLibrary';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { StateManager } from '@/core/state/stateManager';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';
import { createMockLogger } from '../helpers/loggerFake';
import { createMockStateManager } from '../helpers/stateManagerFake';
import { createMockExtensionContext } from '../helpers/extensionContextFake';
import { createMockProject } from '../helpers/projectFake';

const executePipelineMock = executeEdsPipeline as jest.Mock;
const ensureAuthMock = ensureDaLiveAuth as jest.Mock;

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

function makeStateManager(project: Project | null): StateManager {
    return createMockStateManager({
        getCurrentProject: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    }) as unknown as StateManager;
}

function makeContext(): vscode.ExtensionContext {
    return createMockExtensionContext();
}

const EDS_PROJECT = createMockProject({
    name: 'Demo EDS',
    path: '/projects/demo',
    selectedStack: 'eds-paas',
    componentInstances: {
        'eds-storefront': {
            id: 'eds-storefront',
            name: 'EDS Storefront',
            type: 'frontend',
            status: 'ready',
            metadata: {
                githubRepo: 'demo-org/demo-repo',
                daLiveOrg: 'demo-org',
                daLiveSite: 'demo-site',
            },
        },
    },
});

/**
 * Helix reaches the headless core through the command's own seam, not a module mock.
 * Nothing here asserts on the service — the pipeline is what this suite checks — so an
 * empty object cast at the boundary states exactly that (ADR-016 rule 2).
 */
const fakeHelix = {} as unknown as HelixService;

describe('RefreshBlockLibraryCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        executePipelineMock.mockResolvedValue({
            success: true,
            contentFilesCopied: 0,
            libraryPaths: ['/.da/library/blocks/hero'],
        });

        // vscode.window.withProgress should execute the callback with a real progress reporter
        (vscode.window.withProgress as jest.Mock).mockImplementation(
            async (_options: unknown, callback: (progress: { report: jest.Mock }) => Promise<unknown>) => {
                const progress = { report: jest.fn() };
                return callback(progress);
            },
        );
    });

    it('calls executeEdsPipeline with includeBlockLibrary=true, skipContent=true, skipPublish=false', async () => {
        const cmd = new RefreshBlockLibraryCommand(
            makeContext(),
            makeStateManager(EDS_PROJECT),
            makeLogger(),
        );
        cmd.helixService = fakeHelix;

        await cmd.execute();

        expect(executePipelineMock).toHaveBeenCalled();
        const callArgs = executePipelineMock.mock.calls[0];
        const params = callArgs[0] as Record<string, unknown>;
        expect(params.includeBlockLibrary).toBe(true);
        expect(params.skipContent).toBe(true);
        expect(params.skipPublish).toBe(false);
        // Load-bearing: an empty (truthy) blockCollectionIds array signals the
        // pipeline to read component-definition.json from the USER's repo so
        // MCP-promoted blocks survive the destructive rebuild.
        expect(params.blockCollectionIds).toEqual([]);
    });

    it('surfaces progress messages during pipeline execution', async () => {
        const cmd = new RefreshBlockLibraryCommand(
            makeContext(),
            makeStateManager(EDS_PROJECT),
            makeLogger(),
        );
        cmd.helixService = fakeHelix;

        await cmd.execute();

        // The command must drive withProgress (the progress UI surface)
        expect(vscode.window.withProgress).toHaveBeenCalled();

        // The pipeline must be given a progress callback (3rd argument)
        const callArgs = executePipelineMock.mock.calls[0];
        const onProgress = callArgs[2];
        expect(typeof onProgress).toBe('function');

        // Invoking the pipeline progress callback must not throw — it must
        // bridge through to a reporter (we just verify it's wired and callable).
        expect(() => onProgress({ operation: 'block-library', message: 'configuring...' })).not.toThrow();
    });

    /**
     * The command owns the UX and nothing else — which toast fires, and whether one
     * fires at all. Every branch below is invisible to the pipeline assertions above:
     * the rebuild behaves identically and only the user's report differs.
     */
    describe('what the user is told', () => {
        function command(project: Project | null = EDS_PROJECT): RefreshBlockLibraryCommand {
            const cmd = new RefreshBlockLibraryCommand(
                makeContext(),
                makeStateManager(project),
                makeLogger(),
            );
            cmd.helixService = fakeHelix;
            return cmd;
        }

        it('confirms a rebuild that landed, and shows no error', async () => {
            await command().execute();

            expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
                expect.stringContaining('Block library refreshed'),
                expect.anything(),
            );
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
        });

        it('reports the failure the rebuild gave, not a generic one', async () => {
            executePipelineMock.mockResolvedValue({
                success: false,
                error: 'component-definition.json is not valid JSON',
            });

            await command().execute();

            // The reason IS the fix here — a hand-edited comp-def is why this
            // command exists, and "it failed" sends the user nowhere.
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('component-definition.json is not valid JSON'),
                'OK',
            );
            expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
        });

        it('says nothing when the user cancelled the mid-rebuild DA.live re-auth', async () => {
            executePipelineMock.mockRejectedValue(new DaLiveAuthError('DA.live token expired'));
            ensureAuthMock.mockResolvedValue({ authenticated: false, cancelled: true });

            await command().execute();

            // The user just dismissed a sign-in. An error toast on top of that
            // reports their own choice back to them as a fault.
            expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
            expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
        });

        it('still errors when the re-auth failed rather than being cancelled', async () => {
            executePipelineMock.mockRejectedValue(new DaLiveAuthError('DA.live token expired'));
            ensureAuthMock.mockResolvedValue({ authenticated: false, error: 'token rejected' });

            await command().execute();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('token rejected'),
                'OK',
            );
        });

        it('warns and runs nothing when no project is loaded', async () => {
            await command(null).execute();

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                'No project loaded.',
                'OK',
            );
            expect(executePipelineMock).not.toHaveBeenCalled();
            expect(vscode.window.withProgress).not.toHaveBeenCalled();
        });

        it('reports a failure rather than a success when the progress task never ran', async () => {
            // The result is captured from inside the task, so the initial value is
            // what survives if the task does not run. It has to read as a failure:
            // a success toast for a rebuild that never happened is the one outcome
            // this command must not produce.
            (vscode.window.withProgress as jest.Mock).mockResolvedValue(undefined);

            await command().execute();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Unknown error'),
                'OK',
            );
            expect(vscode.window.setStatusBarMessage).not.toHaveBeenCalled();
        });
    });

    it('retries the pipeline once after DaLiveAuthError (auth recovery)', async () => {
        // First call throws DaLiveAuthError; second succeeds.
        executePipelineMock
            .mockRejectedValueOnce(new DaLiveAuthError('DA.live authentication expired'))
            .mockResolvedValueOnce({
                success: true,
                contentFilesCopied: 0,
                libraryPaths: ['/.da/library/blocks/hero'],
            });

        // Auth recovery succeeds
        ensureAuthMock.mockResolvedValueOnce({ authenticated: true });

        const cmd = new RefreshBlockLibraryCommand(
            makeContext(),
            makeStateManager(EDS_PROJECT),
            makeLogger(),
        );
        cmd.helixService = fakeHelix;

        await cmd.execute();

        // Pipeline invoked exactly twice (original + 1 retry)
        expect(executePipelineMock).toHaveBeenCalledTimes(2);
        // Re-auth was triggered between attempts
        expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    });
});
