/**
 * refreshBlockLibraryHeadless — the shared, UI-free block-library rebuild core.
 * Exercises the pipeline flags, the real result pass-through, the DA.live
 * re-auth retry, and the cancelled/failure result shapes.
 */

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn(),
}));

// DaLiveAuthError is referenced for the auth-retry branch; defined inside the
// factory because jest.mock is hoisted above all top-level code.
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
    getDaLiveAuthService: jest.fn(() => ({})),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getGitHubServices: jest.fn(() => ({
        tokenService: {},
        fileOperations: { getFileContent: jest.fn() },
    })),
}));

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getToken: jest.fn() })),
}));

import type { HelixService } from '@/features/eds/services/helix/helixService';
import { refreshBlockLibraryHeadless } from '@/features/eds/services/refreshBlockLibraryHeadless';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { ensureDaLiveAuth, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { extractResetParams } from '@/features/eds/services/reset/edsResetParams';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

const pipelineMock = executeEdsPipeline as jest.Mock;
const ensureAuthMock = ensureDaLiveAuth as jest.Mock;
const extractParamsMock = extractResetParams as jest.Mock;
const getGitHubServicesMock = getGitHubServices as jest.Mock;

function makeLogger(): Logger {
    return createMockLogger() as unknown as Logger;
}

const PROJECT = createMockProject({ name: 'Demo', path: '/p' });

/**
 * Helix arrives through the deps object rather than by mocking the module. The old
 * mock returned `() => ({})` and asserted nothing — it existed only so the real
 * constructor would not run, which is the definition of a module wall (ADR-016).
 * Nothing in this file reads the service; the pipeline it is forwarded to is itself
 * faked, so an empty object typed at the seam is honest about that.
 */
const fakeHelix = {} as unknown as HelixService;

function deps(overrides: Record<string, unknown> = {}) {
    return {
        project: PROJECT,
        context: createMockExtensionContext(),
        logger: makeLogger(),
        helixService: fakeHelix,
        ...overrides,
    };
}

describe('refreshBlockLibraryHeadless', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        extractParamsMock.mockReturnValue({
            success: true,
            params: {
                repoOwner: 'demo-org',
                repoName: 'demo-repo',
                daLiveOrg: 'demo-org',
                daLiveSite: 'demo-site',
                templateOwner: 'template-org',
                templateRepo: 'template-repo',
            },
        });
        getGitHubServicesMock.mockReturnValue({
            tokenService: {},
            fileOperations: { getFileContent: jest.fn() },
        });
        pipelineMock.mockResolvedValue({
            success: true,
            contentFilesCopied: 0,
            libraryPaths: ['/.da/library/blocks/hero'],
        });
    });

    it('runs the library-only pipeline and returns the real result', async () => {
        const result = await refreshBlockLibraryHeadless(deps());

        expect(pipelineMock).toHaveBeenCalledTimes(1);
        const params = pipelineMock.mock.calls[0][0];
        expect(params.includeBlockLibrary).toBe(true);
        expect(params.skipContent).toBe(true);
        // The site's pages are untouched by a block list change; the library's own
        // pages publish whatever this says (2026-10-15).
        expect(params.skipPublish).toBe(true);
        expect(params.blockCollectionIds).toStrictEqual([]);
        // The full rebuild: every doc page, unless a caller names the blocks it added.
        expect(params).not.toHaveProperty('publishLibraryBlocksOnly');

        expect(result).toEqual({
            success: true,
            libraryPaths: ['/.da/library/blocks/hero'],
        });
    });

    it('publishes only the blocks a caller names, when it names them', async () => {
        await refreshBlockLibraryHeadless({ ...deps(), publishOnlyBlocks: ['cards', 'hero'] });

        expect(pipelineMock.mock.calls[0][0].publishLibraryBlocksOnly).toEqual(['cards', 'hero']);
    });

    it('forwards pipeline progress through onProgress', async () => {
        const onProgress = jest.fn();
        await refreshBlockLibraryHeadless(deps({ onProgress }));

        const reportProgress = pipelineMock.mock.calls[0][2];
        reportProgress({ operation: 'block-library', message: 'configuring...' });
        expect(onProgress).toHaveBeenCalledWith('configuring...');
    });

    it('returns an error when param extraction fails (non-EDS/misconfigured)', async () => {
        extractParamsMock.mockReturnValueOnce({ success: false, error: 'not an EDS project' });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result.success).toBe(false);
        expect(result.error).toContain('not an EDS project');
        expect(pipelineMock).not.toHaveBeenCalled();
    });

    it('surfaces a pipeline failure as an error result', async () => {
        pipelineMock.mockResolvedValueOnce({ success: false, error: 'publish failed' });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result.success).toBe(false);
        expect(result.error).toContain('publish failed');
    });

    it('retries once after DaLiveAuthError, then succeeds', async () => {
        pipelineMock
            .mockRejectedValueOnce(new DaLiveAuthError('DA.live authentication expired'))
            .mockResolvedValueOnce({ success: true, libraryPaths: ['/.da/library/blocks/hero'] });
        ensureAuthMock.mockResolvedValueOnce({ authenticated: true });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(pipelineMock).toHaveBeenCalledTimes(2);
        expect(ensureAuthMock).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('returns the re-auth failure reason when the re-auth itself fails', async () => {
        pipelineMock.mockRejectedValueOnce(new DaLiveAuthError('DA.live authentication expired'));
        ensureAuthMock.mockResolvedValueOnce({ authenticated: false, error: 'IMS refused' });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result).toEqual({
            success: false,
            error: 'DA.live re-authentication failed: IMS refused',
        });
        expect(result.cancelled).toBeUndefined();
        expect(pipelineMock).toHaveBeenCalledTimes(1);
    });

    // Only a DA.live token expiry is retryable. Anything else is the caller's
    // answer straight away — retrying it would run the destructive rebuild a
    // second time and then prompt for a sign-in that has nothing to do with the
    // failure.
    it('does not retry a failure that is not a DA.live token expiry', async () => {
        pipelineMock.mockRejectedValueOnce(new Error('GitHub rate limit exceeded'));

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result).toEqual({ success: false, error: 'GitHub rate limit exceeded' });
        expect(pipelineMock).toHaveBeenCalledTimes(1);
        expect(ensureAuthMock).not.toHaveBeenCalled();
    });

    it('reports a thrown non-Error as an unknown failure', async () => {
        pipelineMock.mockRejectedValueOnce('a string, not an Error');

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result).toEqual({ success: false, error: 'Unknown error' });
    });

    // The retry is bounded at ONE. A second expiry gives up rather than looping
    // the SC through re-authentication for as long as the token keeps dying.
    it('gives up after the single retry rather than re-authenticating again', async () => {
        pipelineMock
            .mockRejectedValueOnce(new DaLiveAuthError('expired'))
            .mockRejectedValueOnce(new DaLiveAuthError('expired again'));
        ensureAuthMock.mockResolvedValue({ authenticated: true });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result).toEqual({ success: false, error: 'expired again' });
        expect(pipelineMock).toHaveBeenCalledTimes(2);
        expect(ensureAuthMock).toHaveBeenCalledTimes(1);
    });

    // The command passes onProgress; the MCP tool does not. Progress arriving
    // for a caller that asked for none must pass silently rather than take the
    // whole refresh into the catch.
    it('survives pipeline progress when the caller wants none', async () => {
        await refreshBlockLibraryHeadless(deps({ onProgress: undefined }));

        const reportProgress = pipelineMock.mock.calls[0][2];
        expect(() => reportProgress({ operation: 'block-library', message: 'configuring...' })).not.toThrow();
    });

    it('returns a cancelled result when the user declines re-auth', async () => {
        pipelineMock.mockRejectedValueOnce(new DaLiveAuthError('DA.live authentication expired'));
        ensureAuthMock.mockResolvedValueOnce({ authenticated: false, cancelled: true });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);
        expect(pipelineMock).toHaveBeenCalledTimes(1);
    });
});

