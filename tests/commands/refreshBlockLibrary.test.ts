/**
 * RefreshBlockLibraryCommand tests
 *
 * Covers the dashboard kebab "Refresh Block Library" command (EDS-only):
 *   1. Pipeline invoked with { includeBlockLibrary: true, skipContent: true, skipPublish: false }
 *   2. Progress messages surfaced through vscode.window.withProgress
 *   3. DaLiveAuthError → re-authenticate once, then retry the pipeline
 */

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

jest.mock('@/features/eds/services/edsResetParams', () => ({
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

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getToken: jest.fn() })),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

// --- Imports ---------------------------------------------------------------

import { RefreshBlockLibraryCommand } from '@/commands/refreshBlockLibrary';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { ensureDaLiveAuth } from '@/features/eds/handlers/edsHelpers';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { StateManager } from '@/core/state';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';

const executePipelineMock = executeEdsPipeline as jest.Mock;
const ensureAuthMock = ensureDaLiveAuth as jest.Mock;

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    } as unknown as Logger;
}

function makeStateManager(project: Project | null): StateManager {
    return {
        getCurrentProject: jest.fn().mockResolvedValue(project),
        saveProject: jest.fn().mockResolvedValue(undefined),
    } as unknown as StateManager;
}

function makeContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        secrets: {
            get: jest.fn(),
            store: jest.fn(),
            delete: jest.fn(),
        },
    } as unknown as vscode.ExtensionContext;
}

const EDS_PROJECT = {
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
} as unknown as Project;

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

    it('retries the pipeline once after DaLiveAuthError (auth recovery)', async () => {
        // First call throws DaLiveAuthError; second succeeds.
        executePipelineMock
            .mockRejectedValueOnce(new DaLiveAuthError())
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

        await cmd.execute();

        // Pipeline invoked exactly twice (original + 1 retry)
        expect(executePipelineMock).toHaveBeenCalledTimes(2);
        // Re-auth was triggered between attempts
        expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    });
});
