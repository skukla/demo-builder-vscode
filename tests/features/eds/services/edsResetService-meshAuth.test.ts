/**
 * EDS Reset Service - Mesh Redeployment Auth Tests
 *
 * Regression: redeployApiMesh must call ensureAdobeIOAuth BEFORE setting
 * Adobe CLI context (selectOrganization/selectProject/selectWorkspace).
 * Without this, a token that expires during the ~2-minute reset pipeline
 * causes the Adobe CLI to open a browser window for re-authentication.
 */

import type { Project } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks — defined before imports
// =============================================================================

const mockEnsureAdobeIOAuth = jest.fn();
jest.mock('@/core/auth/adobeAuthGuard', () => ({
    ensureAdobeIOAuth: (...args: unknown[]) => mockEnsureAdobeIOAuth(...args),
}));

const mockSelectOrganization = jest.fn().mockResolvedValue(undefined);
const mockSelectProject = jest.fn().mockResolvedValue(undefined);
const mockSelectWorkspace = jest.fn().mockResolvedValue(undefined);
const mockIsAuthenticated = jest.fn().mockResolvedValue(true);

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

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(() => ({
            isAuthenticated: mockIsAuthenticated,
            selectOrganization: mockSelectOrganization,
            selectProject: mockSelectProject,
            selectWorkspace: mockSelectWorkspace,
            loginAndRestoreProjectContext: jest.fn().mockResolvedValue(true),
        })),
        getCommandExecutor: jest.fn(() => ({})),
    },
}));

jest.mock('@/types/typeGuards', () => ({
    getMeshComponentInstance: jest.fn((project: any) => {
        if (!project?.componentInstances) return undefined;
        return Object.values(project.componentInstances).find(
            (c: any) => c.subType === 'mesh',
        );
    }),
    hasEntries: jest.fn((obj: any) => obj && Object.keys(obj).length > 0),
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
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/services/fstabGenerator', () => ({
    generateFstabContent: jest.fn().mockReturnValue('mock-fstab'),
}));

jest.mock('@/features/eds/services/configGenerator', () => ({
    generateConfigJson: jest.fn().mockReturnValue({ success: true, content: '{}' }),
    extractConfigParams: jest.fn().mockReturnValue({}),
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
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

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn().mockResolvedValue({
        success: true, contentFilesCopied: 5, libraryPaths: [],
    }),
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

jest.mock('@/features/mesh/services/meshDeployment', () => ({
    deployMeshComponent: jest.fn().mockResolvedValue({
        success: true,
        data: { endpoint: 'https://mesh.example.com/graphql', meshId: 'mesh-123' },
    }),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    updateMeshState: jest.fn(),
}));

// Mock fetch for placeholder files
global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { executeEdsReset } from '@/features/eds/services/edsResetService';

// =============================================================================
// Helpers
// =============================================================================

function createProjectWithMesh(): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        selectedBlockLibraries: [],
        adobe: {
            organization: 'org-123',
            projectId: 'proj-456',
            workspace: 'ws-789',
        },
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
            'commerce-mesh': {
                id: 'commerce-mesh',
                name: 'API Mesh',
                subType: 'mesh',
                path: '/test/mesh',
                status: 'deployed',
                metadata: { meshId: 'mesh-123' },
            },
        },
    } as unknown as Project;
}

function createMockContext(): HandlerContext {
    return {
        panel: { webview: { postMessage: jest.fn() } } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(null),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        debugLogger: {
            info: jest.fn(), debug: jest.fn(), error: jest.fn(), warn: jest.fn(),
        } as unknown as HandlerContext['debugLogger'],
        sendMessage: jest.fn(),
        context: { secrets: {} },
        sharedState: {},
        authManager: {
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        },
    } as unknown as HandlerContext;
}

const mockTokenProvider = { getAccessToken: jest.fn().mockResolvedValue('mock-token') };

// =============================================================================
// Tests
// =============================================================================

describe('EDS Reset Service - Mesh Redeployment Auth', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: auth succeeds
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    });

    it('should call ensureAdobeIOAuth before setting Adobe context for mesh redeployment', async () => {
        // Given: Project with mesh component and redeployMesh enabled
        const project = createProjectWithMesh();
        const context = createMockContext();
        const callOrder: string[] = [];

        mockEnsureAdobeIOAuth.mockImplementation(async () => {
            callOrder.push('ensureAdobeIOAuth');
            return { authenticated: true };
        });
        mockSelectOrganization.mockImplementation(async () => {
            callOrder.push('selectOrganization');
        });

        // When: Executing reset with mesh redeployment
        await executeEdsReset(
            {
                repoOwner: 'test-owner', repoName: 'test-repo',
                daLiveOrg: 'test-org', daLiveSite: 'test-site',
                templateOwner: 'template-owner', templateRepo: 'template-repo',
                project, redeployMesh: true,
            },
            context, mockTokenProvider,
        );

        // Then: ensureAdobeIOAuth should be called BEFORE selectOrganization
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledTimes(1);
        expect(callOrder.indexOf('ensureAdobeIOAuth')).toBeLessThan(
            callOrder.indexOf('selectOrganization'),
        );
    });

    it('should pass project adobe context to ensureAdobeIOAuth', async () => {
        // Given: Project with Adobe org/project/workspace
        const project = createProjectWithMesh();
        const context = createMockContext();

        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });

        // When
        await executeEdsReset(
            {
                repoOwner: 'test-owner', repoName: 'test-repo',
                daLiveOrg: 'test-org', daLiveSite: 'test-site',
                templateOwner: 'template-owner', templateRepo: 'template-repo',
                project, redeployMesh: true,
            },
            context, mockTokenProvider,
        );

        // Then: Should pass project context for loginAndRestoreProjectContext
        expect(mockEnsureAdobeIOAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                projectContext: expect.objectContaining({
                    organization: 'org-123',
                    projectId: 'proj-456',
                    workspace: 'ws-789',
                }),
                warningMessage: expect.stringContaining('expired'),
            }),
        );
    });

    it('should return partial success when auth fails during mesh redeployment', async () => {
        // Given: Auth fails (user cancelled or token expired)
        const project = createProjectWithMesh();
        const context = createMockContext();

        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        // When
        const result = await executeEdsReset(
            {
                repoOwner: 'test-owner', repoName: 'test-repo',
                daLiveOrg: 'test-org', daLiveSite: 'test-site',
                templateOwner: 'template-owner', templateRepo: 'template-repo',
                project, redeployMesh: true,
            },
            context, mockTokenProvider,
        );

        // Then: Should return partial success (reset completed, mesh failed)
        expect(result.success).toBe(true);
        expect(result.meshRedeployed).toBe(false);
        expect(result.error).toContain('authentication');
        expect(result.errorType).toBe('MESH_REDEPLOY_FAILED');

        // And: Should NOT call selectOrganization (auth failed before it)
        expect(mockSelectOrganization).not.toHaveBeenCalled();
    });

    it('should not call ensureAdobeIOAuth when redeployMesh is false', async () => {
        // Given: Project with mesh but redeployMesh disabled
        const project = createProjectWithMesh();
        const context = createMockContext();

        // When
        await executeEdsReset(
            {
                repoOwner: 'test-owner', repoName: 'test-repo',
                daLiveOrg: 'test-org', daLiveSite: 'test-site',
                templateOwner: 'template-owner', templateRepo: 'template-repo',
                project, redeployMesh: false,
            },
            context, mockTokenProvider,
        );

        // Then: ensureAdobeIOAuth should NOT be called (mesh step skipped)
        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
    });
});
