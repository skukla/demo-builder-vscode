/**
 * Unit tests for edsContentSetup — ensureEdsContent()
 *
 * Verifies the full DA.live setup flow for imported projects:
 * content copy, permissions, block library, EDS settings, cache purge, CDN publish.
 */

import { ensureEdsContent } from '@/features/project-creation/services/edsContentSetup';

const mockCopyContentFromSource = jest.fn();
const mockCreateBlockLibraryFromTemplate = jest.fn();
const mockCreateDaLiveTokenProvider = jest.fn();

jest.mock('@/features/eds/services/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        copyContentFromSource: mockCopyContentFromSource,
        createBlockLibraryFromTemplate: mockCreateBlockLibraryFromTemplate,
    })),
    createDaLiveTokenProvider: (...args: unknown[]) => mockCreateDaLiveTokenProvider(...args),
}));

const mockPublishAllSiteContent = jest.fn();
const mockPurgeCacheAll = jest.fn();

jest.mock('@/features/eds/services/helixService', () => ({
    HelixService: jest.fn().mockImplementation(() => ({
        publishAllSiteContent: mockPublishAllSiteContent,
        purgeCacheAll: mockPurgeCacheAll,
    })),
}));

jest.mock('@/features/eds/services/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

const mockGetUserEmail = jest.fn();
const mockGetAccessToken = jest.fn();

jest.mock('@/features/eds/services/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        getUserEmail: mockGetUserEmail,
        getAccessToken: mockGetAccessToken,
    })),
}));

const mockGetFileContent = jest.fn();

jest.mock('@/features/eds/services/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: mockGetFileContent,
    })),
}));

const mockConfigureDaLivePermissions = jest.fn();
const mockApplyDaLiveOrgConfigSettings = jest.fn();
const mockBulkPreviewAndPublish = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: (...args: unknown[]) => mockConfigureDaLivePermissions(...args),
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    bulkPreviewAndPublish: (...args: unknown[]) => mockBulkPreviewAndPublish(...args),
}));

jest.mock('@/core/utils', () => ({
    parseGitHubUrl: jest.fn((url: string) => {
        if (url === 'https://github.com/test-owner/test-repo') {
            return { owner: 'test-owner', repo: 'test-repo' };
        }
        return null;
    }),
}));

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 3000 },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function makeConfig(overrides = {}) {
    return {
        repoUrl: 'https://github.com/test-owner/test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        contentSource: { org: 'source-org', site: 'source-site' },
        ...overrides,
    };
}

function makeDeps() {
    return {
        logger: {
            info: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
        },
        secrets: {} as any,
        authManager: {
            getTokenManager: () => ({ getAccessToken: () => Promise.resolve('mock-token') }),
        },
        extensionContext: {} as any,
    };
}

function setupDefaultMocks() {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    mockCreateDaLiveTokenProvider.mockReturnValue({ getAccessToken: jest.fn() });
    mockCopyContentFromSource.mockResolvedValue({ success: true, totalFiles: 10, failedFiles: [] });
    mockGetUserEmail.mockResolvedValue('user@example.com');
    mockConfigureDaLivePermissions.mockResolvedValue({ success: true });
    mockCreateBlockLibraryFromTemplate.mockResolvedValue({ blocksCount: 3, paths: ['/library'] });
    mockApplyDaLiveOrgConfigSettings.mockResolvedValue(undefined);
    mockPurgeCacheAll.mockResolvedValue(undefined);
    mockPublishAllSiteContent.mockResolvedValue(undefined);
    mockBulkPreviewAndPublish.mockResolvedValue(undefined);
    mockGetAccessToken.mockResolvedValue('da-live-token');
}

describe('ensureEdsContent', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        setupDefaultMocks();
    });

    it('returns false when content already exists (HEAD 200)', async () => {
        mockFetch.mockResolvedValue({ ok: true, status: 200 });

        const result = await ensureEdsContent(makeConfig(), makeDeps());

        expect(result).toBe(false);
        expect(mockCopyContentFromSource).not.toHaveBeenCalled();
        expect(mockConfigureDaLivePermissions).not.toHaveBeenCalled();
    });

    it('copies content and runs all operations when content is missing', async () => {
        const config = makeConfig({
            templateOwner: 'tmpl-owner',
            templateRepo: 'tmpl-repo',
        });

        const result = await ensureEdsContent(config, makeDeps());

        expect(result).toBe(true);
        expect(mockCopyContentFromSource).toHaveBeenCalledTimes(1);
        expect(mockConfigureDaLivePermissions).toHaveBeenCalledTimes(1);
        expect(mockCreateBlockLibraryFromTemplate).toHaveBeenCalledTimes(1);
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalledTimes(1);
        expect(mockPurgeCacheAll).toHaveBeenCalledWith('test-owner', 'test-repo', 'main');
        expect(mockPublishAllSiteContent).toHaveBeenCalledWith(
            'test-owner/test-repo', 'main', 'test-org', 'test-site',
        );
        expect(mockBulkPreviewAndPublish).toHaveBeenCalledTimes(1);
    });

    it('permission failure is non-fatal', async () => {
        mockConfigureDaLivePermissions.mockRejectedValue(new Error('permission denied'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Permissions setup failed'),
        );
        // Remaining operations still ran
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalled();
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('block library failure is non-fatal', async () => {
        mockCreateBlockLibraryFromTemplate.mockRejectedValue(new Error('lib error'));
        const deps = makeDeps();
        const config = makeConfig({ templateOwner: 'o', templateRepo: 'r' });

        const result = await ensureEdsContent(config, deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Block library setup failed'),
        );
        expect(mockApplyDaLiveOrgConfigSettings).toHaveBeenCalled();
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('EDS settings failure is non-fatal', async () => {
        mockApplyDaLiveOrgConfigSettings.mockRejectedValue(new Error('settings error'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('EDS settings failed'),
        );
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('cache purge failure is non-fatal', async () => {
        mockPurgeCacheAll.mockRejectedValue(new Error('purge error'));
        const deps = makeDeps();

        const result = await ensureEdsContent(makeConfig(), deps);

        expect(result).toBe(true);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Cache purge failed'),
        );
        expect(mockPublishAllSiteContent).toHaveBeenCalled();
    });

    it('skips block library when templateOwner/templateRepo missing', async () => {
        const config = makeConfig(); // no templateOwner/templateRepo

        const result = await ensureEdsContent(config, makeDeps());

        expect(result).toBe(true);
        expect(mockCreateBlockLibraryFromTemplate).not.toHaveBeenCalled();
        expect(mockBulkPreviewAndPublish).not.toHaveBeenCalled();
    });

    it('skips block library publish when no library paths returned', async () => {
        mockCreateBlockLibraryFromTemplate.mockResolvedValue({ blocksCount: 0, paths: [] });
        const config = makeConfig({ templateOwner: 'o', templateRepo: 'r' });

        await ensureEdsContent(config, makeDeps());

        expect(mockBulkPreviewAndPublish).not.toHaveBeenCalled();
    });

    it('returns false when repo URL cannot be parsed', async () => {
        const config = makeConfig({ repoUrl: 'invalid-url' });
        const deps = makeDeps();

        const result = await ensureEdsContent(config, deps);

        expect(result).toBe(false);
        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Could not parse repo URL'),
        );
    });

    it('logs warning when no user email available for permissions', async () => {
        mockGetUserEmail.mockResolvedValue(null);
        const deps = makeDeps();

        await ensureEdsContent(makeConfig(), deps);

        expect(deps.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('No user email available'),
        );
        expect(mockConfigureDaLivePermissions).not.toHaveBeenCalled();
    });
});
