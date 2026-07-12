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
    getDaLiveAuthService: jest.fn(() => ({})),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getGitHubServices: jest.fn(() => ({
        tokenService: {},
        fileOperations: { getFileContent: jest.fn() },
    })),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
    createDaLiveServiceTokenProvider: jest.fn(() => ({ getToken: jest.fn() })),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({})),
}));

import { refreshBlockLibraryHeadless } from '@/features/eds/services/refreshBlockLibraryHeadless';
import { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
import { ensureDaLiveAuth, getGitHubServices } from '@/features/eds/handlers/edsHelpers';
import { extractResetParams } from '@/features/eds/services/edsResetParams';
import { DaLiveAuthError } from '@/features/eds/services/types';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';

const pipelineMock = executeEdsPipeline as jest.Mock;
const ensureAuthMock = ensureDaLiveAuth as jest.Mock;
const extractParamsMock = extractResetParams as jest.Mock;
const getGitHubServicesMock = getGitHubServices as jest.Mock;

function makeLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    } as unknown as Logger;
}

const PROJECT = { name: 'Demo', path: '/p' } as unknown as Project;

function deps(overrides: Record<string, unknown> = {}) {
    return {
        project: PROJECT,
        context: {} as never,
        logger: makeLogger(),
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
        expect(params.skipPublish).toBe(false);
        expect(params.blockCollectionIds).toEqual([]);

        expect(result).toEqual({
            success: true,
            libraryPaths: ['/.da/library/blocks/hero'],
        });
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
            .mockRejectedValueOnce(new DaLiveAuthError())
            .mockResolvedValueOnce({ success: true, libraryPaths: ['/.da/library/blocks/hero'] });
        ensureAuthMock.mockResolvedValueOnce({ authenticated: true });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(pipelineMock).toHaveBeenCalledTimes(2);
        expect(ensureAuthMock).toHaveBeenCalledTimes(1);
        expect(result.success).toBe(true);
    });

    it('returns a cancelled result when the user declines re-auth', async () => {
        pipelineMock.mockRejectedValueOnce(new DaLiveAuthError());
        ensureAuthMock.mockResolvedValueOnce({ authenticated: false, cancelled: true });

        const result = await refreshBlockLibraryHeadless(deps());

        expect(result.success).toBe(false);
        expect(result.cancelled).toBe(true);
        expect(pipelineMock).toHaveBeenCalledTimes(1);
    });
});