/**
 * The step each pipeline message belongs to (progress vocabulary slice 2, owner
 * 2026-10-16). Refresh Blocks is three steps an SC can name; its messages are what
 * each is doing, the line under it.
 */
describe('refreshBlockLibraryHeadless — its steps', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        ensureAuthMock.mockResolvedValue({ authenticated: true });
    });

    /** The pipeline as it runs a library-only rebuild, by the operations it reports. */
    function pipelineReporting(messages: Array<{ operation: string; message: string }>): void {
        pipelineMock.mockImplementation(
            async (_params: unknown, _services: unknown, onProgress: (info: { operation: string; message: string }) => void) => {
                messages.forEach((info) => onProgress(info));
                return { success: true, contentFilesCopied: 0, libraryPaths: ['/.da/library/blocks.json'] };
            },
        );
    }

    it('puts each message under the step its operation is', async () => {
        pipelineReporting([
            { operation: 'block-library', message: 'Building block library' },
            { operation: 'block-library', message: 'Building block library: 5 blocks' },
            { operation: 'eds-settings', message: 'Applying DA.live settings' },
            { operation: 'library-publish', message: 'Publishing the block list: 2 pages' },
            { operation: 'library-publish', message: 'Publishing the block list: checking it is live' },
        ]);
        const onStep = jest.fn();

        await refreshBlockLibraryHeadless(deps({ onStep }));

        expect(onStep.mock.calls).toStrictEqual([
            ['Building block library', 'Building block library'],
            ['Building block library', 'Building block library: 5 blocks'],
            ['Applying DA.live settings', 'Applying DA.live settings'],
            ['Publishing the block list', 'Publishing the block list: 2 pages'],
            ['Publishing the block list', 'Publishing the block list: checking it is live'],
        ]);
    });

    // A step it does not name (a code patch, brand assets) is part of the one before.
    it('keeps a message of an operation it does not name under the step before it', async () => {
        pipelineReporting([
            { operation: 'block-library', message: 'Building block library' },
            { operation: 'block-code-patches', message: 'Patching 2 blocks' },
        ]);
        const onStep = jest.fn();

        await refreshBlockLibraryHeadless(deps({ onStep }));

        expect(onStep).toHaveBeenLastCalledWith('Building block library', 'Patching 2 blocks');
    });

    it('says the DA.live sign-in ran out under the step it ran out in', async () => {
        pipelineMock
            .mockImplementationOnce(
                async (_p: unknown, _s: unknown, onProgress: (info: { operation: string; message: string }) => void) => {
                    onProgress({ operation: 'eds-settings', message: 'Applying DA.live settings' });
                    throw new DaLiveAuthError('DA.live token expired');
                },
            )
            .mockResolvedValueOnce({ success: true, contentFilesCopied: 0, libraryPaths: [] });
        const onStep = jest.fn();

        await refreshBlockLibraryHeadless(deps({ onStep }));

        expect(onStep).toHaveBeenCalledWith(
            'Applying DA.live settings',
            'DA.live session expired. Please re-authenticate',
        );
    });

    // Configure's Republish shows the whole rebuild under its own step and reads the
    // plain messages, as it did.
    it('still hands every plain message to onProgress', async () => {
        pipelineReporting([{ operation: 'block-library', message: 'Building block library: 5 blocks' }]);
        const onProgress = jest.fn();

        await refreshBlockLibraryHeadless(deps({ onProgress }));

        expect(onProgress.mock.calls).toStrictEqual([['Building block library: 5 blocks']]);
    });
});
