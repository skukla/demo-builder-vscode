/**
 * Shared harness for the ensureEdsContent suites (`edsContentSetup.test.ts`,
 * `edsContentSetup-blockLibrary.test.ts`).
 *
 * The mock preamble and the SUT import live together HERE on purpose:
 * `babel-plugin-jest-hoist` lifts `jest.mock` above the imports of the module it appears in,
 * not across modules, so a spec importing `edsContentSetup` directly would bind it to the real
 * collaborators before these mocks registered. Specs import `ensureEdsContent` from this file.
 * Split from `edsContentSetup.test.ts` (2026-11-23) when it passed the 750-line test cap.
 */

import { ensureEdsContent } from '@/features/project-creation/services/edsContentSetup';
import type { EdsContentHelix } from '@/features/project-creation/services/edsContentSetup';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../helpers/extensionContextFake';

export { ensureEdsContent };

export const mockCopyContentFromSource = jest.fn();
export const mockWriteStorefrontBlockLibrary = jest.fn();
export const mockGetBlocksWithDocs = jest.fn();
export const mockOverlayAccountChrome = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveContentOperations', () => ({
    DaLiveContentOperations: jest.fn().mockImplementation(() => ({
        copyOps: {
            copyContentFromSource: mockCopyContentFromSource,
            overlayAccountChrome: mockOverlayAccountChrome,
        },
        blockLibOps: {
            getBlocksWithDocs: mockGetBlocksWithDocs,
            readBlockDocPage: jest.fn().mockResolvedValue(undefined),
            readBlocksSheetRows: jest.fn().mockResolvedValue(null),
            writeStorefrontBlockLibrary: mockWriteStorefrontBlockLibrary,
        },
    })),
}));
jest.mock('@/features/eds/services/daLive/daLiveTokenProviders', () => ({
    createDaLiveServiceTokenProvider: jest
        .fn()
        .mockImplementation((service: { getAccessToken: () => Promise<string> }) => ({
            getAccessToken: () => service.getAccessToken(),
        })),
}));

export const mockPublishAllSiteContent = jest.fn();
export const mockPurgeCacheAll = jest.fn();

export const mockPreviewAndPublishPage = jest.fn();
export const mockGetResourceStatus = jest.fn();

// HelixService is NOT module-mocked. It arrives through the `makeHelix` seam on
// EdsContentDeps, typed to the four calls this function makes — two of its own and
// two it forwards to the block-library helpers.
export const helixSeam: EdsContentHelix = {
    publishAllSiteContent: mockPublishAllSiteContent,
    purgeCacheAll: mockPurgeCacheAll,
    previewAndPublishPage: mockPreviewAndPublishPage,
    getResourceStatus: mockGetResourceStatus,
};

jest.mock('@/features/eds/services/github/githubTokenService', () => ({
    GitHubTokenService: jest.fn().mockImplementation(() => ({})),
}));

// The subject now asks the service cache instead of constructing its own token
// service. This delegates to the SAME mocked class above, so the suite's
// behaviour is unchanged — only the route to it is.
jest.mock('@/features/eds/handlers/edsServiceCache', () => ({
    getGitHubServices: jest.fn(() => {
        const { GitHubTokenService } = jest.requireMock(
            '@/features/eds/services/github/githubTokenService'
        );
        return { tokenService: new GitHubTokenService() };
    }),
}));

export const mockGetUserEmail = jest.fn();
export const mockGetAccessToken = jest.fn();

jest.mock('@/features/eds/services/daLive/daLiveAuthService', () => ({
    DaLiveAuthService: jest.fn().mockImplementation(() => ({
        getUserEmail: mockGetUserEmail,
        getAccessToken: mockGetAccessToken,
    })),
}));

export const mockGetFileContent = jest.fn();
export const mockListRepoFiles = jest.fn();

jest.mock('@/features/eds/services/github/githubFileOperations', () => ({
    GitHubFileOperations: jest.fn().mockImplementation(() => ({
        getFileContent: mockGetFileContent,
        listRepoFiles: mockListRepoFiles,
    })),
}));

export const mockConfigureDaLivePermissions = jest.fn();
export const mockApplyDaLiveOrgConfigSettings = jest.fn();
export const mockPublishLibraryPaths = jest.fn();
export const mockPublishSheetPaths = jest.fn();

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: (...args: unknown[]) => mockConfigureDaLivePermissions(...args),
    applyDaLiveOrgConfigSettings: (...args: unknown[]) => mockApplyDaLiveOrgConfigSettings(...args),
    publishLibraryPaths: (...args: unknown[]) => mockPublishLibraryPaths(...args),
    publishSheetPaths: (...args: unknown[]) => mockPublishSheetPaths(...args),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: mockGetAccessToken,
        getUserEmail: mockGetUserEmail,
    }),
}));

jest.mock('@/core/utils/githubUrlParser', () => ({
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
export const mockFetch = jest.fn();
global.fetch = mockFetch;

export function makeConfig(overrides = {}) {
    return {
        repoUrl: 'https://github.com/test-owner/test-repo',
        daLiveOrg: 'test-org',
        daLiveSite: 'test-site',
        contentSource: { org: 'source-org', site: 'source-site', indexPath: '/full-index.json' },
        blockLibraries: [] as string[],
        ...overrides,
    };
}

export function makeDeps() {
    return {
        logger: createMockLogger(),
        secrets: createMockSecretStorage().secrets,
        extensionContext: createMockExtensionContext(),
        makeHelix: () => helixSeam,
        readCodePaths: mockReadCodePaths,
    };
}

export const mockReadCodePaths = jest.fn();

export function setupDefaultMocks() {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    mockCopyContentFromSource.mockResolvedValue({ success: true, totalFiles: 10, failedFiles: [], sheetPaths: [] });
    mockGetUserEmail.mockResolvedValue('user@example.com');
    mockConfigureDaLivePermissions.mockResolvedValue({ success: true });
    mockWriteStorefrontBlockLibrary.mockResolvedValue({ success: true, blocksCount: 3, paths: ['/library'] });
    mockGetBlocksWithDocs.mockResolvedValue([]);
    mockListRepoFiles.mockResolvedValue([{ path: 'blocks/hero/hero.js', type: 'blob', sha: 'h' }]);
    mockGetFileContent.mockResolvedValue(null);
    mockApplyDaLiveOrgConfigSettings.mockResolvedValue(undefined);
    mockPurgeCacheAll.mockResolvedValue(undefined);
    mockPreviewAndPublishPage.mockResolvedValue(undefined);
    mockGetResourceStatus.mockResolvedValue({ httpStatus: 200 });
    mockPublishAllSiteContent.mockResolvedValue(undefined);
    mockPublishLibraryPaths.mockResolvedValue(undefined);
    mockPublishSheetPaths.mockResolvedValue({ published: 0, failed: 0 });
    mockGetAccessToken.mockResolvedValue('da-live-token');
    mockReadCodePaths.mockResolvedValue(undefined);
    mockOverlayAccountChrome.mockResolvedValue({ success: true, totalFiles: 4, failedFiles: [] });
}
