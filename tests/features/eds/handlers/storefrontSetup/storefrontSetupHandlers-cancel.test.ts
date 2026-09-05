/**
 * Storefront Setup Handlers — cancel and resource cleanup.
 *
 * Cancel is the undo half of storefront setup: it aborts the running phases and
 * deletes the GitHub repo, the DA.live content and the Config Service entry that
 * the run created so far. Nothing here was covered before (PL-22 MUT-04), which
 * matters more than usual — a cancel that quietly cleans up the wrong resources,
 * or none, leaves an SC with a half-built storefront they cannot rebuild under
 * the same name.
 *
 * Every assertion below reads the ARGUMENTS a collaborator was handed —
 * `showWarningMessage`, `cleanupEdsResources`, the CleanupService constructor —
 * because the mocks answer the same whatever they are given.
 */

import type { HandlerContext } from '@/types/handlers';
import type { EdsCleanupResult } from '@/features/eds/services/types';

// =============================================================================
// Mocks — before the imports of the module under test
// =============================================================================

const mockCleanupEdsResources = jest.fn();
const mockCleanupServiceCtor = jest.fn();
jest.mock('@/features/eds/services/cleanupService', () => ({
    CleanupService: class {
        cleanupEdsResources = mockCleanupEdsResources;
        constructor(...args: unknown[]) {
            mockCleanupServiceCtor(...args);
        }
    },
}));

const mockConfigurationServiceCtor = jest.fn();
jest.mock('@/features/eds/services/configService/configurationService', () => ({
    ConfigurationService: class {
        constructor(...args: unknown[]) {
            mockConfigurationServiceCtor(...args);
        }
    },
}));

const mockToolManagerCtor = jest.fn();
jest.mock('@/features/eds/services/toolManager', () => ({
    ToolManager: class {
        constructor(...args: unknown[]) {
            mockToolManagerCtor(...args);
        }
    },
}));

const mockDaLiveOrgOperationsCtor = jest.fn();
jest.mock('@/features/eds/services/daLive/daLiveOrgOperations', () => ({
    DaLiveOrgOperations: class {
        constructor(...args: unknown[]) {
            mockDaLiveOrgOperationsCtor(...args);
        }
    },
}));

const ADOBE_TOKEN_PROVIDER = { kind: 'adobe-token-provider' };
const DA_LIVE_TOKEN_PROVIDER = { kind: 'da-live-token-provider' };
jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    createDaLiveTokenProvider: jest.fn(() => ADOBE_TOKEN_PROVIDER),
    createDaLiveServiceTokenProvider: jest.fn(() => DA_LIVE_TOKEN_PROVIDER),
}));

const REPO_OPERATIONS = { kind: 'repo-operations' };
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => ({ repoOperations: REPO_OPERATIONS })),
}));

const DA_LIVE_AUTH_SERVICE = { kind: 'da-live-auth-service' };
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getDaLiveAuthService: jest.fn(() => DA_LIVE_AUTH_SERVICE),
    ensureDaLiveAuth: jest.fn(),
    resolveByomOverlayConfig: jest.fn(),
    explainAbsentOverlay: jest.fn(),
}));

const COMMAND_EXECUTOR = { kind: 'command-executor' };
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: { getCommandExecutor: jest.fn(() => COMMAND_EXECUTOR) },
}));

// =============================================================================
// Imports (after the mocks)
// =============================================================================

import * as vscode from 'vscode';
import {
    handleCancelStorefrontSetup,
    type StorefrontSetupPartialState,
} from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { getGitHubServices } from '@/features/eds/handlers/edsServiceCache';
import { getDaLiveAuthService } from '@/features/eds/handlers/edsHelpers';
import {
    createDaLiveTokenProvider,
    createDaLiveServiceTokenProvider,
} from '@/features/eds/services/daLive/daLiveContentOperations';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockAuthenticationService } from '../../../../helpers/authenticationServiceFake';

const mockShowWarningMessage = vscode.window.showWarningMessage as jest.Mock;

// =============================================================================
// Helpers
// =============================================================================

const CONFIRM = 'Yes, Cancel';

/** Every operation succeeded and none was skipped — the ordinary cleanup answer. */
function cleanupSucceeded(): EdsCleanupResult {
    const ok = { success: true, skipped: false };
    return { backendData: ok, configService: ok, daLive: ok, github: ok };
}

const AUTH_MANAGER = createMockAuthenticationService();

function createContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger() as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
        context: { secrets: { kind: 'secret-storage' } } as unknown as HandlerContext['context'],
        authManager: AUTH_MANAGER,
        ...overrides,
    });
}

