/**
 * The mock wall the two BLOCK-LIBRARY suites share, and only those two.
 *
 * `storefrontSetupPhases` has four suites. All four declare the same six module
 * mocks, but the BODIES only agree in pairs: customBlockLibraries and tracking
 * are byte-identical across all six, while configService and recovery each differ. So this file serves the pair, not the family — the family harness
 * (`storefrontSetupPhases.testUtils.ts`) keeps what all four agree on.
 *
 * IT TESTS A CLAIM. The family harness records that four of these "cannot move"
 * because the SPEC imports them, citing a deployMesh family that lost 23 tests
 * trying. The rule behind that is real — `jest.mock` hoists above the imports of
 * the module it appears in, not across modules — but the conclusion was one step
 * too strong. A mock CAN live here provided this file is imported before the
 * spec's own import of the mocked module, because requiring this module runs its
 * hoisted registrations at that moment. The handles are re-exported below so a
 * spec need not import the real module at all, which removes the ordering
 * question entirely.
 */

jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: { QUICK: 5000, NORMAL: 30000, UI: { MIN_LOADING: 200 } },
}));

jest.mock('@/features/eds/services/blockCollectionHelpers', () => ({
    installBlockCollections: jest.fn(),
}));

jest.mock('@/features/components/services/blockLibraryLoader', () => ({
    getBlockLibrarySource: jest.fn(),
    getBlockLibraryName: jest.fn(),
    isBlockLibraryAvailableForPackage: jest.fn().mockReturnValue(true),
}));

jest.mock('@/features/eds/services/edsPipeline', () => ({
    executeEdsPipeline: jest.fn().mockResolvedValue({
        success: true,
        contentFilesCopied: 0,
        libraryPaths: [],
    }),
}));

jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    configureDaLivePermissions: jest.fn().mockResolvedValue({ success: true }),
    ensureDaLiveAuth: jest.fn().mockResolvedValue({ authenticated: true }),
    getDaLiveAuthService: jest.fn().mockReturnValue({
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getUserEmail: jest.fn().mockResolvedValue('test@example.com'),
    }),
}));

jest.mock('@/features/eds/services/github/githubRepoOperations', () => ({
    GitHubRepoOperations: jest.fn().mockImplementation(() => ({
        createFromTemplate: jest.fn().mockResolvedValue({
            fullName: 'owner/repo',
            htmlUrl: 'https://github.com/owner/repo',
        }),
        waitForContent: jest.fn().mockResolvedValue(undefined),
    })),
}));

// Below the factories on purpose — they hoist above these, so each handle a spec
// drives is already the mocked one. `import/first` is not a registered rule here.
export { installBlockCollections } from '@/features/eds/services/blockCollectionHelpers';
export {
    getBlockLibrarySource,
    getBlockLibraryName,
    isBlockLibraryAvailableForPackage,
} from '@/features/components/services/blockLibraryLoader';
export { executeEdsPipeline } from '@/features/eds/services/edsPipeline';
