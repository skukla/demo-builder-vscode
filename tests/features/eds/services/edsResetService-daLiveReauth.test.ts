/**
 * EDS Reset Service - DA.live Mid-Pipeline Re-Auth Tests
 *
 * Regression: When DA.live token expires during the content pipeline (steps 4-6),
 * executeEdsReset must catch DaLiveAuthError, prompt re-authentication via
 * ensureDaLiveAuth, and retry the pipeline — matching the pattern in
 * storefrontSetupPhases.ts.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';
import type { Logger } from '@/types/logger';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockEnsureDaLiveAuth = jest.fn();

jest.mock('vscode', () => ({
    window: { showWarningMessage: jest.fn(), showInformationMessage: jest.fn() },
    ProgressLocation: { Notification: 15 },
    Uri: { parse: jest.fn((url: string) => ({ toString: () => url })) },
}), { virtual: true });

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000, PREREQUISITE_CHECK: 10000 },
}));

jest.mock('@/core/constants', () => ({
    COMPONENT_IDS: { EDS_STOREFRONT: 'eds-storefront' },
}));

jest.mock('@/features/project-creation/config/demo-packages.json', () => ({
    packages: [{
        id: 'citisignal',
        storefronts: {
            'eds-paas': {
                templateOwner: 'template-owner',
                templateRepo: 'template-repo',
                contentSource: { org: 'content-org', site: 'content-site' },
            },
        },
    }],
}), { virtual: true });

jest.mock('@/features/project-creation/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    getBlockLibraryContentSource: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    getGitHubServices: jest.fn().mockReturnValue({
        tokenService: {},
        fileOperations: {
            resetRepoToTemplate: jest.fn().mockResolvedValue({ fileCount: 10, commitSha: 'abc1234567' }),
            getFileContent: jest.fn().mockResolvedValue(null),
            createOrUpdateFile: jest.fn().mockResolvedValue(undefined),
        },
    }),
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
    ensureDaLiveAuth: (...args: unknown[]) => mockEnsureDaLiveAuth(...args),
}));

jest.mock('@/features/eds/services/inspectorHelpers', () => ({
    generateInspectorTreeEntries: jest.fn().mockResolvedValue([]),
    installInspectorTagging: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({
        previewCode: jest.fn().mockResolvedValue(undefined),
    })),
}));

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        getAccessToken: jest.fn().mockResolvedValue('token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    })),
}));

const mockExecuteEdsPipeline = jest.fn();
jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: (...args: unknown[]) => mockExecuteEdsPipeline(...args),
}));

jest.mock('@/features/eds/services/storefrontStalenessDetector', () => ({
    updateStorefrontState: jest.fn(),
}));

jest.mock('@/features/eds/services/configurationService', () => ({
    ConfigurationService: jest.fn().mockImplementation(() => ({
        updateSiteConfig: jest.fn().mockResolvedValue({ success: true }),
        setFolderMapping: jest.fn().mockResolvedValue({ success: true }),
    })),
    DEFAULT_FOLDER_MAPPING: { '/products/': '/products/default' },
    buildSiteConfigParams: (owner: string, repo: string, org: string, site: string) => ({
        org: owner, site: repo, codeOwner: owner, codeRepo: repo,
        contentSourceUrl: `https://content.da.live/${org}/${site}/`,
    }),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockReturnValue({ success: true, content: '{}' }),
    extractConfigParams: jest.fn().mockReturnValue({}),
}));

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

// Mock fetch for code sync verification
global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as jest.Mock;

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { DaLiveAuthError } from '@/features/eds/services/types';
import { executeEdsReset } from '@/features/eds/services/edsResetService';

// =============================================================================
// Helpers
// =============================================================================

function createMockContext(): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn(),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            trace: jest.fn(),
        } as unknown as Logger,
        debugLogger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: {
            secrets: {},
            globalState: { get: jest.fn(), update: jest.fn() },
        } as unknown as HandlerContext['context'],
        sharedState: {},
        authManager: {
            isAuthenticated: jest.fn().mockResolvedValue(true),
            getTokenManager: jest.fn().mockReturnValue({
                getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            }),
        },
    } as unknown as HandlerContext;
}

function createProject(): Project {
    return {
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
                    daLiveSite: 'test-site',
                },
            },
        },
    } as unknown as Project;
}

function createResetParams() {
    return {
        repoOwner: 'test-owner',
        repoName: 'test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
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
        mockContext = createMockContext();
        mockExecuteEdsPipeline.mockResolvedValue({
            success: true, contentFilesCopied: 5, libraryPaths: [],
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
            createResetParams(), mockContext, mockTokenProvider,
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
            createResetParams(), mockContext, mockTokenProvider,
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
            createResetParams(), mockContext, mockTokenProvider,
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
            createResetParams(), mockContext, mockTokenProvider,
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
            createResetParams(), mockContext, mockTokenProvider,
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
            createResetParams(), mockContext, mockTokenProvider,
        );

        // Then: Should not call ensureDaLiveAuth
        expect(mockEnsureDaLiveAuth).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toContain('Network failure');
    });
});