/** A partial state that says "the repo exists", which is what arms the cleanup. */
function repoCreated(
    overrides: Partial<StorefrontSetupPartialState> = {}
): StorefrontSetupPartialState {
    return {
        repoCreated: true,
        contentCopied: false,
        phase: 'github-repo',
        repoOwner: 'demo-org',
        repoName: 'demo-repo',
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockShowWarningMessage.mockResolvedValue(CONFIRM);
    mockCleanupEdsResources.mockResolvedValue(cleanupSucceeded());
});

// =============================================================================
// Tests
// =============================================================================

describe('handleCancelStorefrontSetup — when the confirmation dialog appears', () => {
    it('asks before deleting anything, modally, with one destructive choice', async () => {
        const context = createContext();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Cancelling will delete the GitHub repository and DA.live content created so far. Continue?',
            { modal: true },
            CONFIRM
        );
    });

    it('asks when only DA.live content was copied', async () => {
        // Either resource on its own is enough to warrant the prompt — an `&&`
        // here would delete copied content with no warning.
        const context = createContext();

        await handleCancelStorefrontSetup(context, {
            partialState: repoCreated({ repoCreated: false, contentCopied: true }),
        });

        expect(mockShowWarningMessage).toHaveBeenCalled();
    });

    it('does not ask when nothing was created', async () => {
        const context = createContext();

        const result = await handleCancelStorefrontSetup(context, {
            partialState: { repoCreated: false, contentCopied: false, phase: 'idle' },
        });

        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(mockCleanupEdsResources).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });

    it('does not ask, and does not read the state, when there is no payload at all', async () => {
        // The handler is registered against a message that may arrive bare.
        const context = createContext();

        const result = await handleCancelStorefrontSetup(context);

        expect(mockShowWarningMessage).not.toHaveBeenCalled();
        expect(mockCleanupEdsResources).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });
});

describe('handleCancelStorefrontSetup — declining the dialog', () => {
    it('leaves the run alone: nothing aborted, nothing deleted', async () => {
        mockShowWarningMessage.mockResolvedValue(undefined);
        const abortController = new AbortController();
        const abort = jest.spyOn(abortController, 'abort');
        const context = createContext();
        context.sharedState.storefrontSetupAbortController = abortController;

        const result = await handleCancelStorefrontSetup(context, {
            partialState: repoCreated(),
        });

        expect(abort).not.toHaveBeenCalled();
        expect(mockCleanupEdsResources).not.toHaveBeenCalled();
        expect(context.sendMessage).not.toHaveBeenCalled();
        expect(context.sharedState.storefrontSetupAbortController).toBe(abortController);
        expect(result).toEqual({ success: true });
    });

    it('treats any other dialog answer as a decline', async () => {
        // The modal can also be dismissed with Cancel, which resolves to the
        // secondary label rather than to undefined.
        mockShowWarningMessage.mockResolvedValue('Cancel');
        const context = createContext();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(mockCleanupEdsResources).not.toHaveBeenCalled();
    });
});

describe('handleCancelStorefrontSetup — aborting the running phases', () => {
    it('aborts the controller and drops it from shared state', async () => {
        const abortController = new AbortController();
        const abort = jest.spyOn(abortController, 'abort');
        const context = createContext();
        context.sharedState.storefrontSetupAbortController = abortController;

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(abort).toHaveBeenCalled();
        expect(context.sharedState.storefrontSetupAbortController).toBeUndefined();
    });

    it('still cleans up when no run is in flight', async () => {
        // Cancel can arrive after the phases already finished; there is no
        // controller to abort and the resources still have to go.
        const context = createContext();
        context.sharedState.storefrontSetupAbortController = undefined;

        const result = await handleCancelStorefrontSetup(context, {
            partialState: repoCreated(),
        });

        expect(mockCleanupEdsResources).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });
});

