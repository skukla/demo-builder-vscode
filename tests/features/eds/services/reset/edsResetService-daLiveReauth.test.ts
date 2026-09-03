/**
 * EDS Reset Service - DA.live Mid-Pipeline Re-Auth Tests
 *
 * Regression: When DA.live token expires during the content pipeline (steps 4-6),
 * executeEdsReset must catch DaLiveAuthError, prompt re-authentication via
 * ensureDaLiveAuth, and retry the pipeline — matching the pattern in
 * storefrontSetupPhases.ts.
 */

import { mockEnsureDaLiveAuth } from './edsResetService.sharedMocks';

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

const mockExecuteEdsPipeline = jest.fn();
jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: (...args: unknown[]) => mockExecuteEdsPipeline(...args),
}));

// NOT mocked, and it does not need to be: the collaborator is constructed on this
// path and never touched, so the mock silenced nothing. Measured 2026-08-31 by
// stripping it and re-running this suite.

// Mock fetch for code sync verification
global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { DaLiveAuthError } from '@/features/eds/services/types';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { createResetContext, meshDeps } from './edsResetService.testUtils';
import { createMockProject } from '../../../../helpers/projectFake';

// =============================================================================
// Helpers
// =============================================================================

function createProject(): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        selectedBlockLibraries: [],
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-repo',
                },
            },
        },
    });
}

function createResetParams() {
    return {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-repo',
        templateOwner: 'template-owner',
        templateRepo: 'template-repo',
        contentSource: { org: 'content-org', site: 'content-site' },
        project: createProject(),
    };
}

const mockTokenProvider = {
    getAccessToken: jest.fn().mockResolvedValue('mock-da-token'),
};

// =============================================================================
// Tests
// =============================================================================

describe('executeEdsReset - DA.live Mid-Pipeline Re-Auth', () => {
    let mockContext: HandlerContext;

    beforeEach(() => {
        jest.clearAllMocks();
        mockContext = createResetContext();
        mockExecuteEdsPipeline.mockResolvedValue({
            success: true,
            contentFilesCopied: 5,
            libraryPaths: [],
        });
    });

    it('should call ensureDaLiveAuth when pipeline throws DaLiveAuthError', async () => {
        // Given: Pipeline throws DaLiveAuthError on first attempt, succeeds on retry
        mockExecuteEdsPipeline
            .mockRejectedValueOnce(new DaLiveAuthError('DA.live token expired'))
            .mockResolvedValueOnce({ success: true, contentFilesCopied: 5, libraryPaths: [] });

        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeEdsReset(
            createResetParams(),
            mockContext,
            mockTokenProvider,
            meshDeps
        );

        // Then: ensureDaLiveAuth should have been called
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(mockContext, '[EdsReset]');
        expect(result.success).toBe(true);
    });

    it('should retry pipeline after successful re-auth', async () => {
        // Given: First pipeline call fails, second succeeds
        mockExecuteEdsPipeline
            .mockRejectedValueOnce(new DaLiveAuthError('Token expired'))
            .mockResolvedValueOnce({ success: true, contentFilesCopied: 10, libraryPaths: [] });

        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeEdsReset(
            createResetParams(),
            mockContext,
            mockTokenProvider,
            meshDeps
        );

        // Then: Pipeline should have been called twice
        expect(mockExecuteEdsPipeline).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(true);
    });

    it('should return error when re-auth is cancelled', async () => {
        // Given: Pipeline fails with auth error, user cancels re-auth
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('Token expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        // When
        const result = await executeEdsReset(
            createResetParams(),
            mockContext,
            mockTokenProvider,
            meshDeps
        );

        // Then: Should return failure (not crash)
        expect(result.success).toBe(false);
        expect(result.error).toContain('cancelled');
    });

    it('should return error when re-auth fails', async () => {
        // Given: Pipeline fails with auth error, re-auth fails
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('Token expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: false, error: 'Token invalid' });

        // When
        const result = await executeEdsReset(
            createResetParams(),
            mockContext,
            mockTokenProvider,
            meshDeps
        );

        // Then
        expect(result.success).toBe(false);
        expect(result.error).toContain('re-authentication failed');
    });

    it('should give up after MAX_REAUTH_ATTEMPTS (2)', async () => {
        // Given: Pipeline always fails with auth error
        mockExecuteEdsPipeline.mockRejectedValue(new DaLiveAuthError('Token expired'));
        mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });

        // When
        const result = await executeEdsReset(
            createResetParams(),
            mockContext,
            mockTokenProvider,
            meshDeps
        );

        // Then: Should have attempted re-auth twice, then failed
        expect(mockEnsureDaLiveAuth).toHaveBeenCalledTimes(2);
        expect(result.success).toBe(false);
    });

    it('should propagate non-auth errors normally', async () => {
        // Given: Pipeline throws a regular error
        mockExecuteEdsPipeline.mockRejectedValue(new Error('Network failure'));

        // When
        const result = await executeEdsReset(
            createResetParams(),
            mockContext,
            mockTokenProvider,
            meshDeps
        );

        // Then: Should not call ensureDaLiveAuth
        expect(mockEnsureDaLiveAuth).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network failure');
    });
});