describe('handleCancelStorefrontSetup — what cleanup is asked to delete', () => {
    it('tells the UI cleanup has started, before it starts', async () => {
        const context = createContext();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(context.sendMessage).toHaveBeenCalledWith('storefront-setup-progress', {
            phase: 'cancelling',
            message: 'Cleaning up resources...',
            progress: 0,
        });
    });

    it('names the repo from owner and name, and the site from the eds config', async () => {
        const context = createContext();

        await handleCancelStorefrontSetup(context, {
            partialState: repoCreated(),
            edsConfig: { daLiveOrg: 'demo-org', daLiveSite: 'demo-site' },
        });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(
            { githubRepo: 'demo-org/demo-repo', daLiveOrg: 'demo-org', daLiveSite: 'demo-site' },
            expect.anything()
        );
    });

    it('falls back to the repo URL when owner and name were never recorded', async () => {
        // Phase 1 records the URL before it records the parts; a cancel in that
        // window must still delete the right repository.
        const context = createContext();

        await handleCancelStorefrontSetup(context, {
            partialState: {
                repoCreated: true,
                contentCopied: false,
                phase: 'github-repo',
                repoUrl: 'https://github.com/demo-org/demo-repo',
            },
        });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(
            expect.objectContaining({ githubRepo: 'demo-org/demo-repo' }),
            expect.anything()
        );
    });

    it('falls back to the URL when only half the owner/name pair was recorded', async () => {
        // Both halves or neither: `demo-org/undefined` is a repo name GitHub
        // will happily 404 on, and the real repo would survive the cancel.
        const context = createContext();

        await handleCancelStorefrontSetup(context, {
            partialState: {
                repoCreated: true,
                contentCopied: false,
                phase: 'github-repo',
                repoOwner: 'demo-org',
                repoUrl: 'https://github.com/demo-org/demo-repo',
            },
        });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(
            expect.objectContaining({ githubRepo: 'demo-org/demo-repo' }),
            expect.anything()
        );
    });

    it('names no repo at all when the cancel arrived before one existed', async () => {
        // Nothing to derive a name from. Cleanup is still called — the DA.live
        // content may exist — and it skips the GitHub half on its own.
        const context = createContext();

        await handleCancelStorefrontSetup(context, {
            partialState: { repoCreated: true, contentCopied: false, phase: 'github-repo' },
        });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(
            expect.objectContaining({ githubRepo: undefined }),
            expect.anything()
        );
    });

    it('leaves the site undefined when no eds config came with the cancel', async () => {
        const context = createContext();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(
            {
                githubRepo: 'demo-org/demo-repo',
                daLiveOrg: undefined,
                daLiveSite: undefined,
            },
            expect.anything()
        );
    });

    it('deletes only what was created — repo, no content', async () => {
        const context = createContext();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(expect.anything(), {
            deleteGitHub: true,
            deleteDaLive: false,
            deleteConfigService: true,
            archiveInsteadOfDelete: false,
        });
    });

    it('deletes only what was created — content, no repo', async () => {
        // The Config Service entry is keyed off the repo, so it goes only when
        // the repo does. Archiving is for teardown, never for a cancelled setup:
        // the SC is about to retry under the same name.
        const context = createContext();

        await handleCancelStorefrontSetup(context, {
            partialState: repoCreated({ repoCreated: false, contentCopied: true }),
        });

        expect(mockCleanupEdsResources).toHaveBeenCalledWith(expect.anything(), {
            deleteGitHub: false,
            deleteDaLive: true,
            deleteConfigService: false,
            archiveInsteadOfDelete: false,
        });
    });

    it('reports success to the caller even when cleanup fails', async () => {
        // Cleanup is best effort: the webview that asked for the cancel is
        // already unmounting, so there is nobody left to show a failure to.
        mockCleanupEdsResources.mockRejectedValue(new Error('GitHub said no'));
        const context = createContext();

        const result = await handleCancelStorefrontSetup(context, {
            partialState: repoCreated(),
        });

        expect(result).toEqual({ success: true });
    });
});

describe('the cleanup service cancel builds', () => {
    it('is wired from the cached GitHub services and both token providers', async () => {
        const context = createContext();

        await handleCancelStorefrontSetup(context, { partialState: repoCreated() });

        // The repo operations come from the cache, not a fresh pair — a second
        // pair starts with a cold token-validation cache (D-2).
        expect(getGitHubServices).toHaveBeenCalledWith(context.context.secrets);
        expect(createDaLiveTokenProvider).toHaveBeenCalledWith(context.authManager);
        expect(getDaLiveAuthService).toHaveBeenCalledWith(context.context);
        expect(createDaLiveServiceTokenProvider).toHaveBeenCalledWith(DA_LIVE_AUTH_SERVICE);
        expect(mockDaLiveOrgOperationsCtor).toHaveBeenCalledWith(
            ADOBE_TOKEN_PROVIDER,
            context.logger
        );
        // Helix and the Configuration Service need the DA.live IMS token, not the
        // Adobe Console one — separate auth, and swapping them 403s mid-teardown.
        expect(mockConfigurationServiceCtor).toHaveBeenCalledWith(
            DA_LIVE_TOKEN_PROVIDER,
            context.logger
        );
        expect(mockToolManagerCtor).toHaveBeenCalledWith(COMMAND_EXECUTOR, context.logger);
        expect(mockCleanupServiceCtor).toHaveBeenCalledWith(
            REPO_OPERATIONS,
            expect.any(Object),
            expect.any(Object),
            context.logger,
            expect.any(Object)
        );
    });

    it('deletes nothing when there is no authenticated Adobe session', async () => {
        // Every downstream service needs it, so the fail-fast happens before any
        // delete is attempted rather than half way through one.
        const context = createContext({ authManager: undefined });

        const result = await handleCancelStorefrontSetup(context, {
            partialState: repoCreated(),
        });

        expect(mockCleanupServiceCtor).not.toHaveBeenCalled();
        expect(mockCleanupEdsResources).not.toHaveBeenCalled();
        expect(result).toEqual({ success: true });
    });
});
